"""Keep the test suite off production.

`api/app/main.py` calls `load_dotenv(override=True)` at import time, so merely
importing the FastAPI app pulls the real CF_* / TURSO_* credentials into
`os.environ` — with `override=True`, so clearing them beforehand does not help.
Any TranscriptIndexService built afterwards then talks to the live database.
That is not hypothetical: a stray `ALTER TABLE` in `ensure_schema` once
migrated the production D1 database from a local test run.

Two layers guard this, deliberately:

1. Here — neutralise `load_dotenv` before any test module imports the app, so
   the credentials never enter the environment in the first place.
2. `_remote_backend()` in transcript_index.py — refuses a remote backend under
   pytest regardless of how the environment got populated. That one is
   load-bearing, because it sits at the point of choice and covers paths that
   never import main.

Set `CLIPCHASE_ALLOW_REMOTE_IN_TESTS=1` to opt back in when you genuinely mean
to exercise a real backend.
"""
from __future__ import annotations

import os

import dotenv
import pytest

_ALLOW = os.getenv("CLIPCHASE_ALLOW_REMOTE_IN_TESTS") == "1"

_REMOTE_VARS = (
    "CF_ACCOUNT_ID",
    "CF_D1_DATABASE_ID",
    "CF_API_TOKEN",
    "TURSO_DATABASE_URL",
    "TURSO_AUTH_TOKEN",
)

if not _ALLOW:
    # Applied at import so it lands before pytest collects any test module,
    # which is when main.py (and therefore load_dotenv) is first imported.
    dotenv.load_dotenv = lambda *args, **kwargs: False
    for _var in _REMOTE_VARS:
        os.environ.pop(_var, None)


@pytest.fixture(autouse=True)
def _no_remote_backend():
    """Fail loudly if a test resolves a remote backend.

    A silent fallback to local sqlite would let this regress unnoticed the next
    time someone adds an import that repopulates the environment.
    """
    if _ALLOW:
        yield
        return

    from api.app.services.transcript_index import _remote_backend

    assert _remote_backend() is None, (
        "test resolved a REMOTE database backend — refusing to run against "
        "production. Something repopulated CF_*/TURSO_* after conftest cleared "
        "them. Set CLIPCHASE_ALLOW_REMOTE_IN_TESTS=1 only if this is deliberate."
    )
    yield
