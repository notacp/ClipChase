from api.app.services.capacity import alert_level, forecast_days_to_full

MB = 1_000_000


def test_forecast_linear_growth():
    # 10 MB/day, at 400 MB today -> 10 days to 500 MB
    hist = [(d, 300 * MB + 10 * MB * d) for d in range(11)]
    assert round(forecast_days_to_full(hist), 1) == 10.0


def test_forecast_none_without_growth_or_history():
    assert forecast_days_to_full([(1, 100 * MB)]) is None
    assert forecast_days_to_full([(1, 100 * MB), (2, 90 * MB)]) is None


def test_levels():
    # Eviction holds the index near 80%, so only climbing past it alerts;
    # a fast-growth forecast alone doesn't.
    assert alert_level(50, None) == "ok"
    assert alert_level(80, 2) == "ok"
    assert alert_level(85, None) == "warn"
    assert alert_level(89, None) == "urgent"


def test_cron_requires_secret(monkeypatch):
    from fastapi.testclient import TestClient
    from api.app.main import app

    c = TestClient(app)
    monkeypatch.delenv("CRON_SECRET", raising=False)
    assert c.get("/api/cron/capacity").status_code == 401
    monkeypatch.setenv("CRON_SECRET", "s3")
    assert c.get("/api/cron/capacity", headers={"Authorization": "Bearer nope"}).status_code == 401
