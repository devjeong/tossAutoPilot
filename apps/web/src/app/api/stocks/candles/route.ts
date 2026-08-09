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
  allowWebDirectToss,
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

/** GET /api/stocks/candles?symbol=005930&interval=15m — 엔진 프록시 필수(Vercel) */
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

  // 1) 허용 IP 엔진 경유
  const proxied = await engineFetchJson<CandlePayload>('/internal/market/candles', {
    method: 'POST',
    body: JSON.stringify({ userId: user.id, symbol, interval })
  })

  if (proxied.ok) {
    return NextResponse.json(proxied.data)
  }

  // 2) Vercel 등: 엔진 실패 시 토스 직접 호출하지 않음 (IP 차단 + 혼란 메시지 방지)
  if (!allowWebDirectToss()) {
    return NextResponse.json(
      {
        ok: false,
        error: proxied.error,
        hint: '종목 검색은 로컬 마스터로 될 수 있지만, 차트는 엔진→토스 호출이 필요합니다.'
      },
      { status: proxied.status || 503 }
    )
  }

  // 3) 로컬 Next 전용 fallback
  const creds = await loadDecryptedCredentials(user.id)
  if (!creds) {
    return NextResponse.json(
      { ok: false, error: proxied.error || 'API 키를 설정에서 등록하세요' },
      { status: 400 }
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
      engineNote: '엔진 미연결 — 로컬 직접 호출'
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const full = isIpBlockedError(msg)
      ? ipBlockedHelp(msg) + `\n\n[엔진]\n${proxied.error}`
      : `${msg}\n\n[엔진]\n${proxied.error}`
    return NextResponse.json({ ok: false, error: full }, { status: 502 })
  }
}
