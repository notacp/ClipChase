import os
import sqlite3

import pytest

from api.app.services.transcript_index import decode_segments
from api.app.services.transcript_index import TranscriptIndexService


@pytest.fixture()
def service(tmp_path):
    return TranscriptIndexService(db_path=str(tmp_path / "index.db"))


def _index_video(service, video_id: str, segment_texts: list[str]) -> None:
    service.cache_video_transcripts(
        channel_id="chan1",
        source_url="https://youtube.com/@chan1",
        video={"id": video_id, "title": video_id, "publishedAt": "2026-01-01T00:00:00Z", "thumbnail": ""},
        transcripts=[
            {
                "language_code": "en",
                "language_label": "English",
                "is_generated": True,
                "segments": [
                    {"text": text, "start": float(i), "duration": 1.0}
                    for i, text in enumerate(segment_texts)
                ],
            }
        ],
    )


class TestGetChannelVideos:
    """Locks fix 1773b5a (the orphan JOIN). get_channel_videos must JOIN
    indexed_transcripts so a metadata-only video row (left behind by a failed
    transcript fetch in a prior index run) is NOT classified 'indexed' — else it
    never falls through to the live path and the channel returns zero matches
    even though the videos are perfectly searchable. Dropping the JOIN passes
    every other test, so guard it explicitly."""

    def test_metadata_only_video_is_not_indexed(self, service):
        # A transcript whose segments all normalize to empty text is rejected
        # by _queue_transcript, leaving channel + video rows but no transcript
        # row — exactly the state a failed transcript fetch leaves behind.
        stored = service.cache_video_transcripts(
            channel_id="chan1",
            source_url="https://youtube.com/@chan1",
            video={"id": "v1", "title": "t", "publishedAt": "2026-01-01T00:00:00Z", "thumbnail": ""},
            transcripts=[
                {"language_code": "en", "language_label": "English", "is_generated": True,
                 "segments": [{"text": "   ", "start": 0.0, "duration": 1.0}]}
            ],
        )
        assert stored == 0
        # Row exists in indexed_videos but has no transcript -> must not count.
        assert service.get_channel_videos("chan1") == []

    def test_video_with_transcript_is_indexed(self, service):
        _index_video(service, "v1", ["machine learning content"])
        assert [v["id"] for v in service.get_channel_videos("chan1")] == ["v1"]


class TestGetIndexedLanguages:
    """Locks fix 7e12116. get_indexed_languages resolves the stored language set
    in ONE query; callers use it to fetch only languages a video actually has
    instead of brute-forcing get_transcript across ~25 (order x lang) combos —
    each a fresh Turso connection. Guards against that N+1 creeping back."""

    def test_returns_all_stored_languages(self, service):
        service.cache_video_transcripts(
            channel_id="chan1",
            source_url="https://youtube.com/@chan1",
            video={"id": "v1", "title": "t", "publishedAt": "2026-01-01T00:00:00Z", "thumbnail": ""},
            transcripts=[
                {"language_code": "en", "language_label": "English", "is_generated": True,
                 "segments": [{"text": "hello world", "start": 0.0, "duration": 1.0}]},
                {"language_code": "hi", "language_label": "Hindi", "is_generated": True,
                 "segments": [{"text": "नमस्ते दुनिया", "start": 0.0, "duration": 1.0}]},
            ],
        )
        assert service.get_indexed_languages("v1") == {"en", "hi"}

    def test_empty_for_unknown_video(self, service):
        assert service.get_indexed_languages("nope") == set()


# ---------------------------------------------------------------------------
# Segments stored inline on the transcript row
# ---------------------------------------------------------------------------
# Segments used to live in an FTS5 table queried on UNINDEXED columns with no
# MATCH clause, so every read and every pre-write DELETE scanned the entire
# corpus. They now ride as a JSON array on the indexed_transcripts row, keyed
# by the primary key the lookup already used.

