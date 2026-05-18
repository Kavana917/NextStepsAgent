from __future__ import annotations

from dataclasses import dataclass

_buckets: dict[str, "_Bucket"] = {}


@dataclass
class _Bucket:
    window_start_ms: float
    count: int


def rate_limit_allow(key: str, window_ms: int, max_count: int) -> bool:
    import time

    now = time.time() * 1000
    b = _buckets.get(key)
    if b is None or now - b.window_start_ms >= window_ms:
        _buckets[key] = _Bucket(window_start_ms=now, count=1)
        return True
    if b.count >= max_count:
        return False
    b.count += 1
    return True


def get_client_key(forwarded_for: str | None, real_ip: str | None) -> str:
    if forwarded_for:
        return forwarded_for.split(",")[0].strip() or "local"
    if real_ip:
        return real_ip.strip()
    return "local"
