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
    return YouTubeService(api_key)


class SearchResult(BaseModel):
    video_id: str
    title: str
    published_at: str
    thumbnail: str
    transcript_language_code: str
    transcript_language_label: str
    search_terms_used: List[str]
    matches: List[dict]


# ── Extension API request / response models ───────────────────────────────────

class VideoListRequest(BaseModel):
    channel_url: str
    max_videos: int = 20
    published_after: Optional[str] = None
    exclude_shorts: bool = False


class VideoListResponse(BaseModel):
    channel_id: str
    videos: List[dict]


class VideoInput(BaseModel):
    id: str
    title: str
    publishedAt: str
    thumbnail: str


class SegmentInput(BaseModel):
    start: float
    duration: float
    text: str


class TranscriptInput(BaseModel):
    language_code: str
    language_label: str
    is_generated: bool
    segments: List[SegmentInput]


class MatchRequest(BaseModel):
    keyword: str
    video: VideoInput
    transcript: TranscriptInput


class MatchResponse(BaseModel):
    match_result: Optional[SearchResult] = None


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
            except ValueError:
                pass

        query_language = detect_query_language(keyword)
        preferred_language_orders = transcript_language_orders(query_language)
        search_terms = human_script_variants(keyword)

        found_any = False
        for video in videos:
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
                    found_any = True
                    yield f"data: {match_result.model_dump_json()}\n\n"
            except Exception:
                pass

        yield "event: done\ndata: {}\n\n"

    except Exception:
        yield f"event: error\ndata: {json.dumps({'detail': 'An internal server error occurred.', 'status': 500})}\n\n"


@router.get("/transcript/{video_id}")
async def get_transcript(
    video_id: str,
    lang: str = "en",
    service: YouTubeService = Depends(get_yt_service),
):
    preferred = [lang, "en", "hi"]
    result = service.get_transcript(video_id, preferred_languages=preferred)
    if not result:
        raise HTTPException(status_code=404, detail="No transcript available")
    return result


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
    except Exception:
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


@router.post("/videos", response_model=VideoListResponse)
async def list_videos(
    req: VideoListRequest,
    service: YouTubeService = Depends(get_yt_service),
):
    """Return the video list for a channel — no transcript work."""
    channel_id = service.resolve_channel_id(req.channel_url)
    if not channel_id:
        raise HTTPException(status_code=400, detail="Invalid YouTube channel URL or ID")

    playlist_id = service.fetch_uploads_playlist_id(channel_id)
    fetch_count = req.max_videos * 3 if (req.published_after or req.exclude_shorts) else req.max_videos
    videos = service.fetch_videos(playlist_id, max_videos=fetch_count, exclude_shorts=req.exclude_shorts)

    if req.published_after:
        try:
            cutoff_date = datetime.fromisoformat(req.published_after.replace("Z", "+00:00"))
            videos = [
                v for v in videos
                if datetime.fromisoformat(v["publishedAt"].replace("Z", "+00:00")) >= cutoff_date
            ][:req.max_videos]
        except ValueError:
            pass

    return VideoListResponse(channel_id=channel_id, videos=videos)



@router.post("/match", response_model=MatchResponse)
async def match_transcript(
    req: MatchRequest,
    service: YouTubeService = Depends(get_yt_service),
):
    """Match a single pre-fetched transcript against a keyword.

    The extension fetches transcripts directly in the browser and sends them
    here for phonetic / cross-script matching.  Returns match_result=null
    (HTTP 200) when no matches are found so the per-video loop in the
    extension can continue without treating misses as errors.
    """
    query_language = detect_query_language(req.keyword)
    search_terms = human_script_variants(req.keyword)
    transcript_language = normalize_language_code(req.transcript.language_code)
    segments = [seg.model_dump() for seg in req.transcript.segments]

    transcript_search_terms = service.expand_search_terms_for_transcript(
        search_terms,
        segments,
        transcript_language or query_language,
    )

    matches = service.search_in_transcript(
        segments,
        transcript_search_terms,
        transcript_language=transcript_language or query_language,
    )

    if not matches:
        return MatchResponse(match_result=None)

    return MatchResponse(
        match_result=SearchResult(
            video_id=req.video.id,
            title=req.video.title,
            published_at=req.video.publishedAt,
            thumbnail=req.video.thumbnail,
            transcript_language_code=transcript_language or query_language,
            transcript_language_label=req.transcript.language_label or transcript_language or query_language,
            search_terms_used=transcript_search_terms,
            matches=matches,
        )
    )
