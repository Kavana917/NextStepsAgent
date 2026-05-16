/** Max characters accepted for the user's situation text. */
export const MAX_SITUATION_LENGTH = 8_000;

/** Minimum non-whitespace characters required to generate a plan. */
export const MIN_SITUATION_LENGTH = 10;

/** Simple sliding-window rate limit for plan generation. */
export const GENERATE_RATE_LIMIT_WINDOW_MS = 60_000;
export const GENERATE_RATE_LIMIT_MAX = 12;

/** Client abort for plan generation (staged pipeline can take 1–3 minutes). */
export const GENERATE_CLIENT_TIMEOUT_MS = 180_000;
