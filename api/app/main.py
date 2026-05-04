from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import search
from dotenv import load_dotenv
import os

from pathlib import Path

# Load .env from the root directory (3 levels up from this file)
env_path = Path(__file__).parent.parent.parent / ".env"
load_dotenv(dotenv_path=env_path, override=True)

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
