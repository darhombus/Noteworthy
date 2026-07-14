type CacheEntry<T> = {
  expiresAt: number
  value: T
}

const valueCache = new Map<string, CacheEntry<unknown>>()
const inFlight = new Map<string, Promise<unknown>>()

/**
 * Tiny in-process cache for ultra-hot read paths.
 *
 * Why this exists:
 * - App Router can trigger back-to-back identical reads (navigation + refresh,
 *   overlapping transitions, etc.).
 * - We want to collapse that duplicate work without introducing long-lived
 *   staleness.
 *
 * This cache is intentionally short-lived and best-effort:
 * - per-process only
 * - small TTL (call-site chosen)
 * - key-space controlled by call-sites (must include user_id where relevant)
 */
export async function withHotCache<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const now = Date.now()
  const hit = valueCache.get(key) as CacheEntry<T> | undefined
  if (hit && hit.expiresAt > now) return hit.value

  const pending = inFlight.get(key) as Promise<T> | undefined
  if (pending) return pending

  const next = loader()
    .then((value) => {
      valueCache.set(key, { value, expiresAt: Date.now() + ttlMs })
      return value
    })
    .finally(() => {
      inFlight.delete(key)
    })

  inFlight.set(key, next)
  return next
}

export function clearHotCache(prefix?: string): void {
  if (!prefix) {
    valueCache.clear()
    inFlight.clear()
    return
  }

  for (const key of valueCache.keys()) {
    if (key.startsWith(prefix)) valueCache.delete(key)
  }
  for (const key of inFlight.keys()) {
    if (key.startsWith(prefix)) inFlight.delete(key)
  }
}
