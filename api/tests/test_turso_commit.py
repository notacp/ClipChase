"""Regression tests for the Turso write-commit path (_TursoHTTPConnection.commit).

These lock the fix for the production `index_transcript_failed`/sw_timeout
cascade: large auto-caption transcripts (4000+ segments) committed as ~40
SEQUENTIAL Turso batch POSTs outran the side panel's 30s deadman, worst on
Windows Chrome (~40x per-round-trip latency amplification). The fix commits the
segment-insert batches CONCURRENTLY (bounded), so total wall-time stops scaling
linearly with the number of batches.

The existing test_transcript_index.py tests run against LOCAL sqlite and never
touch _TursoHTTPConnection at all — which is exactly why this path was patched
four times without a test catching the regression. These tests drive the remote
adapter directly through a fake Turso HTTP server backed by an in-memory sqlite,
so correctness (no DELETE wiping freshly-inserted rows) and concurrency are both
verified against the real commit() code.
"""

import sqlite3
import threading
import time

import pytest

from api.app.services.transcript_index import (
    TranscriptIndexService,
    _TursoHTTPConnection,
    _encode_value,
)


class TestEncodeValueWireType:
    """Locks fix d6f7e19. Every transcript segment carries float start/duration;
    Turso v2 rejects string-encoded floats ('invalid type: string "0.0",
    expected f64') -> 500 on every index write -> the 5/20 cascade. The bug is
    invisible to the round-trip tests (sqlite coerces both forms), so assert the
    WIRE shape directly: floats must be raw JSON numbers, ints must be strings."""

    def test_float_is_json_number_not_string(self):
        enc = _encode_value(0.0)
        assert enc == {"type": "float", "value": 0.0}
        # The actual regression: value must be a float, never the string "0.0".
        assert isinstance(enc["value"], float)

    def test_nonzero_float(self):
        enc = _encode_value(12.5)
        assert enc["type"] == "float"
        assert isinstance(enc["value"], float) and enc["value"] == 12.5

    def test_int_is_string_encoded(self):
        # i64 can overflow JSON number precision; Turso v2 keeps ints as strings.
        assert _encode_value(5) == {"type": "integer", "value": "5"}

    def test_bool_is_int_string(self):
        assert _encode_value(True) == {"type": "integer", "value": "1"}
        assert _encode_value(False) == {"type": "integer", "value": "0"}


def _decode_arg(arg: dict):
    """Inverse of transcript_index._encode_value."""
    t = arg.get("type")
    v = arg.get("value")
    if t == "null" or v is None:
        return None
    if t == "integer":
        return int(v)
    if t in ("float", "real"):
        return float(v)
    return v


class _FakeResp:
    status_code = 200

    @staticmethod
    def json():
        return {"results": []}


class FakeTursoHTTP:
    """Stands in for httpx.Client against Turso's /v2/pipeline endpoint.

    Applies each pipeline's statements to a shared in-memory sqlite DB (guarded
    by a lock, since the fix fires POSTs from multiple threads) and records call
    ordering + peak concurrency so tests can assert both correctness and that
    the commit actually parallelised.
    """

    # Simulated per-round-trip network latency. The whole point of the fix is to
    # overlap these instead of paying them serially, so make it long enough that
    # concurrent batches reliably overlap.
    LATENCY_S = 0.02

    def __init__(self, fail_on_segment: bool = False):
        self._db = sqlite3.connect(":memory:", check_same_thread=False)
        self._db_lock = threading.Lock()
        for stmt in TranscriptIndexService._SCHEMA_STATEMENTS:
            self._db.execute(stmt)
        self._db.commit()

        # When set, any POST containing a transcript_segments INSERT returns a
        # Turso error (simulating a mid-commit write failure) without applying.
        self.fail_on_segment = fail_on_segment

        self._counter_lock = threading.Lock()
        self._in_flight = 0
        self.peak_concurrency = 0
        self._segment_in_flight = 0
        self.segment_peak = 0  # peak concurrent segment-insert POSTs (semaphore)
        self.received_batches: list[list[dict]] = []  # in receive order

    @staticmethod
    def _is_segment_batch(requests) -> bool:
        return any(
            req.get("type") == "execute"
            and req["stmt"]["sql"].strip().upper().startswith("INSERT INTO TRANSCRIPT_SEGMENTS")
            for req in requests
        )

    def post(self, url, headers=None, json=None):  # noqa: A002 - mirror httpx
        requests = json["requests"]
        is_segment = self._is_segment_batch(requests)
        if is_segment and self.fail_on_segment:
            return _ErrResp(500, "simulated Turso write failure")
        with self._counter_lock:
            self._in_flight += 1
            self.peak_concurrency = max(self.peak_concurrency, self._in_flight)
            if is_segment:
                self._segment_in_flight += 1
                self.segment_peak = max(self.segment_peak, self._segment_in_flight)
            self.received_batches.append(requests)
        try:
            # Network latency happens OUTSIDE the db lock so concurrent batches
            # genuinely overlap — this is what the fix is supposed to exploit.
            time.sleep(self.LATENCY_S)
            with self._db_lock:
                for req in requests:
                    if req.get("type") != "execute":
                        continue
                    stmt = req["stmt"]
                    params = [_decode_arg(a) for a in stmt.get("args", [])]
                    self._db.execute(stmt["sql"], params)
                self._db.commit()
        finally:
            with self._counter_lock:
                self._in_flight -= 1
                if is_segment:
                    self._segment_in_flight -= 1
        return _FakeResp()

    def segment_count(self, video_id: str, language_code: str) -> int:
        with self._db_lock:
            cur = self._db.execute(
                "SELECT COUNT(*) FROM transcript_segments WHERE video_id=? AND language_code=?",
                (video_id, language_code),
            )
            return cur.fetchone()[0]

    def indexed_transcript_count(self, video_id: str, language_code: str) -> int:
        with self._db_lock:
            cur = self._db.execute(
                "SELECT COUNT(*) FROM indexed_transcripts WHERE video_id=? AND language_code=?",
                (video_id, language_code),
            )
            return cur.fetchone()[0]


