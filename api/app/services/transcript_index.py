import os
import re
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Set


# commit() routes each queued write into an ordered phase by matching its SQL.
# Tolerant of `INSERT OR REPLACE` and extra whitespace: a brittle startswith that
# silently mis-routed would break DELETE-before-INSERT ordering.  (An explicit
# per-statement phase tag would be cleaner, but execute() must stay drop-in
# compatible with sqlite3.Connection.execute, which takes no such argument.)
_SEGMENT_INSERT_RE = re.compile(
    r"^\s*INSERT(\s+OR\s+\w+)?\s+INTO\s+transcript_segments\b", re.IGNORECASE
)
_META_INSERT_RE = re.compile(
    r"^\s*INSERT(\s+OR\s+\w+)?\s+INTO\s+indexed_transcripts\b", re.IGNORECASE
)

from .youtube import (
    DEVANAGARI_TOKEN_RE,
    MIXED_TOKEN_RE,
    _normalize_text,
    _phonetic_key,
    _romanize_devanagari,
    normalize_language_code,
)


def _is_remote() -> bool:
    return bool(os.getenv("TURSO_DATABASE_URL"))


# ---------------------------------------------------------------------------
# Turso HTTP API v2 adapter
# Reads execute immediately; writes are batched and sent on commit().
# ---------------------------------------------------------------------------

def _encode_value(val: Any) -> dict:
    if val is None:
        return {"type": "null", "value": None}
    if isinstance(val, bool):
        return {"type": "integer", "value": str(int(val))}
    if isinstance(val, int):
        # Integers are string-encoded because i64 can overflow JSON Number
        # precision; Turso v2 spec keeps them as strings on purpose.
        return {"type": "integer", "value": str(val)}
    if isinstance(val, float):
        # Floats are NUMBER-encoded per the v2 spec — Turso rejects string
        # form with `JSON parse error: invalid type: string "0.0", expected
        # f64`. This was the actual root cause of the index_transcript 500
        # cascade (mistakenly blamed on YouTube quota during the 5/20
        # incident); every transcript with a 0.0 start/duration tripped it.
        return {"type": "float", "value": val}
    return {"type": "text", "value": str(val)}


def _decode_value(cell: dict) -> Any:
    t = cell.get("type")
    v = cell.get("value")
    if t == "null" or v is None:
        return None
    if t == "integer":
        return int(v)
    if t in ("float", "real"):
        return float(v)
    return v


class _TursoCursor:
    def __init__(self, result: dict):
        cols = [col["name"] for col in result.get("cols", [])]
        self._rows = [
            {col: _decode_value(cell) for col, cell in zip(cols, row)}
            for row in result.get("rows", [])
        ]

    def fetchall(self) -> List[dict]:
        return self._rows

    def fetchone(self) -> Optional[dict]:
        return self._rows[0] if self._rows else None


