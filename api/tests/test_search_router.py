import inspect
import json
import os
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

# Set dummy env vars before importing main to prevent auth failures globally
os.environ["YT_API_KEY"] = "mock_api_key"

from api.app.main import app
from api.app.services.transcript_index import TranscriptIndexService

client = TestClient(app)


def parse_sse_results(response) -> list:
    """Collect all match-result data lines from an SSE response."""
    results = []
    for line in response.text.splitlines():
        if line.startswith("data: ") and line[6:] not in ("{}", ""):
            results.append(json.loads(line[6:]))
    return results


def parse_sse_error(response) -> dict:
    """Return the payload of the first `event: error` in an SSE response."""
    lines = response.text.splitlines()
    for i, line in enumerate(lines):
        if line == "event: error" and i + 1 < len(lines):
            data_line = lines[i + 1]
            if data_line.startswith("data: "):
                return json.loads(data_line[6:])
    return {}


@patch("api.app.routers.search.YouTubeService")
def test_videos_endpoint_returns_video_list(mock_yt_service_class):
    mock_service = MagicMock()
    mock_yt_service_class.return_value = mock_service

    mock_service.resolve_channel_id.return_value = "UC456"
    mock_service.fetch_uploads_playlist_id.return_value = "PL456"
    mock_service.fetch_videos.return_value = [
        {"id": "v1", "title": "Video 1", "publishedAt": "2024-06-01T00:00:00Z", "thumbnail": "t1"},
        {"id": "v2", "title": "Video 2", "publishedAt": "2024-05-01T00:00:00Z", "thumbnail": "t2"},
    ]

    response = client.post("/api/videos", json={"channel_url": "@fakechannel", "max_videos": 10})

    assert response.status_code == 200
    data = response.json()
    assert data["channel_id"] == "UC456"
    assert len(data["videos"]) == 2
    assert data["videos"][0]["id"] == "v1"
    mock_service.resolve_channel_id.assert_called_once_with("@fakechannel")
    mock_service.fetch_uploads_playlist_id.assert_called_once_with("UC456")
    # No date filter / no shorts → fetch_count == max_videos
    mock_service.fetch_videos.assert_called_once_with("PL456", max_videos=10, exclude_shorts=False)


