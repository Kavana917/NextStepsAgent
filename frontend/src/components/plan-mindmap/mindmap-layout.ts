import type { Edge, Node } from "@xyflow/react";
import type { PlanStep, Priority } from "@/lib/plan-types";
import type { ExpandMode } from "@/components/plan-tree/PlanTree";
import {
  LEVEL_X,
  NODE_MIN_HEIGHT,
  ROOT_NODE_ID,
  VERTICAL_GAP,
} from "@/components/plan-mindmap/constants";

export type PlanNodeData = {
  title: string;
  description: string;
  priority?: Priority;
  estimatedMinutes?: number;
  depth: 0 | 1 | 2 | 3;
  hasChildren: boolean;
  expanded: boolean;
};

export function expandedIdsForMode(
  mode: ExpandMode,
  steps: PlanStep[],
): Set<string> {
  const ids = new Set<string>([ROOT_NODE_ID]);
  const withChildren: string[] = [];

  const walk = (list: PlanStep[]) => {
    for (const step of list) {
      if (step.children?.length) {
        withChildren.push(step.id);
        walk(step.children);
      }
    }
  };
  walk(steps);

  // default & none: only the situation root is expanded → five top-level nodes, all branches collapsed
  if (mode === "all") {
    for (const id of withChildren) ids.add(id);
  }

  return ids;
}

function subtreeHeight(
  step: PlanStep,
  expandedIds: Set<string>,
): number {
  const kids = step.children ?? [];
  if (!expandedIds.has(step.id) || kids.length === 0) {
    return NODE_MIN_HEIGHT;
  }
  let total = 0;
  for (const child of kids) {
    total += subtreeHeight(child, expandedIds) + VERTICAL_GAP;
  }
  return total - VERTICAL_GAP;
}

function rootSubtreeHeight(steps: PlanStep[], expandedIds: Set<string>): number {
  if (!expandedIds.has(ROOT_NODE_ID) || steps.length === 0) {
    return NODE_MIN_HEIGHT;
  }
  let total = 0;
  for (const step of steps) {
    total += subtreeHeight(step, expandedIds) + VERTICAL_GAP;
  }
  return Math.max(NODE_MIN_HEIGHT, total - VERTICAL_GAP);
}

function layoutStep(
  step: PlanStep,
  depth: 1 | 2 | 3,
  yStart: number,
  expandedIds: Set<string>,
  nodes: Node[],
  edges: Edge[],
): number {
  const kids = step.children ?? [];
  const hasChildren = kids.length > 0;
  const expanded = expandedIds.has(step.id);
  const blockHeight = subtreeHeight(step, expandedIds);
  const y = yStart + blockHeight / 2 - NODE_MIN_HEIGHT / 2;

  nodes.push({
    id: step.id,
    type: "planNode",
    position: { x: LEVEL_X[depth], y },
    data: {
      title: step.title,
      description: step.description,
      priority: step.priority,
      estimatedMinutes: step.estimatedMinutes,
      depth,
      hasChildren,
      expanded,
    } satisfies PlanNodeData,
  });

  if (expanded && hasChildren) {
    let childY = yStart;
    for (const child of kids) {
      const childBlock = subtreeHeight(child, expandedIds);
      const childDepth = (depth + 1) as 2 | 3;
      layoutStep(child, childDepth, childY, expandedIds, nodes, edges);
      edges.push({
        id: `${step.id}->${child.id}`,
        source: step.id,
        target: child.id,
        type: "smoothstep",
        style: { stroke: edgeColor(depth), strokeWidth: 2 },
      });
      childY += childBlock + VERTICAL_GAP;
    }
  }

  return blockHeight;
}

function edgeColor(depth: number): string {
  if (depth === 0) return "#a78bfa";
  if (depth === 1) return "#38bdf8";
  return "#34d399";
}

export function buildMindMapGraph(params: {
  rootLabel: string;
  rootDescription: string;
  steps: PlanStep[];
  expandedIds: Set<string>;
}): { nodes: Node<PlanNodeData>[]; edges: Edge[] } {
  const nodes: Node<PlanNodeData>[] = [];
  const edges: Edge[] = [];
  const { rootLabel, rootDescription, steps, expandedIds } = params;

  const totalHeight = rootSubtreeHeight(steps, expandedIds);
  const rootY = totalHeight / 2 - NODE_MIN_HEIGHT / 2;
  const rootExpanded = expandedIds.has(ROOT_NODE_ID);

  nodes.push({
    id: ROOT_NODE_ID,
    type: "planNode",
    position: { x: LEVEL_X[0], y: Math.max(0, rootY) },
    data: {
      title: rootLabel,
      description: rootDescription,
      depth: 0,
      hasChildren: steps.length > 0,
      expanded: rootExpanded,
    },
  });

  if (rootExpanded && steps.length > 0) {
    let y = 0;
    for (const step of steps) {
      const block = subtreeHeight(step, expandedIds);
      layoutStep(step, 1, y, expandedIds, nodes, edges);
      edges.push({
        id: `${ROOT_NODE_ID}->${step.id}`,
        source: ROOT_NODE_ID,
        target: step.id,
        type: "smoothstep",
        style: { stroke: edgeColor(0), strokeWidth: 2 },
      });
      y += block + VERTICAL_GAP;
    }
  }

  return { nodes, edges };
}
