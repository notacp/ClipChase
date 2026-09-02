from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import search
from dotenv import load_dotenv
import os

from pathlib import Path

# Load .env from the root directory (3 levels up from this file).
#
# override=False on purpose: a real environment variable beats the file. That
# is the conventional precedence, and it is what makes the file safe. With
# override=True, .env won unconditionally — so anything that imported this
# module inherited production credentials it could not opt out of, no matter
# what it had set beforehand. That is how a local test run once migrated the
# production D1 database.
#
# Production is unaffected either way: .env is gitignored, so it never reaches
# Vercel and this call is a no-op there.
env_path = Path(__file__).parent.parent.parent / ".env"
load_dotenv(dotenv_path=env_path, override=False)

app = FastAPI(title="ClipChase API")

_origins_env = os.getenv("ALLOWED_ORIGINS", "*")
_allowed_origins = [o.strip() for o in _origins_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(search.router, prefix="/api")

@app.get("/")
async def root():
    return {"message": "ClipChase API is running"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
