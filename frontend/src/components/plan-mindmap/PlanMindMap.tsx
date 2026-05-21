import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Node,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { PlanStep, SelectionTarget } from "@/lib/plan-types";
import type { ExpandMode } from "@/components/plan-tree/PlanTree";
import { AddButtonNode } from "@/components/plan-mindmap/AddButtonNode";
import { PlanNode } from "@/components/plan-mindmap/PlanNode";
import {
  ADD_ROOT_ID,
  MAX_ZOOM,
  MIN_ZOOM,
  ROOT_NODE_ID,
  WHEEL_ZOOM_SENSITIVITY,
} from "@/components/plan-mindmap/constants";
import {
  buildMindMapGraph,
  expandedIdsForMode,
  type AddButtonNodeData,
  type PlanNodeData,
} from "@/components/plan-mindmap/mindmap-layout";

const nodeTypes = { planNode: PlanNode, addButton: AddButtonNode };

function WheelZoomBoost() {
  const { getViewport, setViewport } = useReactFlow();

  useEffect(() => {
    const pane = document.querySelector(".react-flow__pane");
    if (!pane) return;

    const onWheel = (raw: Event) => {
      const event = raw as WheelEvent;
      if (
        event.target instanceof Element &&
        event.target.closest(".react-flow__controls")
      ) {
        return;
      }

      const deltaModeFactor =
        event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 1;
      const delta = -event.deltaY * deltaModeFactor;
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
      void fitView({ padding: 0.28, duration: 280 });
    }, 50);
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
  showSituation,
  showEmptyAdd,
  selection,
  onSelect,
  extraExpandedIds = [],
}: {
  steps: PlanStep[];
  expandMode: ExpandMode;
  treeKey: number;
  rootLabel: string;
  rootDescription: string;
  showSituation: boolean;
  showEmptyAdd: boolean;
  selection: SelectionTarget;
  onSelect: (target: SelectionTarget) => void;
  extraExpandedIds?: string[];
}) {
  const [expandedIds, setExpandedIds] = useState(() =>
    expandedIdsForMode(expandMode, steps),
  );

  useEffect(() => {
    setExpandedIds(expandedIdsForMode(expandMode, steps));
  }, [expandMode, treeKey, steps]);

  useEffect(() => {
    if (extraExpandedIds.length === 0) return;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      for (const id of extraExpandedIds) next.add(id);
      return next;
    });
  }, [extraExpandedIds, treeKey]);

  const { nodes, edges } = useMemo(() => {
    const graph = buildMindMapGraph({
      rootLabel,
      rootDescription,
      steps,
      expandedIds,
      showSituation,
      showEmptyAdd,
    });

    const selectedId =
      selection?.kind === "situation"
        ? ROOT_NODE_ID
        : selection?.kind === "add-root"
          ? ADD_ROOT_ID
          : selection?.kind === "step" ||
              selection?.kind === "add-before" ||
              selection?.kind === "expand-leaf"
            ? selection.stepId
            : null;

    return {
      nodes: graph.nodes.map((n) => {
        if (n.type === "planNode") {
          const data = n.data as PlanNodeData;
          const stepId = data.stepId ?? n.id;
          const contextActive =
            (selection?.kind === "add-before" ||
              selection?.kind === "expand-leaf") &&
            selection.stepId === stepId;
          const mode = data.addButtonMode ?? "context";
          return {
            ...n,
            selected: selectedId === n.id,
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
            data: {
              ...data,
              contextActive,
              addButtonMode: mode,
              onAddButtonClick: data.showAddButton
                ? () =>
                    onSelect({
                      kind: mode === "expand" ? "expand-leaf" : "add-before",
                      stepId,
                    })
                : undefined,
            },
          };
        }
        return {
          ...n,
          selected: selectedId === n.id,
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
        };
      }),
      edges: graph.edges,
    };
  }, [
    rootLabel,
    rootDescription,
    steps,
    expandedIds,
    showSituation,
    showEmptyAdd,
    selection,
    onSelect,
  ]);

  const graphKey = `${treeKey}-${[...expandedIds].sort().join(",")}`;

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.type === "addButton") {
        const data = node.data as AddButtonNodeData;
        if (data.isRootMenu) {
          onSelect({ kind: "situation" });
        }
        return;
      }

      const data = node.data as PlanNodeData;
      if (node.id === ROOT_NODE_ID) {
        onSelect({ kind: "situation" });
        if (data.hasChildren) {
          setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(node.id)) next.delete(node.id);
            else next.add(node.id);
            return next;
          });
        }
        return;
      }

      onSelect({ kind: "step", stepId: node.id });
      if (data.hasChildren) {
        setExpandedIds((prev) => {
          const next = new Set(prev);
          if (next.has(node.id)) next.delete(node.id);
          else next.add(node.id);
          return next;
        });
      }
    },
    [onSelect],
  );

  return (
    <div className="relative h-full w-full overflow-hidden bg-zinc-950">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={() => onSelect(null)}
        defaultEdgeOptions={{ type: "straight" }}
        fitView
        fitViewOptions={{ padding: 0.28, minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM }}
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
        className="bg-zinc-950 plan-canvas-flow"
      >
        <Background color="#3f3f46" gap={24} size={1} />
        <Controls
          showInteractive={false}
          className="!border-zinc-700 !bg-zinc-900 [&>button]:!border-zinc-700 [&>button]:!bg-zinc-800 [&>button]:!fill-zinc-200"
        />
        <WheelZoomBoost />
        <FitViewOnChange dep={graphKey} />
      </ReactFlow>

      <div className="pointer-events-none absolute left-3 top-3 max-w-md rounded-md border border-zinc-800/80 bg-zinc-950/90 px-2.5 py-1.5 text-[11px] text-zinc-400">
        Drag to pan · Scroll to zoom · + on branches = context · + on large tasks = sub-steps
      </div>
    </div>
  );
}

export function PlanMindMap(props: {
  steps: PlanStep[];
  expandMode: ExpandMode;
  treeKey: number;
  rootLabel: string;
  rootDescription: string;
  showSituation: boolean;
  showEmptyAdd: boolean;
  selection: SelectionTarget;
  onSelect: (target: SelectionTarget) => void;
}) {
  return (
    <ReactFlowProvider>
      <PlanMindMapInner key={`${props.treeKey}-${props.expandMode}`} {...props} />
    </ReactFlowProvider>
  );
}