class _TursoHTTPConnection:
    """Minimal sqlite3-compatible wrapper using Turso HTTP API v2."""

    def __init__(self, url: str, token: str, shared_client=None):
        self._url = url.replace("libsql://", "https://") + "/v2/pipeline"
        self._headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        self._write_queue: List[dict] = []
        # Service-level shared client (not owned here — don't close in close()).
        # Falls back to a lazily-created per-connection client for local/test use.
        self._shared_client = shared_client
        self._client = None

    def _http_client(self):
        if self._shared_client is not None:
            return self._shared_client
        # Fallback: own client for local-dev / tests where no shared client is injected.
        if self._client is None:
            import httpx  # deferred — not needed in local-dev path
            self._client = httpx.Client(timeout=60.0)
        return self._client

    def _send(self, requests: List[dict]) -> List[dict]:
        response = self._http_client().post(
            self._url, headers=self._headers, json={"requests": requests}
        )
        if response.status_code >= 400:
            # Surface Turso's actual error body. raise_for_status() drops it,
            # leaving "400 Bad Request" with no clue why the pipeline was
            # rejected — debugging blind.
            raise Exception(
                f"Turso {response.status_code} on {len(requests)} reqs: {response.text[:1000]}"
            )
        results = response.json().get("results", [])
        for r in results:
            if r.get("type") == "error":
                raise Exception(r.get("error", {}).get("message", "Turso error"))
        return [r for r in results if r.get("response", {}).get("type") == "execute"]

    def execute(self, sql: str, params=()) -> _TursoCursor:
        stripped = sql.strip().upper()
        stmt = {"sql": sql.strip(), "args": [_encode_value(p) for p in params]}
        if stripped.startswith(("SELECT", "PRAGMA", "WITH")):
            results = self._send([{"type": "execute", "stmt": stmt}, {"type": "close"}])
            raw = results[0]["response"]["result"] if results else {"cols": [], "rows": []}
            return _TursoCursor(raw)
        self._write_queue.append({"type": "execute", "stmt": stmt})
        return _TursoCursor({"cols": [], "rows": []})

    # Turso (libsql) is a single-writer database: concurrent HTTP POSTs that
    # each carry write statements fight for the write lock, producing "database
    # is locked" 500s on Vercel and causing the extension SW to time out.
    # All writes must therefore be sent SEQUENTIALLY — one pipeline POST at a
    # time — which is the Python equivalent of Turso's JS `db.batch()` API.
    #
    # Chunk large transcripts so each POST stays well under the httpx read
    # timeout (4000-segment videos → ~8 POSTs of 500 each, vs. 40 POSTs of
    # 100 before). A mid-batch failure leaves a partial transcript that is
    # recoverable on retry since every INSERT is an upsert.
    _BATCH_SIZE = 500

    # Process-global lock: only ONE write POST may be in-flight at any time,
    # across ALL concurrent commits sharing the same Vercel process. Without
    # this, N simultaneous index_transcript calls each call _send_sequential
    # independently and their individual POSTs interleave, still triggering
    # Turso write-lock 500s. A threading.Lock (not a Semaphore) ensures exactly
    # one write POST is in-flight process-wide at all times.
    _global_write_lock = threading.Lock()

    @staticmethod
    def _phase(req: dict) -> str:
        """Ordering phase for a queued write:
        - 'segments' : INSERT INTO transcript_segments — order-independent bulk.
        - 'post'     : the indexed_transcripts marker — written LAST, so a
                       partially-failed index never leaves a marker pointing at
                       zero stored segments (which get_indexed_video_ids would
                       misclassify as 'indexed', silently returning zero matches).
        - 'pre'      : everything else (channel/video upserts + the DELETEs that
                       clear a video's old segments AND its old marker) — must
                       land before the segment inserts.
        """
        if req.get("type") != "execute":
            return "pre"
        sql = req["stmt"]["sql"]
        if _SEGMENT_INSERT_RE.match(sql):
            return "segments"
        if _META_INSERT_RE.match(sql):
            return "post"
        return "pre"

    def commit(self) -> None:
        for _ in self.commit_with_progress():
            pass

    def commit_with_progress(self):
        """Generator variant of commit() that yields after each phase.

        Enables SSE heartbeats during index-transcript writes: the caller
        yields a `: ping` after each yield, keeping the SW's 30s deadman
        timer alive while Turso processes batches.
        """
        if not self._write_queue:
            return
        queue, self._write_queue = self._write_queue, []

        # Single pass partition into the three ordered phases:
        # 1. 'pre'      — channel/video upserts + the DELETEs clearing old
        #                 segments and the old marker; must land first.
        # 2. 'segments' — segment inserts, sent sequentially to avoid
        #                 write-lock contention (Turso is single-writer).
        # 3. 'post'     — the indexed_transcripts marker, LAST. Reached only
        #                 if phase 2 didn't raise, so a failed index leaves no
        #                 marker and the video falls through to the live path.
        pre: List[dict] = []
        segments: List[dict] = []
        post: List[dict] = []
        bucket = {"segments": segments, "post": post}
        for req in queue:
            bucket.get(self._phase(req), pre).append(req)

        self._send_sequential(pre)
        yield

        self._send_sequential(segments)
        yield

        self._send_sequential(post)
        yield

    def _send_sequential(self, requests: List[dict]) -> None:
        for start in range(0, len(requests), self._BATCH_SIZE):
            # Hold the global write lock for each individual POST so concurrent
            # commits (e.g. two simultaneous Vercel invocations) never send
            # overlapping write requests to Turso.
            with self._global_write_lock:
                self._send(requests[start:start + self._BATCH_SIZE] + [{"type": "close"}])

    def close(self) -> None:
        self._write_queue.clear()
        if self._client is not None:
            self._client.close()
            self._client = None
        # _shared_client is owned by TranscriptIndexService — not closed here.


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _default_db_path() -> Path:
    project_root = Path(__file__).resolve().parents[3]
    configured = os.getenv("CLIPCHASE_DB_PATH")
    if configured:
        return Path(configured).expanduser()
    return project_root / ".data" / "clipchase_index.sqlite3"


