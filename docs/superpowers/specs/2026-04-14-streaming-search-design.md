# Streaming Search Results

**Date:** 2026-04-14  
**Status:** Approved  
**Scope:** `api/app/routers/search.py`, `src/app/api/[...path]/route.ts`, `src/app/page.tsx`, `api/tests/test_search_router.py`

---

## Problem

The `/api/search` endpoint processes up to 20 videos sequentially — fetching transcripts and running phonetic matching for each — before returning a single JSON response. This takes 60–90 seconds. The frontend has a 60-second hard timeout, so most searches time out before results arrive.

---

## Goal

Stream each matching video to the browser the moment it is found, so results appear progressively. The user sees the first result within a few seconds of the first match being found, rather than waiting for all 20 videos to finish.

---

## Approach

Server-Sent Events (SSE). The backend emits one event per matching video, then a terminal `done` event. The frontend reads the stream line by line and appends results to the list as they arrive.

This is Approach A (match-only events). Progress events per scanned video are deferred to a future iteration (Approach C).

---

## Event Protocol

All events are emitted over a single HTTP response with `Content-Type: text/event-stream`.

### Match event (one per matching video)
```
data: <SearchResult as JSON>\n\n
```

`SearchResult` JSON shape is unchanged from the current batch response:
```json
{
  "video_id": "string",
  "title": "string",
  "published_at": "string",
  "thumbnail": "string",
  "transcript_language_code": "string",
  "transcript_language_label": "string",
  "search_terms_used": ["string"],
  "matches": [
    {
      "start": 12.0,
      "text": "string",
      "context_before": "string",
      "context_after": "string"
    }
  ]
}
```

### Done event (stream end, no results emitted via this event)
```
event: done\ndata: {}\n\n
```

### Error event (fatal error — stream ends after this)
```
event: error\ndata: {"detail": "string", "status": 403}\n\n
```

Errors that currently raise `HTTPException` (proxy failure, IP block, worker failure) are converted to `error` events instead.

---

## Backend Changes (`api/app/routers/search.py`)

The `search` endpoint changes from:
```python
@router.get("/search", response_model=List[SearchResult])
async def search(...) -> List[SearchResult]:
    ...
    return results
```

To:
```python
@router.get("/search")
async def search(...):
    return StreamingResponse(
        _search_stream(...),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
```

The existing video-processing loop is extracted into a sync generator `_search_stream(...)` that:
- `yield`s `f"data: {result.model_dump_json()}\n\n"` for each matching video
- `yield`s `"event: done\ndata: {}\n\n"` at the end
- `yield`s `"event: error\ndata: {json}\n\n"` and returns early on fatal errors (replacing `raise HTTPException`)

The `response_model` decorator is removed (incompatible with `StreamingResponse`).

---

## Proxy Changes (`src/app/api/[...path]/route.ts`)

The proxy currently rejects any non-JSON content type with a 502. SSE uses `text/event-stream` — add a passthrough branch:

```typescript
const contentType = response.headers.get("content-type") ?? "";

if (contentType.includes("text/event-stream")) {
    return new NextResponse(response.body, {
        status: response.status,
        headers: {
            "content-type": contentType,
            "cache-control": "no-cache",
            "x-accel-buffering": "no",
        },
    });
}

if (!contentType.includes("application/json")) {
    // existing error handling unchanged
}
```

---

## Frontend Changes (`src/app/page.tsx`)

Replace the existing fetch-and-parse-JSON pattern with a streaming reader:

**Before:**
```typescript
const response = await fetch(url, { signal: controller.signal });
const data: SearchResult[] = await response.json();
setResults(data);
```

**After:**
```typescript
const response = await fetch(url, { signal: controller.signal });
const reader = response.body!.getReader();
const decoder = new TextDecoder();
let buffer = "";
let currentEventType = ""; // tracks event type across lines and chunk boundaries

while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop()!; // keep incomplete last line

    for (const line of lines) {
        if (line.startsWith("event: ")) {
            currentEventType = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
            const payload = line.slice(6);
            if (currentEventType === "" && payload !== "{}") {
                // default event (no event: prefix) = match result
                const result: SearchResult = JSON.parse(payload);
                setResults(prev => [...prev, result]);
            } else if (currentEventType === "done") {
                setIsLoading(false);
            } else if (currentEventType === "error") {
                const { detail, status } = JSON.parse(payload);
                setError(detail);
                setErrorStatus(status);
                setIsLoading(false);
            }
            currentEventType = ""; // reset after data line consumed
        }
    }
}
```

The 60-second hard `setTimeout` is removed. The `AbortController` is kept for user-initiated cancellation (navigating away, new search submission).

---

## Test Changes (`api/tests/test_search_router.py`)

Existing tests assert `response.status_code == 200` and `response.json()` — both break with SSE. Tests are updated to:

1. Assert `response.status_code == 200`
2. Assert `response.headers["content-type"]` contains `text/event-stream`
3. Parse the response text line by line, collect `data:` lines, parse each as JSON
4. Assert on the collected results list

Helper added to tests:
```python
def parse_sse_results(response) -> list:
    results = []
    for line in response.text.splitlines():
        if line.startswith("data: ") and line[6:] not in ("{}", ""):
            results.append(json.loads(line[6:]))
    return results
```

Error-case tests (`403`, `502`) assert that the response text contains `event: error` and the expected detail.

---

## What Does Not Change

- `SearchResult` shape — same fields as today
- All service logic (`YouTubeService`, phonetic matching, transcript fetching)
- `LoadingStream` component — continues running its existing fake-timer animation while results stream in underneath
- The 60s timeout is removed; no replacement timeout is added (stream ends naturally on completion or `AbortController` cancel)

---

## Risks / Notes

- FastAPI's `StreamingResponse` with a sync generator runs the generator in a thread pool. The YouTube API calls inside `_search_stream` are synchronous — this is compatible.
- Next.js App Router buffers responses in some deployment configurations. The `X-Accel-Buffering: no` header disables nginx buffering. On Vercel, fluid compute passes streaming through without additional config.
- The `event:` / `data:` SSE parsing in the frontend must handle the case where a chunk boundary falls mid-line — the `buffer` variable handles this.
- Existing `test_search_router_returns_403_on_block` is a pre-existing failure unrelated to this change. It should remain in the same state after migration.
