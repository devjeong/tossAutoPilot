/**
 * 토스 API 는 interval 이 1m / 1d 만 지원.
 * 5m~240m 은 1m 집계, 주봉·월봉은 1d 집계.
 */

export type RawCandle = {
  timestamp: string
  openPrice: string
  highPrice: string
  lowPrice: string
  closePrice: string
  volume: string
  currency?: string
}

export type ChartInterval =
  | '1m'
  | '5m'
  | '15m'
  | '30m'
  | '60m'
  | '240m'
  | '1d'
  | '1w'
  | '1mo'

export const CHART_INTERVALS: readonly ChartInterval[] = [
  '1m',
  '5m',
  '15m',
  '30m',
  '60m',
  '240m',
  '1d',
  '1w',
  '1mo'
] as const

export const CHART_INTERVAL_LABELS: Record<ChartInterval, string> = {
  '1m': '1분',
  '5m': '5분',
  '15m': '15분',
  '30m': '30분',
  '60m': '60분',
  '240m': '240분',
  '1d': '일',
  '1w': '주',
  '1mo': '월'
}

/** 분 단위 집계 (1m 소스) */
const MINUTE_BUCKETS: Partial<Record<ChartInterval, number>> = {
  '5m': 5,
  '15m': 15,
  '30m': 30,
  '60m': 60,
  '240m': 240
}

function parseTs(ts: string): number {
  const t = Date.parse(ts)
  return Number.isFinite(t) ? t : 0
}

function n(s: string): number {
  const v = Number(s)
  return Number.isFinite(v) ? v : 0
}

/** 오래된 → 최신 정렬 후 집계 */
export function aggregateCandles(
  source: RawCandle[],
  interval: ChartInterval
): RawCandle[] {
  if (source.length === 0) return []
  if (interval === '1m' || interval === '1d') {
    return [...source].sort((a, b) => parseTs(a.timestamp) - parseTs(b.timestamp))
  }

  const sorted = [...source].sort((a, b) => parseTs(a.timestamp) - parseTs(b.timestamp))
  const minutes = MINUTE_BUCKETS[interval]
  if (minutes) {
    return aggregateByMs(sorted, minutes * 60_000)
  }
  if (interval === '1w') return aggregateByWeek(sorted)
  if (interval === '1mo') return aggregateByMonth(sorted)
  return sorted
}

function aggregateByMs(sorted: RawCandle[], bucketMs: number): RawCandle[] {
  const groups = new Map<number, RawCandle[]>()
  for (const c of sorted) {
    const t = parseTs(c.timestamp)
    const key = Math.floor(t / bucketMs) * bucketMs
    const arr = groups.get(key)
    if (arr) arr.push(c)
    else groups.set(key, [c])
  }
  const keys = [...groups.keys()].sort((a, b) => a - b)
  return keys.map((k) => mergeGroup(groups.get(k)!, new Date(k).toISOString()))
}

function aggregateByWeek(sorted: RawCandle[]): RawCandle[] {
  const groups = new Map<string, RawCandle[]>()
  for (const c of sorted) {
    const d = new Date(parseTs(c.timestamp))
    // ISO week: Monday start
    const day = d.getUTCDay()
    const diff = (day + 6) % 7
    const mon = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff))
    const key = mon.toISOString().slice(0, 10)
    const arr = groups.get(key)
    if (arr) arr.push(c)
    else groups.set(key, [c])
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, arr]) => mergeGroup(arr, `${k}T00:00:00.000Z`))
}

function aggregateByMonth(sorted: RawCandle[]): RawCandle[] {
  const groups = new Map<string, RawCandle[]>()
  for (const c of sorted) {
    const d = new Date(parseTs(c.timestamp))
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    const arr = groups.get(key)
    if (arr) arr.push(c)
    else groups.set(key, [c])
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, arr]) => mergeGroup(arr, `${k}-01T00:00:00.000Z`))
}

function mergeGroup(arr: RawCandle[], timestamp: string): RawCandle {
  let high = -Infinity
  let low = Infinity
  let vol = 0
  for (const c of arr) {
    high = Math.max(high, n(c.highPrice))
    low = Math.min(low, n(c.lowPrice))
    vol += n(c.volume)
  }
  const first = arr[0]!
  const last = arr[arr.length - 1]!
  return {
    timestamp,
    openPrice: first.openPrice,
    highPrice: String(high),
    lowPrice: String(low),
    closePrice: last.closePrice,
    volume: String(vol),
    currency: last.currency ?? first.currency
  }
}

/** 요청 시 필요한 원천 interval 과 페이지 수 가이드 */
export function sourcePlan(interval: ChartInterval): {
  sourceInterval: '1m' | '1d'
  pages: number
} {
  switch (interval) {
    case '1m':
      return { sourceInterval: '1m', pages: 1 }
    case '5m':
      return { sourceInterval: '1m', pages: 4 }
    case '15m':
      return { sourceInterval: '1m', pages: 8 }
    case '30m':
      return { sourceInterval: '1m', pages: 10 }
    case '60m':
      return { sourceInterval: '1m', pages: 12 }
    case '240m':
      return { sourceInterval: '1m', pages: 15 }
    case '1d':
      return { sourceInterval: '1d', pages: 2 }
    case '1w':
      return { sourceInterval: '1d', pages: 4 }
    case '1mo':
      return { sourceInterval: '1d', pages: 6 }
    default:
      return { sourceInterval: '1d', pages: 2 }
  }
}