def _build_search_text(text: str) -> str:
    """Pad transcript text with extra forms so the FTS index can match across
    scripts. For each token we add (a) a romanized form for Devanagari tokens
    and (b) a pronunciation key for both scripts. The key collapses long
    vowels and the trailing schwa, so "startup" and "स्टार्टअप" land on the
    same key and either query lights up the other.
    """
    normalized = _normalize_text(text)
    if not normalized:
        return ""

    additions: List[str] = []
    seen = set()

    def add(value: str) -> None:
        if not value:
            return
        k = value.casefold()
        if k in seen:
            return
        seen.add(k)
        additions.append(value)

    for token in MIXED_TOKEN_RE.findall(normalized):
        if DEVANAGARI_TOKEN_RE.fullmatch(token):
            add(_romanize_devanagari(token))
        add(_phonetic_key(token))

    if not additions:
        return normalized

    return " ".join([normalized, *additions])


def _quote_fts_term(term: str) -> str:
    return '"' + (term or "").replace('"', '""') + '"'


def _token_match_queries(term: str) -> List[str]:
    """One FTS MATCH query per token of `term`. A video must satisfy ALL of
    them (each possibly in a different segment) to stay a candidate.

    FTS5 MATCH evaluates per row, and each row is one caption segment —
    YouTube chops auto-captions into 2-5 word segments, so a multi-word
    phrase routinely spans rows. A single phrase query would reject videos
    the authoritative sliding-window matcher accepts, which made indexed
    channels return FEWER results than their first (live-path) search. The
    pre-filter must stay recall-safe: relax to per-token presence here and
    let the window matcher downstream re-impose adjacency.
    """
    queries: List[str] = []
    for token in MIXED_TOKEN_RE.findall(term) or [term]:
        alternatives: List[str] = []
        seen: Set[str] = set()
        for candidate in (token, _phonetic_key(token)):
            if not candidate:
                continue
            key = candidate.casefold()
            if key in seen:
                continue
            seen.add(key)
            alternatives.append(candidate)
        if alternatives:
            queries.append(" OR ".join(_quote_fts_term(a) for a in alternatives))
    return queries


