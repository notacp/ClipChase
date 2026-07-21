import asyncio

from api.app.routers.search import (
    _index_service_singleton,
    get_index_service,
)


def test_get_index_service_returns_cached_singleton(monkeypatch, tmp_path):
    monkeypatch.setenv("CLIPCHASE_DB_PATH", str(tmp_path / "test.sqlite3"))
    monkeypatch.delenv("TURSO_DATABASE_URL", raising=False)
    _index_service_singleton.cache_clear()
    try:
        first = asyncio.run(get_index_service())   # cold path: worker thread
        second = asyncio.run(get_index_service())  # warm path: cached, on-loop
        assert first is second
    finally:
        _index_service_singleton.cache_clear()
