type Bucket = { windowStart: number; count: number };

const buckets = new Map<string, Bucket>();

export function rateLimitAllow(
  key: string,
  windowMs: number,
  max: number,
): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.windowStart >= windowMs) {
    buckets.set(key, { windowStart: now, count: 1 });
    return true;
  }
  if (b.count >= max) return false;
  b.count += 1;
  return true;
}

export function getClientKey(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? req.headers.get("x-real-ip")
    ?? "local";
}
