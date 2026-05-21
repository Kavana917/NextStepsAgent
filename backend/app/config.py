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
OPENAI_TIMEOUT_SEC = float(os.environ.get("OPENAI_TIMEOUT_SEC", "300"))

MAX_EXECUTION_TASK_MINUTES = 90
# Minimum actionable-leaf targets per detail tier (guidance only; no hard maximum).
MIN_LEAVES_LOW = int(os.environ.get("MIN_LEAVES_LOW", "15"))
MIN_LEAVES_MEDIUM = int(os.environ.get("MIN_LEAVES_MEDIUM", "40"))
MIN_LEAVES_HIGH = int(os.environ.get("MIN_LEAVES_HIGH", "75"))
LEAF_ENRICH_BATCH_SIZE = int(os.environ.get("LEAF_ENRICH_BATCH_SIZE", "20"))
PARALLEL_EXPAND_WORKERS = int(os.environ.get("PARALLEL_EXPAND_WORKERS", "6"))
PARALLEL_ENRICH_WORKERS = int(os.environ.get("PARALLEL_ENRICH_WORKERS", "4"))

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
