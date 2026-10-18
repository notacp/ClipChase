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


def test_kofi_webhook_verifies_token_and_drops_pii(monkeypatch):
    import json
    from urllib.parse import urlencode

    from fastapi.testclient import TestClient

    import api.app.routers.search as search
    from api.app.main import app

    sent = []
    monkeypatch.setattr(search, "capture_server_event", lambda e, p, **k: sent.append((e, p)))
    c = TestClient(app)
    payload = {
        "verification_token": "tok",
        "type": "Donation",
        "amount": "5.00",
        "currency": "USD",
        "from_name": "Jo Supporter",
        "email": "jo@example.com",
        "message": "deep search is great",
        "kofi_transaction_id": "abc",
    }
    form = {"Content-Type": "application/x-www-form-urlencoded"}

    monkeypatch.delenv("KOFI_VERIFICATION_TOKEN", raising=False)
    assert c.post("/api/kofi/webhook", content=urlencode({"data": json.dumps(payload)}), headers=form).status_code == 503

    monkeypatch.setenv("KOFI_VERIFICATION_TOKEN", "tok")
    bad = dict(payload, verification_token="nope")
    assert c.post("/api/kofi/webhook", content=urlencode({"data": json.dumps(bad)}), headers=form).status_code == 401
    assert sent == []

    r = c.post("/api/kofi/webhook", content=urlencode({"data": json.dumps(payload)}), headers=form)
    assert r.status_code == 200
    (event, props), = sent
    assert event == "support_donated" and props["amount"] == 5.0 and props["message"] == "deep search is great"
    assert "Jo Supporter" not in json.dumps(props) and "jo@example.com" not in json.dumps(props)
