"""match-side indexing: /match with channel_id indexes after responding."""
from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from api.app.main import app
from api.app.routers.search import get_index_service, get_yt_service


def _match_payload(**overrides):
    payload = {
        "keyword": "hello",
        "video": {
            "id": "vid1",
            "title": "T",
            "publishedAt": "2026-01-01T00:00:00Z",
            "thumbnail": "http://t",
        },
        "transcript": {
            "language_code": "en",
            "language_label": "English",
            "is_generated": True,
            "segments": [{"start": 0.0, "duration": 1.0, "text": "hello world"}],
        },
    }
    payload.update(overrides)
    return payload


def _client(index_service, yt_service):
    app.dependency_overrides[get_index_service] = lambda: index_service
    app.dependency_overrides[get_yt_service] = lambda: yt_service
    return TestClient(app)


def _yt_stub():
    yt = MagicMock()
    yt.search_in_transcript.return_value = [
        {"start": 0.0, "text": "hello world", "context_before": "", "context_after": ""}
    ]
    return yt


def teardown_function():
    app.dependency_overrides.clear()


def test_match_with_channel_id_indexes_in_background():
    index = MagicMock()
    client = _client(index, _yt_stub())
    resp = client.post(
        "/api/match",
        json=_match_payload(channel_id="UC" + "x" * 22, source_url="https://yt/@c"),
    )
    assert resp.status_code == 200
    # TestClient runs background tasks before returning.
    index.cache_video_transcripts.assert_called_once()
    kwargs = index.cache_video_transcripts.call_args.kwargs
    assert kwargs["channel_id"] == "UC" + "x" * 22
    assert kwargs["video"]["id"] == "vid1"
    assert kwargs["transcripts"][0]["language_code"] == "en"


def test_match_without_channel_id_does_not_index():
    index = MagicMock()
    client = _client(index, _yt_stub())
    resp = client.post("/api/match", json=_match_payload())
    assert resp.status_code == 200
    index.cache_video_transcripts.assert_not_called()


def test_match_with_malformed_channel_id_does_not_index():
    index = MagicMock()
    client = _client(index, _yt_stub())
    resp = client.post("/api/match", json=_match_payload(channel_id="not-a-channel"))
    assert resp.status_code == 200
    index.cache_video_transcripts.assert_not_called()


def test_already_indexed_video_skips_the_rewrite():
    index = MagicMock()
    index.get_indexed_languages.return_value = {"en"}
    client = _client(index, _yt_stub())
    resp = client.post(
        "/api/match",
        json=_match_payload(channel_id="UC" + "x" * 22, source_url="s"),
    )
    assert resp.status_code == 200
    # Overlapping searches send the same match concurrently; a duplicate
    # rewrite's interleaved delete/insert phases can orphan the marker.
    index.cache_video_transcripts.assert_not_called()


def test_indexed_check_failure_falls_through_to_write():
    index = MagicMock()
    index.get_indexed_languages.side_effect = RuntimeError("reads blocked")
    client = _client(index, _yt_stub())
    resp = client.post(
        "/api/match",
        json=_match_payload(channel_id="UC" + "x" * 22, source_url="s"),
    )
    assert resp.status_code == 200
    index.cache_video_transcripts.assert_called_once()


def test_index_failure_is_dropped_and_never_breaks_the_match_response():
    index = MagicMock()
    index.cache_video_transcripts.side_effect = RuntimeError("turso down")
    client = _client(index, _yt_stub())
    resp = client.post(
        "/api/match",
        json=_match_payload(channel_id="UC" + "x" * 22, source_url="s"),
    )
    assert resp.status_code == 200
    assert resp.json()["match_result"] is not None
    # Cache-fill is fail-fast: no retry — a retry doubles the invocation tail
    # during Turso slow spells (the Jul-2026 match-timeout pileup). The next
    # search of this channel self-heals the missing write.
    assert index.cache_video_transcripts.call_count == 1
