# Development and deployment

Quick start for running Next Steps Agent locally or in production. The repo root [README.md](../README.md) duplicates this for GitHub visitors.

## Configure OpenAI

Copy `.env.example` to `.env` or `.env.local` at the **repo root**:

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
# OPENAI_ORGANIZATION=org-...
```

Never commit `.env` / `.env.local`.

## Development (two terminals)

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

Plan generation uses `POST /api/plans/generate/stream` (SSE progress). Runtime varies by detail level; high detail can take many minutes.

## Production (single server)

```bash
cd frontend && npm install && npm run build
cd ../backend && pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Open [http://localhost:8000](http://localhost:8000). FastAPI serves the built SPA from `frontend/dist/` and the API under `/api/plans/*`.

Use a worker/proxy timeout of **≥ 300s** (longer for high-detail plans) for generate endpoints.

## API entry points

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/plans` | List saved plans |
| `GET` | `/api/plans/{id}` | Load full plan |
| `DELETE` | `/api/plans/{id}` | Delete plan |
| `POST` | `/api/plans/generate/stream` | Generate with SSE progress (UI default) |
| `POST` | `/api/plans/generate` | Generate without streaming |

See [project_description.md](project_description.md) for the full API list.

## Layout

```
backend/     FastAPI + Pydantic + OpenAI
frontend/    Vite React UI
data/plans/  Saved plans (local, gitignored)
context/     Project documentation (this folder)
```