class TranscriptIndexService:
    def __init__(self, db_path: Optional[str] = None):
        # Explicit db_path always uses local SQLite regardless of env vars.
        self._remote = db_path is None and _is_remote()
        self.db_path = Path(db_path).expanduser() if db_path else _default_db_path()
        if not self._remote:
            self.db_path.parent.mkdir(parents=True, exist_ok=True)
        # Single persistent HTTP client shared across all _TursoHTTPConnection
        # instances for this service. Sequential index_transcript calls from the
        # same warm Vercel instance reuse the TLS session instead of paying the
        # handshake cost on every request — the root cause of the Jun-5 timeout
        # spike where 45 back-to-back calls each opened a fresh connection.
        self._shared_http_client = None
        if self._remote:
            import httpx
            self._shared_http_client = httpx.Client(timeout=60.0)
        try:
            self.ensure_schema()
        except Exception:
            if self._shared_http_client is not None:
                self._shared_http_client.close()
                self._shared_http_client = None
            raise

    def _connect(self):
        if self._remote:
            return _TursoHTTPConnection(
                url=os.environ["TURSO_DATABASE_URL"],
                token=os.getenv("TURSO_AUTH_TOKEN", ""),
                shared_client=self._shared_http_client,
            )
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        return conn

    _SCHEMA_STATEMENTS = [
        """
        CREATE TABLE IF NOT EXISTS indexed_channels (
            channel_id TEXT PRIMARY KEY,
            source_url TEXT NOT NULL,
            indexed_at TEXT NOT NULL
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS indexed_videos (
            video_id TEXT PRIMARY KEY,
            channel_id TEXT NOT NULL,
            title TEXT NOT NULL,
            published_at TEXT NOT NULL,
            thumbnail TEXT NOT NULL,
            indexed_at TEXT NOT NULL,
            FOREIGN KEY(channel_id) REFERENCES indexed_channels(channel_id) ON DELETE CASCADE
        )
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_indexed_videos_channel_id
            ON indexed_videos(channel_id)
        """,
        """
        CREATE TABLE IF NOT EXISTS indexed_transcripts (
            video_id TEXT NOT NULL,
            language_code TEXT NOT NULL,
            language_label TEXT NOT NULL,
            is_generated INTEGER NOT NULL,
            segment_count INTEGER NOT NULL,
            indexed_at TEXT NOT NULL,
            PRIMARY KEY (video_id, language_code),
            FOREIGN KEY(video_id) REFERENCES indexed_videos(video_id) ON DELETE CASCADE
        )
        """,
        """
        CREATE VIRTUAL TABLE IF NOT EXISTS transcript_segments USING fts5(
            video_id UNINDEXED,
            language_code UNINDEXED,
            segment_index UNINDEXED,
            start UNINDEXED,
            duration UNINDEXED,
            text,
            search_text
        )
        """,
    ]

    def ensure_schema(self) -> None:
        conn = self._connect()
        try:
            for stmt in self._SCHEMA_STATEMENTS:
                conn.execute(stmt)
            conn.commit()
        finally:
            conn.close()

    def _queue_channel(self, conn, channel_id: str, source_url: str) -> None:
        conn.execute(
            """
            INSERT INTO indexed_channels (channel_id, source_url, indexed_at)
            VALUES (?, ?, ?)
            ON CONFLICT(channel_id) DO UPDATE SET
                source_url = excluded.source_url,
                indexed_at = excluded.indexed_at
            """,
            (channel_id, source_url, _utc_now_iso()),
        )

    def _queue_video(self, conn, channel_id: str, video: Dict[str, Any]) -> None:
        conn.execute(
            """
            INSERT INTO indexed_videos (video_id, channel_id, title, published_at, thumbnail, indexed_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(video_id) DO UPDATE SET
                channel_id = excluded.channel_id,
                title = excluded.title,
                published_at = excluded.published_at,
                thumbnail = excluded.thumbnail,
                indexed_at = excluded.indexed_at
            """,
            (
                video["id"],
                channel_id,
                video.get("title") or "",
                video.get("publishedAt") or "",
                video.get("thumbnail") or "",
                _utc_now_iso(),
            ),
        )

    def _queue_transcript(self, conn, video_id: str, transcript: Dict[str, Any]) -> bool:
        language_code = normalize_language_code(transcript.get("language_code"))
        segments = transcript.get("segments") or []
        if not video_id or not language_code or not segments:
            return False
        # Bail before touching the DB if every segment normalises to empty text
        # (music-only videos, formatting-only captions). Without this guard the
        # DELETE below fires and wipes existing segments while writing nothing.
        if not any(_normalize_text(s.get("text", "")) for s in segments):
            return False

        # Clear the old marker up front (program order: before the re-insert
        # below, so the atomic local-sqlite path stays correct). On the remote
        # Turso path commit() routes this DELETE to the pre-phase and the INSERT
        # to the post-phase, so if the segment writes fail in between, no marker
        # survives — the video falls through to the live path instead of being
        # classified 'indexed' with zero stored segments.
        conn.execute(
            "DELETE FROM indexed_transcripts WHERE video_id = ? AND language_code = ?",
            (video_id, language_code),
        )
        conn.execute(
            """
            INSERT INTO indexed_transcripts (
                video_id,
                language_code,
                language_label,
                is_generated,
                segment_count,
                indexed_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(video_id, language_code) DO UPDATE SET
                language_label = excluded.language_label,
                is_generated = excluded.is_generated,
                segment_count = excluded.segment_count,
                indexed_at = excluded.indexed_at
            """,
            (
                video_id,
                language_code,
                transcript.get("language_label") or language_code.upper(),
                1 if transcript.get("is_generated") else 0,
                len(segments),
                _utc_now_iso(),
            ),
        )
        conn.execute(
            "DELETE FROM transcript_segments WHERE video_id = ? AND language_code = ?",
            (video_id, language_code),
        )

        for index, segment in enumerate(segments):
            text = _normalize_text(segment.get("text", ""))
            if not text:
                continue
            conn.execute(
                """
                INSERT INTO transcript_segments (
                    video_id,
                    language_code,
                    segment_index,
                    start,
                    duration,
                    text,
                    search_text
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    video_id,
                    language_code,
                    index,
                    float(segment.get("start", 0)),
                    float(segment.get("duration", 0)),
                    text,
                    _build_search_text(text),
                ),
            )
        return True

    def cache_video_transcripts(
        self,
        channel_id: str,
        source_url: str,
        video: Dict[str, Any],
        transcripts: Sequence[Dict[str, Any]],
    ) -> int:
        stored = 0
        for item in self.cache_video_transcripts_with_progress(
            channel_id=channel_id,
            source_url=source_url,
            video=video,
            transcripts=transcripts,
        ):
            if isinstance(item, int):
                stored = item
        return stored

    def cache_video_transcripts_with_progress(
        self,
        channel_id: str,
        source_url: str,
        video: Dict[str, Any],
        transcripts: Sequence[Dict[str, Any]],
    ):
        """Generator variant of cache_video_transcripts that yields after each
        Turso write phase and finally the stored count. Enables SSE heartbeats
        during index-transcript so the SW's 30s deadman timer stays alive.

        One connection (one reused HTTP client) and one chunked commit for the
        whole video — channel, video, and every transcript."""
        if not transcripts:
            return

        conn = self._connect()
        try:
            self._queue_channel(conn, channel_id, source_url)
            self._queue_video(conn, channel_id, video)

            stored = 0
            seen_languages = set()
            for transcript in transcripts:
                language_code = normalize_language_code(transcript.get("language_code"))
                if not language_code or language_code in seen_languages:
                    continue
                seen_languages.add(language_code)
                if self._queue_transcript(conn, video["id"], transcript):
                    stored += 1

            if hasattr(conn, "commit_with_progress"):
                yield from conn.commit_with_progress()
            else:
                conn.commit()  # local sqlite3 path
            yield stored
        finally:
            conn.close()

    def get_indexed_video_ids(self, channel_id: str, video_ids: Sequence[str]) -> Set[str]:
        if not channel_id or not video_ids:
            return set()

        # Only return videos that ALSO have at least one transcript row. A
        # metadata-only row in indexed_videos (from a failed transcript fetch
        # during a prior index run) would otherwise be classified as "indexed"
        # and never fall through to the live path, producing zero matches even
        # though the videos are perfectly searchable via a fresh fetch.
        placeholders = ",".join("?" for _ in video_ids)
        conn = self._connect()
        try:
            rows = conn.execute(
                f"""
                SELECT DISTINCT v.video_id
                FROM indexed_videos v
                JOIN indexed_transcripts t ON t.video_id = v.video_id
                WHERE v.channel_id = ? AND v.video_id IN ({placeholders})
                """,
                [channel_id, *video_ids],
            ).fetchall()
            return {row["video_id"] for row in rows}
        finally:
            conn.close()

    def get_transcript(self, video_id: str, language_code: str) -> Optional[Dict[str, Any]]:
        normalized_language = normalize_language_code(language_code)
        if not video_id or not normalized_language:
            return None

        conn = self._connect()
        try:
            transcript_row = conn.execute(
                """
                SELECT video_id, language_code, language_label, is_generated, segment_count
                FROM indexed_transcripts
                WHERE video_id = ? AND language_code = ?
                """,
                (video_id, normalized_language),
            ).fetchone()
            if transcript_row is None:
                return None

            segments = conn.execute(
                """
                SELECT start, duration, text
                FROM transcript_segments
                WHERE video_id = ? AND language_code = ?
                ORDER BY CAST(segment_index AS INTEGER)
                """,
                (video_id, normalized_language),
            ).fetchall()

            return {
                "language_code": transcript_row["language_code"],
                "language_label": transcript_row["language_label"],
                "is_generated": bool(transcript_row["is_generated"]),
                "segments": [
                    {
                        "start": float(row["start"]),
                        "duration": float(row["duration"]),
                        "text": row["text"],
                    }
                    for row in segments
                ],
            }
        finally:
            conn.close()

    def get_indexed_languages(self, video_id: str) -> Set[str]:
        """Languages actually stored for a video, in ONE round-trip.

        _get_indexed_match used to brute-force get_transcript() across every
        (preferred-order x language) combination — up to ~25 calls per video,
        each a fresh Turso HTTP connection + 2 queries. Callers should resolve
        the stored language set first, then fetch only those.
        """
        if not video_id:
            return set()
        conn = self._connect()
        try:
            rows = conn.execute(
                "SELECT DISTINCT language_code FROM indexed_transcripts WHERE video_id = ?",
                (video_id,),
            ).fetchall()
            return {row["language_code"] for row in rows}
        finally:
            conn.close()

    def find_candidate_video_ids(self, video_ids: Sequence[str], search_terms: Sequence[str]) -> Set[str]:
        cleaned_terms = [_normalize_text(term) for term in search_terms if _normalize_text(term)]
        if not video_ids or not cleaned_terms:
            return set()

        conn = self._connect()
        try:
            # A term survives if every one of its tokens matches somewhere in
            # the video (tokens are queried with their pronunciation keys so
            # the filter mirrors what _build_search_text put into the index).
            # Terms are script variants of the same keyword, so videos passing
            # ANY term are candidates.
            candidates: Set[str] = set()
            for term in cleaned_terms:
                survivors: Optional[Set[str]] = None
                for match_query in _token_match_queries(term):
                    scope = list(survivors) if survivors is not None else list(video_ids)
                    if not scope:
                        break
                    placeholders = ",".join("?" for _ in scope)
                    rows = conn.execute(
                        f"""
                        SELECT DISTINCT video_id
                        FROM transcript_segments
                        WHERE transcript_segments MATCH ?
                          AND video_id IN ({placeholders})
                        """,
                        [match_query, *scope],
                    ).fetchall()
                    survivors = {row["video_id"] for row in rows}
                    if not survivors:
                        break
                if survivors:
                    candidates |= survivors
            return candidates
        finally:
            conn.close()
