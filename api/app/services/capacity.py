"""D1 capacity check: size, forecast, alert via PostHog.

Oct 2026: the database hit the free plan's 500 MB cap and every index write
failed for three days before anyone noticed — writes are best-effort, so the
product failed open and silently. Google SRE's rule for saturation applies:
alert on "nearly problematic" and on the forecast ("will fill in N days"),
not only on the wall.

A daily Vercel cron calls /api/cron/capacity. It reads the database size,
appends it to a one-row-per-day log inside the database, fits a slope over
the last 14 days, and sends a `d1_capacity` event to PostHog. PostHog alerts
on that event deliver the email, so there is no new service to run.

ponytail: storage only. Daily rows_read/rows_written need the Cloudflare
GraphQL Analytics API, which this token can't read; Cloudflare itself emails
when the daily row limit is hit. Add "Account Analytics: Read" to the token
to extend this.
"""
from __future__ import annotations

import logging
import os
import time
from datetime import date
from typing import List, Optional, Tuple

import httpx

logger = logging.getLogger(__name__)

D1_FREE_CAP_BYTES = 500 * 1000 * 1000
# Since Oct 11 the index evicts its oldest rows past 80% (D1_EVICT_AT_BYTES)
# and stops writing at 90%, so it sits near 80% by design. Alert when it
# climbs past that: eviction is failing or falling behind.
# days_to_full is still reported, for context only.
WARN_PCT, URGENT_PCT = 84.0, 88.0


def forecast_days_to_full(history: List[Tuple[int, int]], cap: int = D1_FREE_CAP_BYTES) -> Optional[float]:
    """Least-squares slope over (day_number, size_bytes) points, then days until
    the latest size reaches cap. None when there's no growth to project."""
    if len(history) < 2:
        return None
    n = len(history)
    mx = sum(x for x, _ in history) / n
    my = sum(y for _, y in history) / n
    var = sum((x - mx) ** 2 for x, _ in history)
    if var == 0:
        return None
    slope = sum((x - mx) * (y - my) for x, y in history) / var
    if slope <= 0:
        return None
    latest = max(history)[1]
    return max(0.0, (cap - latest) / slope)


def alert_level(pct: float, days_to_full: Optional[float] = None) -> str:
    if pct >= URGENT_PCT:
        return "urgent"
    if pct >= WARN_PCT:
        return "warn"
    return "ok"


# --- daily row quotas ----------------------------------------------------------

D1_FREE_ROWS_READ_PER_DAY = 5_000_000
D1_FREE_ROWS_WRITTEN_PER_DAY = 100_000


def d1_usage(day: str, client=None, timeout: float = 10) -> Tuple[int, int]:
    """(rows_read, rows_written) for the whole account on a UTC day. The free
    plan's daily limits are account-wide, and hitting either one fails EVERY
    query, reads included, until 00:00 UTC. Needs the token's "Account
    Analytics: Read" permission (added Oct 13 2026). Analytics lag a few
    minutes behind real usage."""
    query = (
        "query($a:String!,$d:Date!){viewer{accounts(filter:{accountTag:$a})"
        "{d1AnalyticsAdaptiveGroups(limit:100,filter:{date:$d}){sum{rowsRead rowsWritten}}}}}"
    )
    r = (client or httpx).post(
        "https://api.cloudflare.com/client/v4/graphql",
        headers={"Authorization": f"Bearer {os.environ['CF_API_TOKEN']}"},
        json={"query": query, "variables": {"a": os.environ["CF_ACCOUNT_ID"], "d": day}},
        timeout=timeout,
    )
    body = r.json()
    if body.get("errors"):
        raise RuntimeError(str(body["errors"])[:300])
    groups = body["data"]["viewer"]["accounts"][0]["d1AnalyticsAdaptiveGroups"]
    return (
        sum(g["sum"]["rowsRead"] for g in groups),
        sum(g["sum"]["rowsWritten"] for g in groups),
    )


# --- delivery ---------------------------------------------------------------

_last_sent: dict = {}


def capture_server_event(event: str, properties: dict, throttle_s: float = 0) -> None:
    """Fire-and-forget PostHog event from the API. Never raises."""
    key = os.getenv("POSTHOG_API_KEY")  # public project key; NEXT_PUBLIC_* is not visible to the Python runtime
    if not key:
        return
    now = time.monotonic()
    if throttle_s and now - _last_sent.get(event, -1e9) < throttle_s:
        return
    _last_sent[event] = now
    try:
        httpx.post(
            "https://us.i.posthog.com/capture/",
            json={
                "api_key": key,
                "event": event,
                "distinct_id": "clipchase-api",
                "properties": {**properties, "app": "api", "$process_person_profile": False},
            },
            timeout=5,
        )
    except Exception:
        logger.warning("posthog capture failed event=%s", event)


