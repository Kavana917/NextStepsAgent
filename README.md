# Next Steps Agent

Turn a free-text **situation** into a **free-form plan tree** (actionable leaves) using OpenAI, with **Pydantic** validation on the server and a **canvas + inspector** UI at `/plan`.

## Stack

| Layer | Tech |
|-------|------|
| API | [FastAPI](https://fastapi.tiangolo.com/) + Pydantic v2 |
| UI | Vite + React + Tailwind + React Flow |
| Storage | Local JSON under `data/plans/` (gitignored) |

## Configure OpenAI

Copy `.env.example` to `.env` or `.env.local` at the **repo root**:

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
# OPENAI_ORGANIZATION=org-...
```

Never commit `.env` / `.env.local`.

## Development

Use **two terminals**:

**Terminal 1 — API (port 8000):**

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

**Terminal 2 — UI (port 5173, proxies `/api` to backend):**

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

Plan generation uses **SSE streaming** (`/api/plans/generate/stream`); runtime depends on detail level (often several minutes for medium/high).

## Production (single server)

```bash
cd frontend && npm install && npm run build
cd ../backend && pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Open [http://localhost:8000](http://localhost:8000). FastAPI serves the built SPA from `frontend/dist/` and the API under `/api/plans/*`.

Use a worker/ proxy timeout of **≥ 300s** for `POST /api/plans/generate`.

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/plans` | List saved plans (metadata) |
| `GET` | `/api/plans/{id}` | Load full plan |
| `DELETE` | `/api/plans/{id}` | Delete plan file |
| `POST` | `/api/plans/generate/stream` | Generate plan (SSE progress; UI default) |
| `POST` | `/api/plans/generate` | Generate plan (non-streaming) |

Prompts and Pydantic models live in [`backend/app/services/planning.py`](backend/app/services/planning.py) and [`backend/app/models/plan.py`](backend/app/models/plan.py).

## Documentation

Detailed docs are in [`context/`](context/):

| Doc | Description |
|-----|-------------|
| [context/project_description.md](context/project_description.md) | Full architecture and how everything works |
| [context/AGENTS.md](context/AGENTS.md) | Agent/coding conventions |
| [context/development.md](context/development.md) | Setup and deployment |
| [context/initial_plan_description.md](context/initial_plan_description.md) | Original product spec |
| [context/custom_property.md](context/custom_property.md) | Planning properties |

## Project layout

```
backend/     FastAPI + Pydantic + OpenAI
frontend/    Vite React UI
data/plans/  Saved plans (local, gitignored)
context/     Project documentation (see context/README.md)
```