def _remote_conn(fake: FakeTursoHTTP) -> _TursoHTTPConnection:
    return _TursoHTTPConnection(url="libsql://fake", token="tok", shared_client=fake)


def _queue_index(conn: _TursoHTTPConnection, video_id: str, n_segments: int) -> None:
    """Mirror the statement order TranscriptIndexService queues for one video:
    channel/video/transcript-meta upserts, the DELETE that clears old segments,
    then one INSERT per segment."""
    # INSERT OR REPLACE mirrors the ON CONFLICT DO UPDATE upserts the real
    # service queues, so re-indexing the same channel/video doesn't trip a
    # UNIQUE constraint.
    conn.execute(
        "INSERT OR REPLACE INTO indexed_channels (channel_id, source_url, indexed_at) VALUES (?, ?, ?)",
        ("chan1", "https://youtube.com/@chan1", "2026-01-01T00:00:00Z"),
    )
    conn.execute(
        "INSERT OR REPLACE INTO indexed_videos (video_id, channel_id, title, published_at, thumbnail, indexed_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (video_id, "chan1", video_id, "2026-01-01T00:00:00Z", "", "2026-01-01T00:00:00Z"),
    )
    conn.execute(
        "INSERT OR REPLACE INTO indexed_transcripts (video_id, language_code, language_label, is_generated, "
        "segment_count, indexed_at) VALUES (?, ?, ?, ?, ?, ?)",
        (video_id, "en", "English", 1, n_segments, "2026-01-01T00:00:00Z"),
    )
    conn.execute(
        "DELETE FROM transcript_segments WHERE video_id = ? AND language_code = ?",
        (video_id, "en"),
    )
    for i in range(n_segments):
        conn.execute(
            "INSERT INTO transcript_segments (video_id, language_code, segment_index, start, "
            "duration, text, search_text) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (video_id, "en", i, float(i), 1.0, f"word{i}", f"word{i}"),
        )


def _segment_insert_batches(received: list[list[dict]]) -> list[list[dict]]:
    out = []
    for batch in received:
        if any(
            req.get("type") == "execute"
            and req["stmt"]["sql"].strip().upper().startswith("INSERT INTO TRANSCRIPT_SEGMENTS")
            for req in batch
        ):
            out.append(batch)
    return out