@patch("api.app.routers.search.YouTubeService")
def test_match_endpoint_returns_match(mock_yt_service_class):
    mock_service = MagicMock()
    mock_yt_service_class.return_value = mock_service

    mock_service.expand_search_terms_for_transcript.return_value = ["posthog"]
    mock_service.search_in_transcript.return_value = [
        {"start": 5.0, "text": "we use posthog for analytics", "context_before": "", "context_after": ""}
    ]

    payload = {
        "keyword": "posthog",
        "video": {"id": "abc", "title": "Test Video", "publishedAt": "2024-01-01T00:00:00Z", "thumbnail": ""},
        "transcript": {
            "language_code": "en",
            "language_label": "English",
            "is_generated": False,
            "segments": [{"start": 5.0, "duration": 2.0, "text": "we use posthog for analytics"}],
        },
    }
    response = client.post("/api/match", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["match_result"] is not None
    assert data["match_result"]["video_id"] == "abc"
    assert data["match_result"]["title"] == "Test Video"
    assert data["match_result"]["transcript_language_code"] == "en"
    assert data["match_result"]["search_terms_used"] == ["posthog"]
    assert data["match_result"]["matches"][0]["start"] == 5.0


@patch("api.app.routers.search.YouTubeService")
def test_match_endpoint_returns_null_when_no_matches(mock_yt_service_class):
    mock_service = MagicMock()
    mock_yt_service_class.return_value = mock_service

    mock_service.expand_search_terms_for_transcript.return_value = ["posthog"]
    mock_service.search_in_transcript.return_value = []

    payload = {
        "keyword": "posthog",
        "video": {"id": "abc", "title": "Test Video", "publishedAt": "2024-01-01T00:00:00Z", "thumbnail": ""},
        "transcript": {
            "language_code": "en",
            "language_label": "English",
            "is_generated": False,
            "segments": [{"start": 0.0, "duration": 3.0, "text": "nothing relevant here"}],
        },
    }
    response = client.post("/api/match", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["match_result"] is None


@patch("api.app.routers.search.YouTubeService")
def test_search_router_sanitizes_500_errors(mock_yt_service_class):
    mock_service = MagicMock()
    mock_yt_service_class.return_value = mock_service

    mock_service.resolve_channel_id.return_value = "UC123"
    mock_service.expand_search_terms_for_transcript.side_effect = lambda terms, transcript, transcript_language: terms
    mock_service.fetch_uploads_playlist_id.side_effect = Exception("SENSITIVE_DB_OR_NETWORK_ERROR")

    response = client.get("/api/search?channel_url=fake&keyword=mock")

    assert response.status_code == 200
    assert "text/event-stream" in response.headers.get("content-type", "")
    error = parse_sse_error(response)
    assert error.get("status") == 500
    assert "An internal server error occurred" in error.get("detail", "")
    assert "SENSITIVE" not in error.get("detail", "")


# ── /api/index/transcript ────────────────────────────────────────────────────
# Covers the trim of the redundant service.resolve_channel_id call that
# caused the 5/20 cascade of 500s under burst. Handler now validates
# channel_id format only and trusts the caller-supplied ID downstream.

_VALID_VIDEO = {
    "id": "vid1",
    "title": "t",
    "publishedAt": "2026-01-01T00:00:00Z",
    "thumbnail": "https://i.ytimg.com/vi/vid1/default.jpg",
}
_VALID_TRANSCRIPT = {
    "language_code": "en",
    "language_label": "English",
    "is_generated": False,
    "segments": [{"start": 0.0, "duration": 1.0, "text": "hi"}],
}


def _index_payload(channel_id: str) -> dict:
    return {
        "channel_id": channel_id,
        "source_url": "https://www.youtube.com/@example",
        "video": _VALID_VIDEO,
        "transcript": _VALID_TRANSCRIPT,
    }


def _override_index_service(mock_index):
    # FastAPI resolves Depends(get_index_service) per request, so patching
    # the symbol doesn't intercept it. dependency_overrides is the correct
    # hook: maps the factory to a stub that returns our mock.
    from api.app.routers.search import get_index_service
    app.dependency_overrides[get_index_service] = lambda: mock_index
    return get_index_service


def test_index_transcript_accepts_valid_channel_id():
    mock_index = MagicMock()
    mock_index.cache_video_transcripts.return_value = 1
    dep = _override_index_service(mock_index)
    try:
        valid_id = "UC" + "x" * 22  # 24 chars total
        response = client.post("/api/index/transcript", json=_index_payload(valid_id))

        assert response.status_code == 200, response.text
        assert response.json() == {"stored": 1}
        # Must pass the caller-supplied channel_id straight through — proves the
        # redundant resolve_channel_id round trip is gone.
        mock_index.cache_video_transcripts.assert_called_once()
        kwargs = mock_index.cache_video_transcripts.call_args.kwargs
        assert kwargs["channel_id"] == valid_id
    finally:
        app.dependency_overrides.pop(dep, None)


def test_index_transcript_rejects_malformed_channel_id():
    mock_index = MagicMock()
    dep = _override_index_service(mock_index)
    try:
        for bad_id in ("", "xyz", "UC", "UCshort", "AB" + "x" * 22, "UC" + "x" * 23):
            response = client.post("/api/index/transcript", json=_index_payload(bad_id))
            assert response.status_code == 400, f"expected 400 for {bad_id!r}, got {response.status_code}"
            assert response.json() == {"detail": "Invalid channel_id"}

        # Validator must reject before any DB work happens.
        mock_index.cache_video_transcripts.assert_not_called()
    finally:
        app.dependency_overrides.pop(dep, None)


def test_deleted_get_transcript_endpoint_returns_404():
    # The unused GET /api/transcript/{video_id} server-side scraper was deleted
    # to shrink the Vercel bundle and remove a dead IP-ban surface.
    response = client.get("/api/transcript/abc123")
    assert response.status_code == 404


def test_index_transcript_runs_off_event_loop():
    # Handler must be sync so FastAPI runs it in a threadpool. The Turso write
    # path is blocking I/O; an `async def` handler runs it ON the event loop,
    # so a burst of fire-and-forget index calls stalls every concurrent request
    # (root cause of the 502/504 FUNCTION_INVOCATION_TIMEOUT cascade).
    from api.app.routers.search import index_transcript

    assert not inspect.iscoroutinefunction(index_transcript), (
        "index_transcript must be a sync def so blocking Turso I/O runs in a "
        "threadpool instead of blocking the event loop"
    )


def test_index_transcript_surfaces_pipeline_error_detail():
    # A bare `raise` returns FastAPI's generic "Internal Server Error" with no
    # body, which is why 172 client-side 500s were blind. The real reason must
    # reach the caller so telemetry can see it.
    mock_index = MagicMock()
    mock_index.cache_video_transcripts.side_effect = Exception(
        "Turso 400 on 5 reqs: invalid type"
    )
    dep = _override_index_service(mock_index)
    try:
        valid_id = "UC" + "x" * 22
        response = client.post("/api/index/transcript", json=_index_payload(valid_id))
        assert response.status_code == 500, response.text
        assert "Turso 400" in response.json().get("detail", "")
    finally:
        app.dependency_overrides.pop(dep, None)


def test_cache_video_transcripts_uses_single_connection(tmp_path):
    # One index request must open ONE connection, not one per upsert_* method.
    # Per-method reconnects multiplied Turso HTTP round-trips (each a fresh TLS
    # handshake), driving the timeouts. Uses a real local SQLite db (explicit
    # db_path always stays local) so the write is also verified end-to-end.
    svc = TranscriptIndexService(db_path=str(tmp_path / "idx.sqlite3"))
    connects = {"n": 0}
    real_connect = svc._connect

    def counting_connect():
        connects["n"] += 1
        return real_connect()

    svc._connect = counting_connect

    stored = svc.cache_video_transcripts(
        channel_id="UC" + "x" * 22,
        source_url="https://www.youtube.com/@example",
        video={
            "id": "vid1",
            "title": "t",
            "publishedAt": "2026-01-01T00:00:00Z",
            "thumbnail": "https://i.ytimg.com/vi/vid1/default.jpg",
        },
        transcripts=[
            {
                "language_code": "en",
                "language_label": "English",
                "is_generated": False,
                "segments": [{"start": 0.0, "duration": 1.0, "text": "hello world"}],
            }
        ],
    )

    assert stored == 1
    assert connects["n"] == 1, f"expected 1 connection per index, got {connects['n']}"

    # Write must actually round-trip back.
    got = svc.get_transcript("vid1", "en")
    assert got is not None
    assert got["segments"][0]["text"] == "hello world"
