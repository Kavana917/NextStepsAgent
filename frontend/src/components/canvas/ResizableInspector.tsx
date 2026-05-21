import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "next-steps-inspector-width";
const MIN_WIDTH = 320;
const MAX_WIDTH = 720;
const DEFAULT_WIDTH = 420;
const WIDE_WIDTH = 560;

function clampWidth(w: number): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w));
}

function readStoredWidth(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_WIDTH;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? clampWidth(n) : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
}

type ResizableInspectorProps = {
  children: React.ReactNode;
};

export function ResizableInspector({ children }: ResizableInspectorProps) {
  const [width, setWidth] = useState(readStoredWidth);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(width);

  const persist = useCallback((w: number) => {
    const clamped = clampWidth(w);
    setWidth(clamped);
    try {
      localStorage.setItem(STORAGE_KEY, String(clamped));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      const delta = startX.current - e.clientX;
      persist(startWidth.current + delta);
    };

    const onUp = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [persist]);

  const onResizeStart = (e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = width;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const isWide = width >= WIDE_WIDTH - 20;

  return (
    <aside
      className="relative flex h-dvh min-h-0 shrink-0 flex-col border-l border-zinc-800 bg-zinc-950/95"
      style={{ width }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize inspector panel"
        aria-valuenow={width}
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={MAX_WIDTH}
        onPointerDown={onResizeStart}
        className="absolute top-0 left-0 z-10 h-full w-2 -translate-x-1/2 cursor-col-resize touch-none group"
      >
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-zinc-700 transition-colors group-hover:bg-sky-500/70 group-active:bg-sky-400" />
      </div>

      <div className="flex shrink-0 items-center justify-end gap-1 border-b border-zinc-800/80 px-2 py-1">
        <button
          type="button"
          onClick={() => persist(isWide ? DEFAULT_WIDTH : WIDE_WIDTH)}
          className="rounded px-2 py-1 text-[10px] font-medium text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"
          title={isWide ? "Default width" : "Wider panel"}
        >
          {isWide ? "Narrow" : "Widen"}
        </button>
        <span className="text-[10px] tabular-nums text-zinc-600">{width}px</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </aside>
  );
}
