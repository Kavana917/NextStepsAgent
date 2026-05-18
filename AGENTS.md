# Agent notes

## Stack

- **Backend:** Python 3.11+, FastAPI, Pydantic v2, OpenAI Python SDK (`backend/`)
- **Frontend:** Vite + React + TypeScript (`frontend/`)
- **Plans:** `data/plans/*.json` (gitignored)

## Development

- API: `cd backend && python -m uvicorn app.main:app --reload --port 8000`
- UI: `cd frontend && npm run dev` (proxies `/api` → port 8000)

## Conventions

- Plan shape is fixed **5×5×5**; schemas in `backend/app/models/plan.py`
- JSON API uses **camelCase** (`estimatedMinutes`, `createdAt`, etc.)
- Extend generation logic in `backend/app/services/planning.py`