class TestInlineSegments:
    def test_round_trips_segments_with_timings(self, service):
        _index_video(service, "vid1", ["hello world", "second line"])
        got = service.get_transcript("vid1", "en")
        assert got is not None
        assert [s["text"] for s in got["segments"]] == ["hello world", "second line"]
        # Timings survive the JSON round-trip as floats, not strings.
        assert all(isinstance(s["start"], float) for s in got["segments"])
        assert all(isinstance(s["duration"], float) for s in got["segments"])

    def test_reindex_replaces_rather_than_appends(self, service):
        _index_video(service, "vid2", ["one", "two", "three"])
        _index_video(service, "vid2", ["only"])
        got = service.get_transcript("vid2", "en")
        assert [s["text"] for s in got["segments"]] == ["only"]

    def test_segments_live_on_the_transcript_row(self, service):
        """The whole point: one row holds the transcript, so one row is read."""
        _index_video(service, "vid3", ["a", "b"])
        conn = service._connect()
        try:
            row = conn.execute(
                "SELECT segments, segment_count FROM indexed_transcripts WHERE video_id=? AND language_code=?",
                ("vid3", "en"),
            ).fetchone()
        finally:
            conn.close()
        assert row is not None
        assert row["segment_count"] == 2
        assert row["segments"].startswith("z1:")  # stored compressed
        assert [seg["text"] for seg in decode_segments(row["segments"])] == ["a", "b"]

    def test_legacy_raw_json_rows_still_read(self, service):
        """Rows written before compression hold plain JSON and must keep working
        until scripts/compress_segments.py converts them."""
        _index_video(service, "vid5", ["old"])
        conn = service._connect()
        try:
            conn.execute(
                "UPDATE indexed_transcripts SET segments=? WHERE video_id=?",
                ('[{"start":1.0,"duration":2.0,"text":"legacy line"}]', "vid5"),
            )
            conn.commit()
        finally:
            conn.close()
        got = service.get_transcript("vid5", "en")
        assert [seg["text"] for seg in got["segments"]] == ["legacy line"]

    def test_compressible_giant_is_not_cached(self, service):
        """Repetitive text compresses under the row cap; the raw cap must still
        refuse it, or every read inflates it back to full size."""
        _index_video(service, "vid7", ["same line " * 100 for _ in range(3000)])  # ~3 MB raw
        assert service.get_transcript("vid7", "en") is None

    def test_decoder_refuses_oversized_payload(self):
        import base64, zlib
        bomb = "z1:" + base64.b64encode(zlib.compress(b"[" + b" " * 3_000_000 + b"]", 9)).decode()
        with pytest.raises(ValueError):
            decode_segments(bomb)

    def test_corrupt_compressed_row_is_a_cache_miss(self, service):
        _index_video(service, "vid6", ["x"])
        conn = service._connect()
        try:
            conn.execute("UPDATE indexed_transcripts SET segments='z1:not-base64!!' WHERE video_id='vid6'")
            conn.commit()
        finally:
            conn.close()
        assert service.get_transcript("vid6", "en") is None

    def test_oversized_transcript_is_not_cached(self, service):
        """D1 caps a row at 2 MB. Refusing the cache degrades to the live path;
        writing it would fail the whole batch."""
        # Random hex: compression can't shrink it under the cap, unlike "x"*n.
        huge = [os.urandom(1000).hex() for _ in range(1600)]  # ~3.2 MB of JSON
        _index_video(service, "vid4", huge)
        assert service.get_transcript("vid4", "en") is None
        # And no language may be reported as stored on the strength of a
        # transcript that was never written — that would classify the video as
        # indexed and return silent zero matches.
        assert service.get_indexed_languages("vid4") == set()

    def test_unreadable_segments_read_as_a_cache_miss(self, service):
        _index_video(service, "vid5", ["fine"])
        conn = service._connect()
        try:
            conn.execute(
                "UPDATE indexed_transcripts SET segments = ? WHERE video_id = ?",
                ("{not json", "vid5"),
            )
            conn.commit()
        finally:
            conn.close()
        assert service.get_transcript("vid5", "en") is None


# ---------------------------------------------------------------------------
# Production safety
# ---------------------------------------------------------------------------

