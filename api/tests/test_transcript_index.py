import pytest

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
        assert "\"a\"" in row["segments"]

    def test_oversized_transcript_is_not_cached(self, service):
        """D1 caps a row at 2 MB. Refusing the cache degrades to the live path;
        writing it would fail the whole batch."""
        huge = ["x" * 2000 for _ in range(1200)]  # ~2.4 MB of JSON
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
