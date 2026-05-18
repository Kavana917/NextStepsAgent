import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  type Node,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { PlanStep } from "@/lib/plan-types";
import type { ExpandMode } from "@/components/plan-tree/PlanTree";
import { PlanNode } from "@/components/plan-mindmap/PlanNode";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  WHEEL_ZOOM_SENSITIVITY,
} from "@/components/plan-mindmap/constants";
import {
  buildMindMapGraph,
  expandedIdsForMode,
  type PlanNodeData,
} from "@/components/plan-mindmap/mindmap-layout";

const nodeTypes = { planNode: PlanNode };

/** Faster, cursor-anchored scroll zoom (replaces default when panOnScroll is off). */
function WheelZoomBoost() {
  const { getViewport, setViewport } = useReactFlow();

  useEffect(() => {
    const pane = document.querySelector(".react-flow__pane");
    if (!pane) return;

    const onWheel = (raw: Event) => {
      const event = raw as WheelEvent;
      if (event.target instanceof Element && event.target.closest(".react-flow__controls")) {
        return;
      }

      const deltaModeFactor =
        event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 1;
      const delta = -event.deltaY * deltaModeFactor;

      // Trackpad pinch-to-zoom (ctrl/meta + wheel): use a stronger pinch factor too
      const sensitivity = event.ctrlKey
        ? WHEEL_ZOOM_SENSITIVITY * 2.5
        : WHEEL_ZOOM_SENSITIVITY;

      const { x, y, zoom } = getViewport();
      const zoomFactor = Math.exp(delta * sensitivity);
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * zoomFactor));

      if (Math.abs(nextZoom - zoom) < 0.0001) return;

      event.preventDefault();
      event.stopPropagation();

      const rect = pane.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const scale = nextZoom / zoom;

      setViewport(
        {
          x: px - (px - x) * scale,
          y: py - (py - y) * scale,
          zoom: nextZoom,
        },
        { duration: 0 },
      );
    };

    pane.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => pane.removeEventListener("wheel", onWheel, { capture: true });
  }, [getViewport, setViewport]);

  return null;
}

function FitViewOnChange({ dep }: { dep: string }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const t = window.setTimeout(() => {
      void fitView({ padding: 0.25, duration: 280 });
    }, 50);
    return () => window.clearTimeout(t);
  }, [dep, fitView]);
  return null;
}

function FitViewAfterResize({ dep }: { dep: string }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const t = window.setTimeout(() => {
      void fitView({ padding: 0.2, duration: 200 });
    }, 120);
    return () => window.clearTimeout(t);
  }, [dep, fitView]);
  return null;
}

function PlanMindMapInner({
  steps,
  expandMode,
  treeKey,
  rootLabel,
  rootDescription,
}: {
  steps: PlanStep[];
  expandMode: ExpandMode;
  treeKey: number;
  rootLabel: string;
  rootDescription: string;
}) {
  const [expandedIds, setExpandedIds] = useState(() =>
    expandedIdsForMode(expandMode, steps),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sync = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch {
      // Browser blocked fullscreen (e.g. permission policy)
    }
  }, []);

  const { nodes, edges } = useMemo(
    () =>
      buildMindMapGraph({
        rootLabel,
        rootDescription,
        steps,
        expandedIds,
      }),
    [rootLabel, rootDescription, steps, expandedIds],
  );

  const graphKey = `${treeKey}-${[...expandedIds].sort().join(",")}`;

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    const data = node.data as PlanNodeData;
    setSelectedId(node.id);
    if (data.hasChildren) {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        if (next.has(node.id)) next.delete(node.id);
        else next.add(node.id);
        return next;
      });
    }
  }, []);

  const selectedNode = nodes.find((n) => n.id === selectedId);
  const selectedData = selectedNode?.data as PlanNodeData | undefined;

  if (steps.length === 0) {
    return (
      <p className="text-sm text-zinc-400">
        Generate a plan to see your mind map here. Drag the canvas to pan, scroll
        to zoom.
      </p>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden bg-zinc-950 ${
        isFullscreen
          ? "fixed inset-0 z-50 h-dvh max-h-dvh border-0"
          : "h-[min(72vh,760px)] rounded-lg border border-zinc-800"
      }`}
    >
      <button
        type="button"
        onClick={() => void toggleFullscreen()}
        className="absolute right-3 top-3 z-10 rounded-md border border-zinc-700 bg-zinc-900/95 px-2.5 py-1.5 text-xs font-medium text-zinc-200 shadow-lg hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
        aria-label={isFullscreen ? "Exit full screen" : "Enter full screen"}
      >
        {isFullscreen ? "Exit full screen" : "Full screen"}
      </button>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={() => setSelectedId(null)}
        fitView
        fitViewOptions={{ padding: 0.25, minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM }}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        panOnDrag
        panOnScroll={false}
        zoomOnScroll={false}
        zoomOnPinch
        zoomOnDoubleClick={false}
        preventScrolling
        proOptions={{ hideAttribution: true }}
        className="bg-zinc-950"
      >
        <Background color="#3f3f46" gap={24} size={1} />
        <Controls
          showInteractive={false}
          className="!border-zinc-700 !bg-zinc-900 [&>button]:!border-zinc-700 [&>button]:!bg-zinc-800 [&>button]:!fill-zinc-200"
        />
        <WheelZoomBoost />
        <FitViewOnChange dep={graphKey} />
        <FitViewAfterResize dep={isFullscreen ? `fs-${graphKey}` : "inline"} />
      </ReactFlow>

      <div className="pointer-events-none absolute left-3 top-3 max-w-[calc(100%-8rem)] rounded-md border border-zinc-800/80 bg-zinc-950/90 px-2.5 py-1.5 text-[11px] text-zinc-400">
        Drag to pan · Scroll to zoom · Pinch to zoom · Click nodes to expand
        {isFullscreen ? " · Esc to exit" : ""}
      </div>

      {selectedData ? (
        <div className="pointer-events-none absolute bottom-3 left-3 right-3 max-w-lg rounded-lg border border-zinc-700 bg-zinc-900/95 p-3 shadow-xl backdrop-blur-sm md:right-auto">
          <p className="text-sm font-semibold text-zinc-50">{selectedData.title}</p>
          <p className="mt-1.5 text-xs leading-relaxed text-zinc-300">
            {selectedData.description}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function PlanMindMap(props: {
  steps: PlanStep[];
  expandMode: ExpandMode;
  treeKey: number;
  rootLabel: string;
  rootDescription: string;
}) {
  return (
    <ReactFlowProvider>
      <PlanMindMapInner
        key={`${props.treeKey}-${props.expandMode}`}
        {...props}
      />
    </ReactFlowProvider>
  );
}
