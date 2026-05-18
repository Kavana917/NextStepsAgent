import os
from pathlib import Path

from dotenv import load_dotenv

_REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(_REPO_ROOT / ".env")
load_dotenv(_REPO_ROOT / ".env.local")

MAX_SITUATION_LENGTH = 8_000
MIN_SITUATION_LENGTH = 10
GENERATE_RATE_LIMIT_WINDOW_MS = 60_000
GENERATE_RATE_LIMIT_MAX = 12
OPENAI_TIMEOUT_SEC = 120.0
STEPS_PER_BRANCH = 5

PLANS_DIR = Path(
    os.environ.get("PLANS_DIR", str(_REPO_ROOT / "data" / "plans")),
)
FRONTEND_DIST = _REPO_ROOT / "frontend" / "dist"

CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]


def openai_api_key() -> str | None:
    return os.environ.get("OPENAI_API_KEY", "").strip() or None


def openai_model() -> str:
    return (
        os.environ.get("OPENAI_MODEL", "").strip()
        or os.environ.get("OPENAI_MODEL_ID", "").strip()
        or "gpt-4o-mini"
    )


def openai_organization() -> str | None:
    org = (
        os.environ.get("OPENAI_ORGANIZATION", "").strip()
        or os.environ.get("OPENAI_ORG_ID", "").strip()
    )
    return org or None
