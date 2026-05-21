"""Server-Sent Events stream for plan generation progress."""

from __future__ import annotations

import json
import queue
import threading
from collections.abc import Generator
from typing import Any

from app.plan_detail import DetailLevel
from app.models.plan import PlanProperty
from app.services.planning import generate_plan_from_situation


def _sse_payload(data: dict[str, Any]) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


def iter_plan_generate_events(
    situation: str,
    *,
    locale: str | None,
    properties: list[PlanProperty],
    detail_level: DetailLevel,
) -> Generator[str, None, None]:
    """Yield SSE lines: progress events, then complete or error."""
    event_queue: queue.Queue[dict[str, Any] | None] = queue.Queue()

    def on_progress(phase: str, message: str, percent: int) -> None:
        event_queue.put(
            {
                "type": "progress",
                "phase": phase,
                "message": message,
                "percent": percent,
            },
        )

    def worker() -> None:
        try:
            result = generate_plan_from_situation(
                situation,
                locale=locale,
                properties=properties,
                detail_level=detail_level,
                on_progress=on_progress,
            )
            if result.ok:
                event_queue.put(
                    {
                        "type": "complete",
                        "steps": [
                            s.model_dump(by_alias=True)
                            for s in (result.steps or [])
                        ],
                    },
                )
            else:
                event_queue.put(
                    {
                        "type": "error",
                        "error": result.error or "Plan generation failed.",
                    },
                )
        except Exception as exc:
            event_queue.put(
                {
                    "type": "error",
                    "error": str(exc) if str(exc) else "Plan generation failed.",
                },
            )
        finally:
            event_queue.put(None)

    threading.Thread(target=worker, daemon=True).start()

    while True:
        item = event_queue.get()
        if item is None:
            break
        yield _sse_payload(item)
