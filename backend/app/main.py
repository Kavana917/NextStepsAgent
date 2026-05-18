from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import CORS_ORIGINS, FRONTEND_DIST
from app.routers import plans

app = FastAPI(title="Next Steps Agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(plans.router)


@app.get("/health")
def health():
    return {"ok": True}


def _mount_frontend() -> None:
    if not FRONTEND_DIST.is_dir():
        return

    assets = FRONTEND_DIST / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    index_html = FRONTEND_DIST / "index.html"

    @app.get("/")
    def spa_root():
        if index_html.is_file():
            return FileResponse(index_html)
        return {"error": "Frontend not built. Run: cd frontend && npm run build"}

    @app.get("/{full_path:path}")
    def spa_fallback(full_path: str):
        if full_path.startswith("api/"):
            return {"error": "Not found."}
        file_path = FRONTEND_DIST / full_path
        if full_path and file_path.is_file():
            return FileResponse(file_path)
        if index_html.is_file():
            return FileResponse(index_html)
        return {"error": "Frontend not built. Run: cd frontend && npm run build"}


_mount_frontend()
