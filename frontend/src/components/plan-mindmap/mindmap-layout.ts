import type { Edge, Node } from "@xyflow/react";
import {
  canExpandLeafIntoSubsteps,
  isActionableLeaf,
} from "@/lib/plan-step-utils";
import type { PlanStep, Priority } from "@/lib/plan-types";
import type { ExpandMode } from "@/components/plan-tree/PlanTree";
import {
  ADD_ROOT_ID,
  levelX,
  NODE_MIN_HEIGHT,
  ROOT_NODE_ID,
  VERTICAL_GAP,
} from "@/components/plan-mindmap/constants";

export type PlanNodeData = {
  title: string;
  description: string;
  priority?: Priority;
  estimatedMinutes?: number;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  hasContext?: boolean;
  stepId?: string;
  showAddButton?: boolean;
  addButtonMode?: "context" | "expand";
  contextActive?: boolean;
  isActionable?: boolean;
  hasImplementationGuide?: boolean;
};

export type AddButtonNodeData = {
  label?: string;
  isRootMenu?: boolean;
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

function edgeColor(depth: number): string {
  if (depth <= 0) return "#a78bfa";
  if (depth === 1) return "#71717a";
  if (depth === 2) return "#34d399";
  return "#38bdf8";
}

function layoutStep(
  step: PlanStep,
  depth: number,
  yStart: number,
  expandedIds: Set<string>,
  nodes: Node[],
  edges: Edge[],
  parentId: string,
): number {
  const kids = step.children ?? [];
  const hasChildren = kids.length > 0;
  const canExpand = canExpandLeafIntoSubsteps(step);
  const expanded = expandedIds.has(step.id);
  const blockHeight = subtreeHeight(step, expandedIds);
  const y = yStart + blockHeight / 2 - NODE_MIN_HEIGHT / 2;

  nodes.push({
    id: step.id,
    type: "planNode",
    position: { x: levelX(depth), y },
    data: {
      title: step.title,
      description: step.description,
      priority: step.priority,
      estimatedMinutes: step.estimatedMinutes,
      depth,
      hasChildren,
      expanded,
      hasContext: (step.properties?.length ?? 0) > 0,
      stepId: step.id,
      showAddButton: hasChildren || canExpand,
      addButtonMode: hasChildren ? "context" : "expand",
      isActionable: isActionableLeaf(step),
      hasImplementationGuide: Boolean(step.implementationGuide),
    } satisfies PlanNodeData,
  });

  edges.push({
    id: `${parentId}->${step.id}`,
    source: parentId,
    target: step.id,
    type: "straight",
    style: { stroke: edgeColor(depth - 1), strokeWidth: 2 },
  });

  if (expanded && hasChildren) {
    let childY = yStart;
    for (const child of kids) {
      const childBlock = subtreeHeight(child, expandedIds);
      layoutStep(child, depth + 1, childY, expandedIds, nodes, edges, step.id);
      childY += childBlock + VERTICAL_GAP;
    }
  }

  return blockHeight;
}

export function buildMindMapGraph(params: {
  rootLabel: string;
  rootDescription: string;
  steps: PlanStep[];
  expandedIds: Set<string>;
  showSituation: boolean;
  showEmptyAdd: boolean;
}): {
  nodes: Node<PlanNodeData | AddButtonNodeData>[];
  edges: Edge[];
} {
  const nodes: Node<PlanNodeData | AddButtonNodeData>[] = [];
  const edges: Edge[] = [];
  const {
    rootLabel,
    rootDescription,
    steps,
    expandedIds,
    showSituation,
    showEmptyAdd,
  } = params;

  if (showEmptyAdd && !showSituation) {
    nodes.push({
      id: ADD_ROOT_ID,
      type: "addButton",
      position: { x: levelX(0), y: 80 },
      data: { label: "Add situation", isRootMenu: true } satisfies AddButtonNodeData,
    });
    return { nodes, edges };
  }

  if (!showSituation) {
    return { nodes, edges };
  }

  const totalHeight = rootSubtreeHeight(steps, expandedIds);
  const rootY = Math.max(0, totalHeight / 2 - NODE_MIN_HEIGHT / 2);
  const rootExpanded = expandedIds.has(ROOT_NODE_ID);

  nodes.push({
    id: ROOT_NODE_ID,
    type: "planNode",
    position: { x: levelX(0), y: rootY },
    data: {
      title: rootLabel,
      description: rootDescription,
      depth: 0,
      hasChildren: steps.length > 0,
      expanded: rootExpanded,
      showAddButton: false,
    },
  });

  if (rootExpanded && steps.length > 0) {
    let y = 0;
    for (const step of steps) {
      const block = subtreeHeight(step, expandedIds);
      layoutStep(step, 1, y, expandedIds, nodes, edges, ROOT_NODE_ID);
      y += block + VERTICAL_GAP;
    }
  }

  return { nodes, edges };
}
