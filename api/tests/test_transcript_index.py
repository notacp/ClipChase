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


class TestFindCandidateVideoIds:
    def test_single_word_match(self, service):
        _index_video(service, "v1", ["today we talk about startups", "and other things"])
        assert service.find_candidate_video_ids(["v1"], ["startups"]) == {"v1"}

    def test_single_word_absent(self, service):
        _index_video(service, "v1", ["today we talk about startups"])
        assert service.find_candidate_video_ids(["v1"], ["kubernetes"]) == set()

    def test_phrase_within_one_segment(self, service):
        _index_video(service, "v1", ["machine learning is the future"])
        assert service.find_candidate_video_ids(["v1"], ["machine learning"]) == {"v1"}

    def test_phrase_spanning_segment_boundary(self, service):
        # YouTube chops captions into 2-5 word segments; the phrase regularly
        # splits across rows. The pre-filter must still pass the video so the
        # sliding-window matcher can confirm adjacency.
        _index_video(service, "v1", ["so we built a machine", "learning model from scratch"])
        assert service.find_candidate_video_ids(["v1"], ["machine learning"]) == {"v1"}

    def test_phrase_with_only_one_token_present_is_rejected(self, service):
        _index_video(service, "v1", ["we built a machine", "from spare parts"])
        assert service.find_candidate_video_ids(["v1"], ["machine learning"]) == set()

    def test_any_term_variant_qualifies(self, service):
        # Variants are alternate scripts of the same keyword — one passing is enough.
        _index_video(service, "v1", ["aaj startup ke baare mein"])
        assert service.find_candidate_video_ids(["v1"], ["nonexistent phrase here", "startup"]) == {"v1"}

    def test_scopes_to_requested_video_ids(self, service):
        _index_video(service, "v1", ["machine learning content"])
        _index_video(service, "v2", ["machine learning content"])
        assert service.find_candidate_video_ids(["v2"], ["machine learning"]) == {"v2"}

    def test_empty_inputs(self, service):
        _index_video(service, "v1", ["machine learning content"])
        assert service.find_candidate_video_ids([], ["machine learning"]) == set()
        assert service.find_candidate_video_ids(["v1"], [""]) == set()


class TestGetIndexedVideoIds:
    """Locks fix 1773b5a (the orphan JOIN). get_indexed_video_ids must JOIN
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
        assert service.get_indexed_video_ids("chan1", ["v1"]) == set()

    def test_video_with_transcript_is_indexed(self, service):
        _index_video(service, "v1", ["machine learning content"])
        assert service.get_indexed_video_ids("chan1", ["v1"]) == {"v1"}


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
