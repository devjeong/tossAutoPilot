import type { MarketCalendar } from '../toss/client.js'
import type { MarketOpenInfo } from './types.js'

type SessionLike = { startTime: string; endTime: string } | null | undefined

type MarketDayLike = {
  date?: string
  integrated?: {
    preMarket?: SessionLike
    regularMarket?: SessionLike
    afterMarket?: SessionLike
  } | null
  dayMarket?: SessionLike
  preMarket?: SessionLike
  regularMarket?: SessionLike
  afterMarket?: SessionLike
}

type NamedSession = {
  kind: 'regular' | 'after'
  start: number
  end: number
}

/**
 * 캘린더에서 "지금 주문 가능한 장인가"를 판정.
 * US 정규장/애프터는 자정을 넘기므로 previous/next 영업일도 포함.
 */
export function evaluateMarketOpen(calendar: MarketCalendar, now: number): MarketOpenInfo {
  const days: MarketDayLike[] = [
    calendar.today as MarketDayLike,
    calendar.previousBusinessDay as MarketDayLike,
    calendar.nextBusinessDay as MarketDayLike
  ].filter(Boolean)

  const sessions = collectTradeSessions(days)
  const fmt = (t: number): string =>
    new Date(t).toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Seoul'
    })

  if (sessions.length === 0) {
    const date = (calendar.today as MarketDayLike)?.date ?? '오늘'
    return { open: false, detail: `${date} 정규장 휴장` }
  }

  const active = sessions.find((s) => now >= s.start && now <= s.end)
  if (active) {
    const label = active.kind === 'after' ? '애프터마켓' : '정규장'
    return { open: true, detail: `${label} ${fmt(active.start)}–${fmt(active.end)}` }
  }

  const upcoming = sessions.filter((s) => s.start > now).sort((a, b) => a.start - b.start)[0]
  if (upcoming) {
    return { open: false, detail: `개장 전 (${fmt(upcoming.start)} 개장)` }
  }

  const last = [...sessions].sort((a, b) => b.end - a.end)[0]!
  return { open: false, detail: `장 종료 (${fmt(last.end)} 마감)` }
}

function collectTradeSessions(days: MarketDayLike[]): NamedSession[] {
  const out: NamedSession[] = []
  for (const day of days) {
    pushSession(out, 'regular', day.integrated?.regularMarket ?? day.regularMarket)
    pushSession(out, 'after', day.integrated?.afterMarket ?? day.afterMarket)
  }
  const seen = new Set<string>()
  return out.filter((s) => {
    const k = `${s.kind}:${s.start}:${s.end}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

function pushSession(
  out: NamedSession[],
  kind: 'regular' | 'after',
  session: SessionLike
): void {
  if (!session?.startTime || !session?.endTime) return
  const start = Date.parse(session.startTime)
  const end = Date.parse(session.endTime)
  if (Number.isNaN(start) || Number.isNaN(end)) return
  out.push({ kind, start, end })
}

/** 세션 날짜 키 (KST YYYY-MM-DD) — 예약 재제출 중복 방지용 */
export function sessionDateKeyKst(now = Date.now()): string {
  return new Date(now).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
}