class TestParallelCommit:
    def test_large_transcript_stores_every_segment(self):
        # The headline failure: a 4000+ segment auto-caption video. Must persist
        # in full — no DELETE racing ahead of inserts, no dropped batch.
        fake = FakeTursoHTTP()
        conn = _remote_conn(fake)
        _queue_index(conn, "vbig", 4000)
        conn.commit()
        assert fake.segment_count("vbig", "en") == 4000

    def test_segment_batches_commit_concurrently(self):
        # The fix: with many batches, segment-insert POSTs must overlap. On the
        # old sequential commit() peak concurrency is exactly 1 — this is the
        # assertion that fails before the fix.
        fake = FakeTursoHTTP()
        conn = _remote_conn(fake)
        _queue_index(conn, "vpar", 1500)  # 15 segment batches at _BATCH_SIZE=100
        conn.commit()
        assert fake.peak_concurrency > 1

    def test_concurrency_is_bounded(self):
        # Don't unleash 40 simultaneous connections at Turso — cap the fan-out.
        fake = FakeTursoHTTP()
        conn = _remote_conn(fake)
        _queue_index(conn, "vcap", 4000)  # 40 segment batches
        conn.commit()
        assert fake.peak_concurrency <= _TursoHTTPConnection._MAX_CONCURRENT_BATCHES

    def test_delete_lands_before_any_segment_insert(self):
        # Correctness hazard introduced by parallelism: the per-video DELETE that
        # clears old segments MUST complete before any new INSERT, or a DELETE
        # landing late wipes freshly written rows. Verified two ways: ordering of
        # received batches, and the final row count after re-indexing over an
        # existing transcript.
        fake = FakeTursoHTTP()

        # Pre-existing index for the same video (stale rows to be replaced).
        conn1 = _remote_conn(fake)
        _queue_index(conn1, "vrep", 50)
        conn1.commit()
        assert fake.segment_count("vrep", "en") == 50

        # Re-index with a different segment count; DELETE must clear the old 50
        # before the new 300 land. Reset the receive log so we inspect only the
        # second commit's batch ordering.
        fake.received_batches.clear()
        conn2 = _remote_conn(fake)
        _queue_index(conn2, "vrep", 300)
        conn2.commit()
        # If the DELETE raced behind the inserts, this would be < 300 (often 0).
        assert fake.segment_count("vrep", "en") == 300

        def _is_delete(batch):
            return any(
                req.get("type") == "execute"
                and req["stmt"]["sql"].strip().upper().startswith("DELETE FROM TRANSCRIPT_SEGMENTS")
                for req in batch
            )

        seg_batches = _segment_insert_batches(fake.received_batches)
        delete_idx = next(i for i, b in enumerate(fake.received_batches) if _is_delete(b))
        first_seg_idx = next(
            i for i, b in enumerate(fake.received_batches) if b in seg_batches
        )
        # DELETE-bearing preamble batch is received before any segment INSERT.
        assert delete_idx < first_seg_idx
        assert seg_batches  # sanity: inserts actually happened


class _ErrResp:
    def __init__(self, status_code: int, text: str):
        self.status_code = status_code
        self.text = text

    @staticmethod
    def json():
        return {"results": []}


class _ErrTursoHTTP:
    """Returns a >=400 with a Turso error body, to exercise the _send error
    branch that the FakeTursoHTTP (always 200) and the router test (mocks the
    service) both skip."""

    def __init__(self, status_code=400, text='invalid type: string "0.0", expected f64'):
        self._resp = _ErrResp(status_code, text)

    def post(self, url, headers=None, json=None):  # noqa: A002
        return self._resp


class TestSendErrorSurfacing:
    """Locks fix be1cdf0. _send must raise with Turso's actual error BODY, not a
    bare status — reverting to response.raise_for_status() (which drops the body)
    must fail a test, or we go back to debugging '400 Bad Request' blind."""

    def test_send_raises_with_turso_error_body(self):
        conn = _TursoHTTPConnection(
            url="libsql://fake", token="tok", shared_client=_ErrTursoHTTP()
        )
        conn.execute("INSERT INTO indexed_channels (channel_id, source_url, indexed_at) VALUES (?,?,?)", ("c", "u", "t"))
        with pytest.raises(Exception) as exc:
            conn.commit()
        msg = str(exc.value)
        assert "400" in msg
        assert "expected f64" in msg  # the body, not just the status


class TestSharedHttpClient:
    """Locks fix 3d43a8e. Connections must reuse the injected shared httpx.Client
    instead of each opening its own — per-connection TLS handshakes were the
    Jun-5 timeout spike (45 back-to-back index calls). Reverting to a
    per-connection client would make _http_client() create a private _client."""

    def test_connections_reuse_injected_client(self):
        fake = FakeTursoHTTP()
        c1 = _remote_conn(fake)
        c2 = _remote_conn(fake)
        assert c1._http_client() is fake
        assert c2._http_client() is fake
        # No private per-connection client was lazily created.
        assert c1._client is None and c2._client is None


@pytest.mark.parametrize("n_segments", [0, 1, 99, 100, 101])
def test_small_and_boundary_sizes_round_trip(n_segments):
    # The fix must not regress the common small-video path or batch boundaries.
    fake = FakeTursoHTTP()
    conn = _remote_conn(fake)
    _queue_index(conn, f"v{n_segments}", n_segments)
    conn.commit()
    assert fake.segment_count(f"v{n_segments}", "en") == n_segments


