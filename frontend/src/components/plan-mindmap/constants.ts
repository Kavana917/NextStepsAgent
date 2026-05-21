export const ROOT_NODE_ID = "__situation_root__";
export const ADD_ROOT_ID = "__add_root__";

/** Fixed width of the plan card (excluding optional + column). */
export const NODE_CARD_WIDTH = 220;
/** Width of integrated + affordance column on step nodes. */
export const ADD_COLUMN_WIDTH = 40;
export const NODE_WIDTH = NODE_CARD_WIDTH + ADD_COLUMN_WIDTH;
export const NODE_MIN_HEIGHT = 76;
export const ADD_NODE_SIZE = 32;
export const VERTICAL_GAP = 24;

/** Horizontal gap between depth columns. */
export const LEVEL_X_SPACING = 300;

/** Mind map viewport zoom bounds. */
export const MIN_ZOOM = 0.04;
export const MAX_ZOOM = 4;

export const WHEEL_ZOOM_SENSITIVITY = 0.006;

export function levelX(depth: number): number {
  return 32 + depth * LEVEL_X_SPACING;
}
