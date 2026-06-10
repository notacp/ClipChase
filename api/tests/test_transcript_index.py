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
