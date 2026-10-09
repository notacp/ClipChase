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
    assert alert_level(50, None) == "ok"
    assert alert_level(72, None) == "warn"
    assert alert_level(50, 20) == "warn"
    assert alert_level(86, None) == "urgent"
    assert alert_level(40, 5) == "urgent"


def test_cron_requires_secret(monkeypatch):
    from fastapi.testclient import TestClient
    from api.app.main import app

    c = TestClient(app)
    monkeypatch.delenv("CRON_SECRET", raising=False)
    assert c.get("/api/cron/capacity").status_code == 401
    monkeypatch.setenv("CRON_SECRET", "s3")
    assert c.get("/api/cron/capacity", headers={"Authorization": "Bearer nope"}).status_code == 401
