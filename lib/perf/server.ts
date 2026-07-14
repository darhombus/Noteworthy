import { headers } from 'next/headers'

type PerfMetaValue = string | number | boolean | null | undefined
type PerfMeta = Record<string, PerfMetaValue>

const PERF_ENABLED = process.env.NW_PERF_LOG !== '0'
const TRACE_HEADER = 'x-nw-trace-id'

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function formatMeta(meta: PerfMeta): string {
  const pairs = Object.entries(meta).filter(([, value]) => value !== undefined)
  if (pairs.length === 0) return ''
  return pairs.map(([key, value]) => ` ${key}=${String(value)}`).join('')
}

export function logPerf(event: string, durationMs: number, meta: PerfMeta = {}): void {
  if (!PERF_ENABLED) return
  const ts = new Date().toISOString()
  const rounded = durationMs.toFixed(1)
  const suffix = formatMeta(meta)
  console.info(`[NW_PERF] ${ts} ${event} ${rounded}ms${suffix}`)
}

export async function timePerf<T>(
  event: string,
  work: () => Promise<T>,
  meta: PerfMeta = {},
): Promise<T> {
  const started = nowMs()
  try {
    return await work()
  } finally {
    logPerf(event, nowMs() - started, meta)
  }
}

export async function getPerfTraceId(): Promise<string | null> {
  if (!PERF_ENABLED) return null
  const h = await headers()
  return h.get(TRACE_HEADER)
}

