import { NextResponse } from 'next/server'
import {
  TossClient,
  aggregateCandles,
  sourcePlan,
  type ChartInterval,
  CHART_INTERVALS
} from '@tosspilot/core'
import { createClient } from '@/lib/supabase/server'
import { loadDecryptedCredentials } from '@/lib/credentials-store'
import {
  engineFetchJson,
  ipBlockedHelp,
  isIpBlockedError
} from '@/lib/engine-proxy'

type CandlePayload = {
  ok: boolean
  symbol?: string
  interval?: string
  sourceInterval?: string
  sourceCount?: number
  via?: string
  candles?: {
    time: string
    open: string
    high: string
    low: string
    close: string
    volume: string
    currency?: string
  }[]
  error?: string
}

/** GET /api/stocks/candles?symbol=005930&interval=15m — 엔진 프록시 우선 */
export async function GET(req: Request) {
  const supabase = await createClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const symbol = url.searchParams.get('symbol')?.trim().toUpperCase()
  const interval = (url.searchParams.get('interval') ?? '1d') as ChartInterval

  if (!symbol) {
    return NextResponse.json({ ok: false, error: 'symbol required' }, { status: 400 })
  }
  if (!(CHART_INTERVALS as readonly string[]).includes(interval)) {
    return NextResponse.json(
      { ok: false, error: `interval must be one of ${CHART_INTERVALS.join(',')}` },
      { status: 400 }
    )
  }

  // 1) 허용 IP 엔진 경유 (권장)
  const proxied = await engineFetchJson<CandlePayload>('/internal/market/candles', {
    method: 'POST',
    body: JSON.stringify({ userId: user.id, symbol, interval })
  })

  if (proxied.ok) {
    return NextResponse.json(proxied.data)
  }

  // 2) 엔진 불가 시 직접 호출 (로컬 next 가 허용 IP 인 경우만 성공)
  const creds = await loadDecryptedCredentials(user.id)
  if (!creds) {
    return NextResponse.json(
      {
        ok: false,
        error: proxied.unreachable
          ? proxied.error
          : 'API 키를 설정에서 등록하세요'
      },
      { status: proxied.unreachable ? 503 : 400 }
    )
  }

  try {
    const client = new TossClient({
      baseUrl: process.env.TOSS_BASE_URL || 'https://openapi.tossinvest.com',
      credentials: creds
    })
    const plan = sourcePlan(interval)
    const raw = await client.candlesMulti({
      symbol,
      interval: plan.sourceInterval,
      pages: plan.pages,
      countPerPage: 200
    })
    const candles = aggregateCandles(raw, interval)
    return NextResponse.json({
      ok: true,
      symbol,
      interval,
      sourceInterval: plan.sourceInterval,
      sourceCount: raw.length,
      via: 'web-direct',
      candles: candles.map((c) => ({
        time: c.timestamp,
        open: c.openPrice,
        high: c.highPrice,
        low: c.lowPrice,
        close: c.closePrice,
        volume: c.volume,
        currency: c.currency
      })),
      engineNote: proxied.unreachable
        ? '엔진 미연결 — 직접 호출 성공. 프로덕션에서는 엔진 연결을 권장합니다.'
        : undefined
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const enginePart = proxied.unreachable ? ` [엔진: ${proxied.error}]` : ''
    const full = isIpBlockedError(msg)
      ? ipBlockedHelp(msg) + enginePart
      : msg + enginePart
    return NextResponse.json({ ok: false, error: full }, { status: 502 })
  }
}
