import functools
import json
import logging
import os
import time
from datetime import datetime
from typing import Iterator, List, Optional, Sequence

import anyio

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

logger = logging.getLogger(__name__)

from ..services.transcript_index import TranscriptIndexService
from ..services.youtube import (
    DEVANAGARI_RE,
    SUPPORTED_TRANSCRIPT_LANGUAGES as SUPPORTED_SEARCH_LANGUAGES,
    YouTubeService,
    human_script_variants,
    normalize_language_code,
)


def detect_query_language(keyword: str) -> str:
    return "hi" if DEVANAGARI_RE.search(keyword or "") else "en"


def preferred_transcript_languages(query_language: str) -> List[str]:
    return [query_language] + [code for code in SUPPORTED_SEARCH_LANGUAGES if code != query_language]


router = APIRouter()


# Both dependencies are async so FastAPI resolves them on the event loop
# instead of renting an anyio threadpool token per request. Plain `def` deps
# queue behind the default 40-token pool, which match-side index writes can
# saturate — the 1.3.2 match-transcript sw_message_timeout root cause.
async def get_yt_service():
    api_key = os.getenv("YT_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="YouTube API key not configured")
    return YouTubeService(api_key)


# lru_cache keeps the singleton; it lives on a sync helper because lru_cache
# on an async def would cache a one-shot coroutine object.
@functools.lru_cache(maxsize=1)
def _index_service_singleton():
    return TranscriptIndexService()


# Function identity stays stable, so FastAPI Depends(get_index_service) and
# app.dependency_overrides[get_index_service] in tests keep working.
async def get_index_service():
    return _index_service_singleton()


class SearchResult(BaseModel):
    video_id: str
    title: str
    published_at: str
    thumbnail: str
    transcript_language_code: str
    transcript_language_label: str
    search_terms_used: List[str]
    matches: List[dict]


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
    # When set (clients >= 1.3.3), /match also indexes the transcript
    # server-side after responding, replacing the separate /index/transcript
    # round-trip. The transcript is already in this request body; the client
    # was uploading it twice.
    channel_id: Optional[str] = None
    source_url: Optional[str] = None


class MatchResponse(BaseModel):
    match_result: Optional[SearchResult] = None


class IndexTranscriptRequest(BaseModel):
    channel_id: str
    source_url: str
    video: VideoInput
    transcript: TranscriptInput


class IndexTranscriptResponse(BaseModel):
    stored: int


def _fetch_channel_videos(
    service: YouTubeService,
    channel_id: str,
    max_videos: int,
    published_after: Optional[str],
    exclude_shorts: bool,
) -> List[dict]:
    playlist_id = service.fetch_uploads_playlist_id(channel_id)
    fetch_count = max_videos * 3 if (published_after or exclude_shorts) else max_videos
    videos = service.fetch_videos(playlist_id, max_videos=fetch_count, exclude_shorts=exclude_shorts)

    if published_after:
        try:
            cutoff_date = datetime.fromisoformat(published_after.replace("Z", "+00:00"))
            videos = [
                video
                for video in videos
                if datetime.fromisoformat(video["publishedAt"].replace("Z", "+00:00")) >= cutoff_date
            ][:max_videos]
        except ValueError:
            pass

    return videos


def _build_match_result(
    service: YouTubeService,
    keyword: str,
    video_id: str,
    title: str,
    published_at: str,
    thumbnail: str,
    transcript_data: dict,
) -> Optional[SearchResult]:
    query_language = detect_query_language(keyword)
    search_terms = human_script_variants(keyword)
    transcript_language = normalize_language_code(transcript_data.get("language_code"))
    segments = transcript_data.get("segments") or []
    if not segments:
        return None

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
        return None

    return SearchResult(
        video_id=video_id,
        title=title,
        published_at=published_at,
        thumbnail=thumbnail,
        transcript_language_code=transcript_language or query_language,
        transcript_language_label=transcript_data.get("language_label") or transcript_language or query_language,
        search_terms_used=transcript_search_terms,
        matches=matches,
    )


def _get_indexed_match(
    service: YouTubeService,
    index_service: TranscriptIndexService,
    video: dict,
    keyword: str,
    preferred_languages: Sequence[str],
) -> Optional[SearchResult]:
    # Resolve the languages this video actually has in ONE round-trip, then
    # fetch only those. The old nested loop called get_transcript() for every
    # (order x language) combination — up to ~25 Turso HTTP connections per
    # video; adding fr/es/pt (151ec1d) silently turned ~4 into ~25.
    stored = {normalize_language_code(code) for code in index_service.get_indexed_languages(video["id"])}
    stored.discard("")
    if not stored:
        return None

    # Try stored languages by query-language priority, each fetched once.
    priority = [normalize_language_code(code) for code in preferred_languages]
    ordered = [code for code in priority if code in stored]
    ordered += [code for code in stored if code not in ordered]

    for language in ordered:
        transcript_data = index_service.get_transcript(video["id"], language)
        if not transcript_data or not transcript_data.get("segments"):
            continue

        match_result = _build_match_result(
            service=service,
            keyword=keyword,
            video_id=video["id"],
            title=video["title"],
            published_at=video["publishedAt"],
            thumbnail=video["thumbnail"],
            transcript_data=transcript_data,
        )
        if match_result:
            return match_result

    return None


def _search_stream(
    service: YouTubeService,
    index_service: TranscriptIndexService,
    channel_id: str,
    keyword: str,
    max_videos: int,
    published_after: Optional[str],
    exclude_shorts: bool,
) -> Iterator[str]:
    # Flush headers + arm client idle timer before YouTube/FTS calls run. Cold
    # channels can take >45s to enumerate videos, which would trip the client's
    # SSE idle timeout before any payload reached it.
    yield ": ping\n\n"
    try:
        videos = _fetch_channel_videos(
            service=service,
            channel_id=channel_id,
            max_videos=max_videos,
            published_after=published_after,
            exclude_shorts=exclude_shorts,
        )

        query_language = detect_query_language(keyword)
        preferred_languages = preferred_transcript_languages(query_language)
        search_terms = human_script_variants(keyword)

        video_ids = [video["id"] for video in videos if video.get("id")]
        indexed_video_ids = index_service.get_indexed_video_ids(channel_id, video_ids)
        candidate_indexed_video_ids = index_service.find_candidate_video_ids(list(indexed_video_ids), search_terms)

        indexed_candidates = [video for video in videos if video["id"] in candidate_indexed_video_ids]
        indexed_remainder = [
            video
            for video in videos
            if video["id"] in indexed_video_ids and video["id"] not in candidate_indexed_video_ids
        ]
        live_videos = [video for video in videos if video["id"] not in indexed_video_ids]

        meta_payload = {
            "channel_id": channel_id,
            "total": len(videos),
            "indexed": len(indexed_video_ids),
            "indexed_candidates": len(indexed_candidates),
            "indexed_remainder": len(indexed_remainder),
            "live": len(live_videos),
            "skip_live": True,
        }
        yield f"event: meta\ndata: {json.dumps(meta_payload)}\n\n"

        for batch in (indexed_candidates, indexed_remainder):
            for video in batch:
                try:
                    match_result = _get_indexed_match(
                        service=service,
                        index_service=index_service,
                        video=video,
                        keyword=keyword,
                        preferred_languages=preferred_languages,
                    )
                    if match_result:
                        yield f"data: {match_result.model_dump_json()}\n\n"
                    else:
                        # No-match videos emit no data; without a heartbeat the
                        # client's SSE idle timer trips on long no-match runs.
                        yield ": ping\n\n"
                except Exception:
                    yield ": ping\n\n"

        # Hand un-indexed videos back to the client so it can fetch transcripts
        # locally (e.g. an extension's service worker) and call /api/match.
        payload = {"videos": live_videos}
        yield f"event: unindexed_videos\ndata: {json.dumps(payload)}\n\n"

        yield "event: done\ndata: {}\n\n"

    except Exception:
        logger.exception(
            "search stream failed channel_id=%s keyword=%s",
            channel_id,
            keyword,
        )
        yield f"event: error\ndata: {json.dumps({'detail': 'An internal server error occurred.', 'status': 500})}\n\n"


@router.get("/search")
async def search(
    channel_url: str,
    keyword: str,
    max_videos: int = 20,
    published_after: Optional[str] = None,
    exclude_shorts: bool = False,
    # Accepted for compat with clients that still send it; skip-live is now
    # the only behavior (the extension always sent skip_live=true).
    skip_live: bool = True,
    service: YouTubeService = Depends(get_yt_service),
    index_service: TranscriptIndexService = Depends(get_index_service),
):
    channel_id = service.resolve_channel_id(channel_url)
    if not channel_id:
        raise HTTPException(status_code=400, detail="Invalid YouTube channel URL or ID")

    return StreamingResponse(
        _search_stream(
            service=service,
            index_service=index_service,
            channel_id=channel_id,
            keyword=keyword,
            max_videos=max_videos,
            published_after=published_after,
            exclude_shorts=exclude_shorts,
        ),
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


@router.post("/videos", response_model=VideoListResponse)
async def list_videos(
    req: VideoListRequest,
    service: YouTubeService = Depends(get_yt_service),
):
    channel_id = service.resolve_channel_id(req.channel_url)
    if not channel_id:
        raise HTTPException(status_code=400, detail="Invalid YouTube channel URL or ID")

    videos = _fetch_channel_videos(
        service=service,
        channel_id=channel_id,
        max_videos=req.max_videos,
        published_after=req.published_after,
        exclude_shorts=req.exclude_shorts,
    )
    return VideoListResponse(channel_id=channel_id, videos=videos)


@router.post("/index/transcript")
def index_transcript(
    req: IndexTranscriptRequest,
    index_service: TranscriptIndexService = Depends(get_index_service),
):
    # Validate channel_id format only.
    if not req.channel_id or not req.channel_id.startswith("UC") or len(req.channel_id) != 24:
        raise HTTPException(status_code=400, detail="Invalid channel_id")

    transcript_data = {
        "language_code": req.transcript.language_code,
        "language_label": req.transcript.language_label,
        "is_generated": req.transcript.is_generated,
        "segments": [segment.model_dump() for segment in req.transcript.segments],
    }
    video_data = req.video.model_dump()

    def _stream():
        try:
            for item in index_service.cache_video_transcripts_with_progress(
                channel_id=req.channel_id,
                source_url=req.source_url,
                video=video_data,
                transcripts=[transcript_data],
            ):
                if isinstance(item, int):
                    yield f"event: done\ndata: {json.dumps({'stored': item})}\n\n"
                else:
                    yield ": ping\n\n"
        except Exception as exc:
            logger.exception(
                "index_transcript failed channel=%s video=%s segments=%s",
                req.channel_id,
                req.video.id,
                len(req.transcript.segments),
            )
            yield f"event: error\ndata: {json.dumps({'detail': str(exc)[:500]})}\n\n"

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# Bulkhead for match-side index writes: an explicit limiter makes
# anyio.to_thread.run_sync draw from its own token pool instead of the default
# 40-token pool that also serves sync deps and SSE generator iteration. Index
# writes hold threads for minutes under Turso pressure; on the shared pool
# they starved every /match and /search on the instance.
# ponytail: 4 concurrent writes — Turso serializes write POSTs behind
# _global_write_lock anyway, so more tokens buy queueing, not throughput.
_INDEX_WRITE_LIMITER: Optional[anyio.CapacityLimiter] = None


def _index_write_limiter() -> anyio.CapacityLimiter:
    # Lazy: CapacityLimiter must be created while an event loop is running.
    global _INDEX_WRITE_LIMITER
    if _INDEX_WRITE_LIMITER is None:
        _INDEX_WRITE_LIMITER = anyio.CapacityLimiter(4)
    return _INDEX_WRITE_LIMITER


async def _index_after_match(
    index_service: TranscriptIndexService,
    channel_id: str,
    source_url: str,
    video: dict,
    transcript_data: dict,
) -> None:
    await anyio.to_thread.run_sync(
        functools.partial(
            _index_after_match_sync,
            index_service,
            channel_id,
            source_url,
            video,
            transcript_data,
        ),
        limiter=_index_write_limiter(),
    )


def _index_after_match_sync(
    index_service: TranscriptIndexService,
    channel_id: str,
    source_url: str,
    video: dict,
    transcript_data: dict,
) -> None:
    # Runs as a Starlette background task: after the response is sent, before
    # the ASGI request completes — Vercel keeps the invocation alive until it
    # returns (Python's waitUntil). Best-effort by design: a lost write only
    # means the next search of this channel refetches and re-indexes.
    #
    # Retry once: production showed Turso batch POSTs hitting httpx
    # ReadTimeout under cold-wake/concurrent-write pressure, and the write is
    # idempotent per video (single delete+insert commit), so a whole-video
    # retry is safe.
    for attempt in (1, 2):
        try:
            index_service.cache_video_transcripts(
                channel_id=channel_id,
                source_url=source_url,
                video=video,
                transcripts=[transcript_data],
            )
            return
        except Exception:
            if attempt == 2:
                logger.exception(
                    "match-side indexing failed twice channel=%s video=%s",
                    channel_id,
                    video.get("id"),
                )
            else:
                logger.warning(
                    "match-side indexing retrying channel=%s video=%s",
                    channel_id,
                    video.get("id"),
                )
                time.sleep(5)


@router.post("/match", response_model=MatchResponse)
async def match_transcript(
    req: MatchRequest,
    background_tasks: BackgroundTasks,
    service: YouTubeService = Depends(get_yt_service),
    index_service: TranscriptIndexService = Depends(get_index_service),
):
    transcript_data = {
        "language_code": req.transcript.language_code,
        "language_label": req.transcript.language_label,
        "is_generated": req.transcript.is_generated,
        "segments": [segment.model_dump() for segment in req.transcript.segments],
    }

    match_result = _build_match_result(
        service=service,
        keyword=req.keyword,
        video_id=req.video.id,
        title=req.video.title,
        published_at=req.video.publishedAt,
        thumbnail=req.video.thumbnail,
        transcript_data=transcript_data,
    )

    # Same channel_id validation as /index/transcript.
    if req.channel_id and req.channel_id.startswith("UC") and len(req.channel_id) == 24:
        background_tasks.add_task(
            _index_after_match,
            index_service,
            req.channel_id,
            req.source_url or "",
            req.video.model_dump(),
            transcript_data,
        )

    return MatchResponse(match_result=match_result)
