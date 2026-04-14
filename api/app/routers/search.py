import json
import os
import re
from datetime import datetime
from typing import Iterator, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..services.youtube import YouTubeService, human_script_variants, normalize_language_code

DEVANAGARI_RE = re.compile(r"[\u0900-\u097F]")
SUPPORTED_SEARCH_LANGUAGES = ("en", "hi")


def detect_query_language(keyword: str) -> str:
    return "hi" if DEVANAGARI_RE.search(keyword or "") else "en"


def transcript_language_orders(query_language: str) -> List[List[str]]:
    preferred = [query_language] + [code for code in SUPPORTED_SEARCH_LANGUAGES if code != query_language]
    orders: List[List[str]] = [preferred]

    for language in preferred[1:]:
        order = [language] + [code for code in preferred if code != language]
        if order not in orders:
            orders.append(order)

    return orders


router = APIRouter()


def get_yt_service():
    api_key = os.getenv("YT_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="YouTube API key not configured")
    proxy_url = os.getenv("PROXY_URL")
    worker_url = os.getenv("TRANSCRIPT_WORKER_URL")
    if worker_url:
        print(f"DEBUG: Using Cloudflare Worker for transcripts: {worker_url}")
    elif proxy_url:
        print("DEBUG: PROXY_URL is configured for transcript requests.")
    else:
        print("DEBUG: No Worker or proxy configured — using direct transcript API (local dev only).")
    return YouTubeService(api_key, proxy_url=proxy_url, worker_url=worker_url)


class SearchResult(BaseModel):
    video_id: str
    title: str
    published_at: str
    thumbnail: str
    transcript_language_code: str
    transcript_language_label: str
    search_terms_used: List[str]
    matches: List[dict]


def _search_stream(
    service: YouTubeService,
    channel_id: str,
    keyword: str,
    max_videos: int,
    published_after: Optional[str],
    exclude_shorts: bool,
) -> Iterator[str]:
    try:
        playlist_id = service.fetch_uploads_playlist_id(channel_id)
        fetch_count = max_videos * 3 if (published_after or exclude_shorts) else max_videos
        videos = service.fetch_videos(playlist_id, max_videos=fetch_count, exclude_shorts=exclude_shorts)

        if published_after:
            try:
                cutoff_date = datetime.fromisoformat(published_after.replace("Z", "+00:00"))
                videos = [
                    v for v in videos
                    if datetime.fromisoformat(v["publishedAt"].replace("Z", "+00:00")) >= cutoff_date
                ][:max_videos]
            except ValueError as e:
                print(f"DEBUG: Invalid date format: {published_after}, error: {e}")

        print(f"DEBUG: Found {len(videos)} videos in playlist {playlist_id} (after date filter)")

        query_language = detect_query_language(keyword)
        preferred_language_orders = transcript_language_orders(query_language)
        search_terms = human_script_variants(keyword)

        found_any = False
        for video in videos:
            print(f"DEBUG: Analyzing Video {video['id']}: '{video['title']}'...")

            try:
                transcript_attempted = False
                tried_transcript_languages = set()
                match_result = None

                for language_order in preferred_language_orders:
                    transcript_data = service.get_transcript(video["id"], preferred_languages=language_order)
                    if not transcript_data or not transcript_data.get("segments"):
                        continue

                    transcript_attempted = True
                    transcript_language = normalize_language_code(transcript_data.get("language_code"))
                    if transcript_language in tried_transcript_languages:
                        continue
                    tried_transcript_languages.add(transcript_language)
                    transcript_search_terms = service.expand_search_terms_for_transcript(
                        search_terms,
                        transcript_data["segments"],
                        transcript_language or query_language,
                    )

                    print(
                        f"DEBUG: Transcript found for {video['id']} in {transcript_language or 'unknown'}. "
                        f"Searching for {transcript_search_terms}..."
                    )
                    matches = service.search_in_transcript(
                        transcript_data["segments"],
                        transcript_search_terms,
                        transcript_language=transcript_language or query_language,
                    )
                    if matches:
                        match_result = SearchResult(
                            video_id=video["id"],
                            title=video["title"],
                            published_at=video["publishedAt"],
                            thumbnail=video["thumbnail"],
                            transcript_language_code=transcript_language or query_language,
                            transcript_language_label=transcript_data.get("language_label") or transcript_language or query_language,
                            search_terms_used=transcript_search_terms,
                            matches=matches,
                        )
                        break

                if match_result:
                    print(f"DEBUG: FOUND {len(match_result.matches)} matches in {video['id']}")
                    found_any = True
                    yield f"data: {match_result.model_dump_json()}\n\n"
                elif transcript_attempted:
                    print(f"DEBUG: No matches found in {video['id']} across supported transcript tracks")
                else:
                    print(f"DEBUG: No supported transcript found for {video['id']}")
            except Exception as inner_e:
                print(f"DEBUG ERROR: Failed analyzing video {video['id']}: {inner_e}")

        if not found_any and getattr(service, "proxy_error_detected", False):
            print("DEBUG ERROR: Search finished but proxy errors were detected.")
            yield f"event: error\ndata: {json.dumps({'detail': 'Proxy connection failed. Verify PROXY_URL format and credentials.', 'status': 502})}\n\n"
            return

        if not found_any and getattr(service, "worker_url", None) and getattr(service, "worker_failures", 0) > 0:
            print("DEBUG ERROR: Search finished but all Worker transcript calls failed.")
            yield f"event: error\ndata: {json.dumps({'detail': 'Cloudflare Worker failed to fetch transcripts. Check that the Worker is deployed and TRANSCRIPT_WORKER_URL is correct.', 'status': 502})}\n\n"
            return

        if not found_any and service.block_detected:
            print("DEBUG ERROR: Search finished but IP block was detected.")
            if getattr(service, "proxy_url", None):
                detail = (
                    "YouTube blocked the request even with PROXY_URL. "
                    "Verify proxy quality, rotation, and credentials."
                )
            else:
                detail = "YouTube blocked the request. Please configure PROXY_URL."
            yield f"event: error\ndata: {json.dumps({'detail': detail, 'status': 403})}\n\n"
            return

        print(f"DEBUG: Streaming complete.")
        yield "event: done\ndata: {}\n\n"

    except Exception as e:
        print(f"DEBUG ERROR: Unexpected error in search stream: {str(e)}")
        import traceback
        traceback.print_exc()
        yield f"event: error\ndata: {json.dumps({'detail': 'An internal server error occurred.', 'status': 500})}\n\n"


@router.get("/search")
async def search(
    channel_url: str,
    keyword: str,
    max_videos: int = 20,
    published_after: Optional[str] = None,
    exclude_shorts: bool = False,
    service: YouTubeService = Depends(get_yt_service),
):
    channel_id = service.resolve_channel_id(channel_url)
    if not channel_id:
        raise HTTPException(status_code=400, detail="Invalid YouTube channel URL or ID")

    return StreamingResponse(
        _search_stream(service, channel_id, keyword, max_videos, published_after, exclude_shorts),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/suggest-channels")
async def suggest_channels(
    q: str = "",
    service: YouTubeService = Depends(get_yt_service),
):
    if len(q.strip()) < 2:
        return []
    try:
        response = service.youtube.search().list(
            part="snippet",
            q=q,
            type="channel",
            maxResults=5,
        ).execute()
        return [
            {
                "id": item["id"]["channelId"],
                "title": item["snippet"]["title"],
                "thumbnail": item["snippet"].get("thumbnails", {}).get("default", {}).get("url", ""),
            }
            for item in response.get("items", [])
        ]
    except Exception as e:
        print(f"DEBUG: suggest-channels error: {e}")
        return []


@router.get("/resolve-channel")
async def resolve_channel(
    channel_url: str,
    service: YouTubeService = Depends(get_yt_service),
):
    channel_id = service.resolve_channel_id(channel_url)
    if not channel_id:
        raise HTTPException(status_code=400, detail="Could not resolve channel")
    return {"channel_id": channel_id}
