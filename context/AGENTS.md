# Agent notes

## Stack

- **Backend:** Python 3.11+, FastAPI, Pydantic v2, OpenAI Python SDK (`backend/`)
- **Frontend:** Vite + React + TypeScript (`frontend/`)
- **Plans:** `data/plans/*.json` (gitignored)

## Development

- API: `cd backend && python -m uvicorn app.main:app --reload --port 8000`
- UI: `cd frontend && npm run dev` (proxies `/api` → port 8000)

## Conventions

- Plans are **free-form trees** (variable depth/breadth); **leaves** are actionable tasks with `implementationGuide` / `acceptanceCriteria`; schemas in `backend/app/models/plan.py`
- Generation pipeline (`planning.py`): **PlanBrief** → parallel skeleton expansion → **parallel** batched leaf enrichment (`PARALLEL_ENRICH_WORKERS`, `LEAF_ENRICH_BATCH_SIZE`); tree **depth** is tier-driven (`low`≈2, `medium`≈4, `high`≈6 levels via `target_depth` in `plan_detail.py`); min leaf targets via `MIN_LEAVES_*` in `config.py`
- UI: minimal left nav + **canvas workspace** at `/plan` (React Flow + right inspector); **+** opens branch context; leaf click shows implementation guide
- JSON API uses **camelCase** (`estimatedMinutes`, `createdAt`, `isActionable`, etc.)
- Extend generation logic in `backend/app/services/planning.py`
- **Timeouts:** no client abort on generate; `OPENAI_TIMEOUT_SEC` per LLM call (default 300s); Vite dev proxy 600s

## More context

| Doc | Purpose |
|-----|---------|
| [project_description.md](project_description.md) | Full system architecture and behavior |
| [initial_plan_description.md](initial_plan_description.md) | Original product / API spec |
| [custom_property.md](custom_property.md) | Planning properties and time budgets |
| [development.md](development.md) | Setup, run, and deploy (from root README) |
