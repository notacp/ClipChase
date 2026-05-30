# Rate Limiting Design

**Date:** 2026-05-30  
**Status:** Approved

## Overview

Add per-IP, fixed-window rate limiting to the ClipChase API to prevent abuse of YouTube quota routes and protect compute on transcript-intensive endpoints. Upstash Redis REST is the backing store. The limiter is fail-open and a no-op when env vars are absent, so local dev and CI require no infrastructure.

---

## Architecture

### Module: `api/app/services/rate_limit.py`

Single class `UpstashRateLimiter` that:

1. Reads `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` from env at construction time.  
2. If either is absent → no-op mode; `is_limited()` always returns `(False, None)`.  
3. In production, holds a single `httpx.AsyncClient` (shared across requests).  
4. Implements `async is_limited(ip: str, route_group: str) → tuple[bool, int | None]`:
   - Builds Redis key `rl:{route_group}:{ip}`.
   - Issues a two-command Upstash pipeline (INCR + EXPIRE NX) in one HTTP round-trip.
   - If count > limit → `(True, seconds_remaining)`.
   - On any exception or timeout (2 s) → `(False, None)` (fail-open).
5. Exposes `async close()` to clean up the async client on shutdown.

**IP extraction helper** `extract_ip(request: Request) → str`:  
Checks `X-Forwarded-For` (first hop) before falling back to `request.client.host`. Normalizes IPv6 to compressed form.

### Middleware: `api/app/main.py`

Single `@app.middleware("http")` added after existing middleware:

```
for each request:
  skip if path == "/" or method == OPTIONS
  resolve route_group from path prefix:
    /api/search, /api/videos, /api/index/channel  → "yt_quota"   (20/min)
    /api/match, /api/index/transcript             → "burst"       (200/min)
    everything else                               → "default"     (60/min)
  limited, retry_after = await limiter.is_limited(ip, route_group)
  if limited:
    return JSONResponse({"detail": "rate limit exceeded"}, 429,
                        headers={"Retry-After": str(retry_after)})
  else:
    return await call_next(request)
```

Limiter instance is module-level; created once at app startup.  
`app.add_event_handler("shutdown", limiter.close)` for clean teardown.

---

## Rate Limits

| Route group | Paths | Limit | Window |
|---|---|---|---|
| `yt_quota` | `/api/search`, `/api/videos`, `/api/index/channel` | 20 req | 60 s |
| `burst` | `/api/match`, `/api/index/transcript` | 200 req | 60 s |
| `default` | all others | 60 req | 60 s |

Limits are per-IP, per-window. Window resets on first request (EXPIRE NX — no sliding reset on each hit).

---

## Upstash Key Scheme

```
rl:{route_group}:{ip}
```

Example: `rl:yt_quota:203.0.113.42`

TTL set with EXPIRE NX on the same pipeline as INCR, so the key auto-expires after 60 s. A burst of requests within the window shares one TTL; the window does not slide.

---

## Upstash Pipeline Request

Single POST to `{UPSTASH_REDIS_REST_URL}/pipeline`:

```json
[
  ["INCR", "rl:yt_quota:203.0.113.42"],
  ["EXPIRE", "rl:yt_quota:203.0.113.42", "60", "NX"]
]
```

Response: `[{"result": <count>}, {"result": 0|1}]`

Count from first result is compared against the limit.

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Env vars absent | No-op; all requests pass |
| Upstash unreachable | Fail-open; log warning; pass request |
| HTTP non-2xx from Upstash | Fail-open; log warning; pass request |
| Response timeout (> 2 s) | Fail-open; log warning; pass request |
| Count > limit | 429 + `Retry-After` header |

---

## Configuration

| Env var | Required | Notes |
|---|---|---|
| `UPSTASH_REDIS_REST_URL` | prod only | e.g. `https://…upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN` | prod only | Bearer token |

Both must be set for the limiter to activate. Either absent → no-op. Set via Vercel environment variables for the `api` project.

---

## Testing Plan

- **Unit: no-op mode** — construct limiter without env vars; assert `is_limited()` always `(False, None)`.
- **Unit: under limit** — mock `httpx.AsyncClient.post` returning count=1; assert not limited.
- **Unit: at limit** — mock returning count=20 for `yt_quota`; assert `(True, _)`.
- **Unit: over limit** — mock returning count=21; assert `(True, _)`.
- **Unit: fail-open on exception** — mock raises `httpx.TimeoutException`; assert `(False, None)`.
- **Unit: fail-open on non-2xx** — mock returns HTTP 503; assert `(False, None)`.
- **Integration: middleware skip** — `OPTIONS /api/search` → no limiter call, 200.
- **Integration: middleware skip health** — `GET /` → no limiter call.
- **Integration: route group mapping** — verify `/api/search` → `yt_quota`, `/api/match` → `burst`, `/api/health` → `default`.
- **Integration: 429 response** — mock limiter returning `(True, 45)`; assert response 429 with `Retry-After: 45`.

All tests use mocked Upstash; no real Redis in CI.