# --- the check ----------------------------------------------------------------


def _d1(sql: str, params: Optional[list] = None) -> list:
    account, db = os.environ["CF_ACCOUNT_ID"], os.environ["CF_D1_DATABASE_ID"]
    r = httpx.post(
        f"https://api.cloudflare.com/client/v4/accounts/{account}/d1/database/{db}/query",
        headers={"Authorization": f"Bearer {os.environ['CF_API_TOKEN']}"},
        json={"sql": sql, "params": params or []},
        timeout=20,
    )
    body = r.json()
    if not body.get("success"):
        raise RuntimeError(str(body.get("errors"))[:300])
    return body["result"][0]["results"]


_ORPHAN_BATCH, _ORPHAN_ROUNDS = 2000, 5


def _d1_changes(sql: str, params: list) -> int:
    account, db = os.environ["CF_ACCOUNT_ID"], os.environ["CF_D1_DATABASE_ID"]
    body = httpx.post(
        f"https://api.cloudflare.com/client/v4/accounts/{account}/d1/database/{db}/query",
        headers={"Authorization": f"Bearer {os.environ['CF_API_TOKEN']}"},
        json={"sql": sql, "params": params},
        timeout=60,
    ).json()
    if not body.get("success"):
        raise RuntimeError(str(body.get("errors"))[:300])
    return int(body["result"][0]["meta"].get("changes") or 0)


def run_capacity_check() -> dict:
    account, db = os.environ["CF_ACCOUNT_ID"], os.environ["CF_D1_DATABASE_ID"]
    info = httpx.get(
        f"https://api.cloudflare.com/client/v4/accounts/{account}/d1/database/{db}",
        headers={"Authorization": f"Bearer {os.environ['CF_API_TOKEN']}"},
        timeout=20,
    ).json()["result"]
    size = int(info["file_size"])
    today = date.today()

    history: List[Tuple[int, int]] = []
    log_error = None
    try:
        _d1("CREATE TABLE IF NOT EXISTS capacity_log (day TEXT PRIMARY KEY, size_bytes INTEGER NOT NULL)")
        _d1("INSERT OR REPLACE INTO capacity_log (day, size_bytes) VALUES (?, ?)", [today.isoformat(), size])
        rows = _d1("SELECT day, size_bytes FROM capacity_log ORDER BY day DESC LIMIT 14")
        history = [(date.fromisoformat(r["day"]).toordinal(), int(r["size_bytes"])) for r in rows]
    except Exception as exc:  # a full database can't take the log row; still alert
        log_error = str(exc)[:200]
        history = [(today.toordinal(), size)]

    # Orphan video rows (no transcript) cost a row read on every page-1
    # search of their channel. ~51k piled up before saves became one atomic
    # batch (Oct 17); clear them a slice a day while the day's write budget
    # is fresh. 1 write + ~4 reads per row, measured.
    orphans_deleted = 0
    try:
        for _ in range(_ORPHAN_ROUNDS):
            n = _d1_changes(
                "DELETE FROM indexed_videos WHERE video_id IN (SELECT v.video_id FROM indexed_videos v "
                "WHERE NOT EXISTS (SELECT 1 FROM indexed_transcripts t WHERE t.video_id = v.video_id) "
                "AND v.indexed_at < ? LIMIT ?)",
                [today.isoformat(), _ORPHAN_BATCH],
            )
            orphans_deleted += n
            if n < _ORPHAN_BATCH:
                break
    except Exception as exc:
        log_error = log_error or f"orphans: {str(exc)[:180]}"

    usage = {}
    try:
        yday = date.fromordinal(today.toordinal() - 1).isoformat()
        read, written = d1_usage(yday)
        usage = {
            "rows_read_yday": read,
            "rows_written_yday": written,
            "rows_read_pct_yday": round(100.0 * read / D1_FREE_ROWS_READ_PER_DAY, 1),
            "rows_written_pct_yday": round(100.0 * written / D1_FREE_ROWS_WRITTEN_PER_DAY, 1),
        }
    except Exception as exc:
        usage = {"usage_error": str(exc)[:200]}

    pct = round(100.0 * size / D1_FREE_CAP_BYTES, 1)
    days = forecast_days_to_full(history)
    result = {
        "database": info.get("name"),
        "size_mb": round(size / 1e6, 1),
        "cap_mb": D1_FREE_CAP_BYTES / 1e6,
        "pct_used": pct,
        "days_to_full": None if days is None else round(days, 1),
        "history_days": len(history),
        "level": alert_level(pct, days),
        "log_error": log_error,
        "orphans_deleted": orphans_deleted,
        **usage,
    }
    capture_server_event("d1_capacity", result)
    return result
