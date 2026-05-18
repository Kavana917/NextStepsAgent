export const ROOT_NODE_ID = "__situation_root__";

export const LEVEL_X = [40, 320, 600, 880] as const;
export const NODE_WIDTH = 232;
export const NODE_MIN_HEIGHT = 76;
export const VERTICAL_GAP = 20;

/** Mind map viewport zoom bounds (wider = more freedom). */
export const MIN_ZOOM = 0.04;
export const MAX_ZOOM = 4;

/**
 * Scroll-wheel zoom strength (higher = faster).
 * React Flow’s default d3 wheel delta uses ~0.002; we boost for a snappier feel.
 */
export const WHEEL_ZOOM_SENSITIVITY = 0.006;
