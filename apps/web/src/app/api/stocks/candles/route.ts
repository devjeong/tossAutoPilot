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

/** GET /api/stocks/candles?symbol=005930&interval=15m */
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

  const creds = await loadDecryptedCredentials(user.id)
  if (!creds) {
    return NextResponse.json(
      { ok: false, error: 'API 키를 설정에서 등록하세요' },
      { status: 400 }
    )
  }

  const client = new TossClient({
    baseUrl: process.env.TOSS_BASE_URL || 'https://openapi.tossinvest.com',
    credentials: creds
  })

  try {
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
      candles: candles.map((c) => ({
        time: c.timestamp,
        open: c.openPrice,
        high: c.highPrice,
        low: c.lowPrice,
        close: c.closePrice,
        volume: c.volume,
        currency: c.currency
      }))
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}