class TestRemoteBackendGuard:
    """Tests must not be able to reach production by accident.

    main.py calls load_dotenv(override=True) at import, so importing the app is
    enough to put real credentials in os.environ. A stray ALTER TABLE in
    ensure_schema once migrated the live D1 database from a local test run.
    """

    def test_refuses_remote_even_with_credentials_present(self, monkeypatch):
        from api.app.services import transcript_index

        monkeypatch.setenv("CF_ACCOUNT_ID", "acct")
        monkeypatch.setenv("CF_D1_DATABASE_ID", "db")
        monkeypatch.setenv("CF_API_TOKEN", "tok")
        monkeypatch.delenv("CLIPCHASE_ALLOW_REMOTE_IN_TESTS", raising=False)
        assert transcript_index._remote_backend() is None

        monkeypatch.setenv("TURSO_DATABASE_URL", "libsql://real-database")
        assert transcript_index._remote_backend() is None

    def test_service_connects_locally_despite_credentials(self, monkeypatch, tmp_path):
        from api.app.services import transcript_index

        monkeypatch.setenv("CF_ACCOUNT_ID", "acct")
        monkeypatch.setenv("CF_D1_DATABASE_ID", "db")
        monkeypatch.setenv("CF_API_TOKEN", "tok")
        svc = transcript_index.TranscriptIndexService(db_path=str(tmp_path / "guard.db"))
        conn = svc._connect()
        try:
            # A plain sqlite3.Connection, not one of the HTTP adapters.
            assert isinstance(conn, sqlite3.Connection)
        finally:
            conn.close()

    def test_opt_in_restores_remote_resolution(self, monkeypatch):
        from api.app.services import transcript_index

        monkeypatch.setenv("CLIPCHASE_ALLOW_REMOTE_IN_TESTS", "1")
        monkeypatch.setenv("CF_ACCOUNT_ID", "acct")
        monkeypatch.setenv("CF_D1_DATABASE_ID", "db")
        monkeypatch.setenv("CF_API_TOKEN", "tok")
        assert transcript_index._remote_backend() == "d1"


def test_empty_marker_rows_do_not_count_as_indexed(tmp_path):
    """Legacy '[]' rows must not hide a video: it should look un-indexed so a
    client refetches it, instead of being skipped and never matching."""
    svc = TranscriptIndexService(db_path=str(tmp_path / "idx.db"))
    svc.cache_video_transcripts(
        channel_id="UC" + "x" * 22,
        source_url="",
        video={"id": "v1", "title": "t", "publishedAt": "2026-01-01T00:00:00Z", "thumbnail": ""},
        transcripts=[{"language_code": "en", "language_label": "English", "is_generated": True,
                      "segments": [{"start": 0, "duration": 1, "text": "hi"}]}],
    )
    conn = svc._connect()
    try:
        conn.execute("UPDATE indexed_transcripts SET segments='[]' WHERE video_id='v1'")
        conn.commit()
    finally:
        conn.close()
    assert svc.get_indexed_languages("v1") == set()
    assert svc.get_channel_videos("UC" + "x" * 22) == []


def test_get_transcripts_for_bulk(tmp_path):
    svc = TranscriptIndexService(db_path=str(tmp_path / "idx.db"))
    ch = "UC" + "y" * 22
    def put(vid, lang, text):
        svc.cache_video_transcripts(
            channel_id=ch, source_url="",
            video={"id": vid, "title": vid, "publishedAt": "2026-01-01T00:00:00Z", "thumbnail": ""},
            transcripts=[{"language_code": lang, "language_label": lang, "is_generated": True,
                          "segments": [{"start": 0, "duration": 1, "text": text}]}],
        )
    put("a", "en", "alpha"); put("a", "hi", "अल्फा"); put("b", "en", "beta"); put("c", "en", "gamma")
    conn = svc._connect()
    try:
        conn.execute("UPDATE indexed_transcripts SET segments='[]' WHERE video_id='c'")
        conn.commit()
    finally:
        conn.close()
    got = svc.get_transcripts_for(["a", "b", "c", "missing", "a"])
    assert set(got) == {"a", "b"}
    assert set(got["a"]) == {"en", "hi"}
    assert got["b"]["en"]["segments"][0]["text"] == "beta"
    assert got["b"]["en"] == svc.get_transcript("b", "en")
    assert svc.get_transcripts_for([]) == {}
    with pytest.raises(ValueError):
        svc.get_transcripts_for([f"v{i}" for i in range(TranscriptIndexService.BULK_MAX_IDS + 1)])