def _transcript(n_segments: int) -> dict:
    return {
        "language_code": "en",
        "language_label": "English",
        "is_generated": True,
        "segments": [
            {"text": f"word{i}", "start": float(i), "duration": 1.0}
            for i in range(n_segments)
        ],
    }


class TestPartialFailureLeavesNoMarker:
    """Code-review finding 1. The indexed_transcripts marker is written LAST and
    stale markers are cleared FIRST, so a partially-failed index never leaves a
    marker pointing at zero stored segments (which get_indexed_video_ids would
    classify as 'indexed' -> silent zero matches). Drives the REAL
    _queue_transcript statements through the real three-phase commit()."""

    def test_first_index_failure_writes_no_marker(self, tmp_path):
        svc = TranscriptIndexService(db_path=str(tmp_path / "local.db"))
        fake = FakeTursoHTTP(fail_on_segment=True)
        conn = _remote_conn(fake)
        svc._queue_transcript(conn, "vfail", _transcript(500))
        with pytest.raises(Exception):
            conn.commit()
        # Post-phase marker never sent; segment writes failed.
        assert fake.indexed_transcript_count("vfail", "en") == 0
        assert fake.segment_count("vfail", "en") == 0

    def test_reindex_failure_clears_stale_marker(self, tmp_path):
        svc = TranscriptIndexService(db_path=str(tmp_path / "local.db"))
        fake = FakeTursoHTTP()
        c1 = _remote_conn(fake)
        svc._queue_transcript(c1, "vrep", _transcript(50))
        c1.commit()
        assert fake.indexed_transcript_count("vrep", "en") == 1
        assert fake.segment_count("vrep", "en") == 50

        # Re-index that fails on the segment writes.
        fake.fail_on_segment = True
        c2 = _remote_conn(fake)
        svc._queue_transcript(c2, "vrep", _transcript(300))
        with pytest.raises(Exception):
            c2.commit()
        # The pre-phase DELETE cleared the stale marker; the post-phase re-insert
        # never ran -> the video is NOT classified indexed, falls through to live.
        assert fake.indexed_transcript_count("vrep", "en") == 0
        assert fake.segment_count("vrep", "en") == 0


class TestPhaseRouting:
    """Code-review finding 3. Phase routing tolerates INSERT OR REPLACE / case /
    whitespace, so a spelling change can't silently de-parallelise segments or
    break DELETE-before-INSERT ordering."""

    def _phase(self, sql: str) -> str:
        return _TursoHTTPConnection._phase({"type": "execute", "stmt": {"sql": sql}})

    def test_segment_inserts_route_to_segments(self):
        assert self._phase("INSERT INTO transcript_segments (a) VALUES (?)") == "segments"
        assert self._phase("  insert  into   transcript_segments(a) values(?)") == "segments"
        assert self._phase("INSERT OR REPLACE INTO transcript_segments (a) VALUES (?)") == "segments"

    def test_marker_inserts_route_to_post(self):
        assert self._phase("INSERT INTO indexed_transcripts (a) VALUES (?)") == "post"
        assert self._phase("INSERT OR REPLACE INTO indexed_transcripts (a) VALUES (?)") == "post"

    def test_deletes_and_close_route_to_pre(self):
        assert self._phase("DELETE FROM transcript_segments WHERE x=?") == "pre"
        assert self._phase("DELETE FROM indexed_transcripts WHERE x=?") == "pre"
        assert _TursoHTTPConnection._phase({"type": "close"}) == "pre"


def test_segment_concurrency_bounded_globally_across_commits():
    """Code-review finding 2. _MAX_CONCURRENT_BATCHES bounds ONE commit; the
    process-global semaphore must bound segment POSTs across ALL concurrent
    commits sharing the singleton client."""
    cap = _TursoHTTPConnection._GLOBAL_MAX_INFLIGHT
    n_commits = 4
    # Demand must provably exceed the cap, or this test proves nothing — without
    # the semaphore, n_commits x per-commit workers POSTs would run at once.
    demand = n_commits * _TursoHTTPConnection._MAX_CONCURRENT_BATCHES
    assert demand > cap

    fake = FakeTursoHTTP()

    def run(vid: str):
        conn = _remote_conn(fake)
        _queue_index(conn, vid, 1500)  # 15 segment batches per commit
        conn.commit()

    threads = [threading.Thread(target=run, args=(f"vc{i}",)) for i in range(n_commits)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    # The cap holds despite demand far exceeding it. Removing the semaphore wrap
    # lets peak climb toward `demand` (>cap) -> this fails (verified red-green).
    assert fake.segment_peak <= cap
    # And it actually engaged: overlap pushed past one commit's local cap.
    assert fake.segment_peak > _TursoHTTPConnection._MAX_CONCURRENT_BATCHES
