import { NextResponse } from 'next/server'
import { CHART_INTERVALS, type ChartInterval } from '@tosspilot/core'
import { createClient } from '@/lib/supabase/server'
import { engineFetchJson } from '@/lib/engine-proxy'

type CandlePayload = {
  ok: boolean
  candles?: unknown[]
  error?: string
  via?: string
}

/** GET — 차트 캔들. 토스는 엔진에서만 호출 */
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

  const proxied = await engineFetchJson<CandlePayload>('/internal/market/candles', {
    method: 'POST',
    body: JSON.stringify({ userId: user.id, symbol, interval })
  })

  if (!proxied.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: proxied.error,
        hint: '모든 토스 API 는 엔진(허용 IP) 경유입니다. ENGINE_URL · 엔진 기동 · 시크릿을 확인하세요.'
      },
      { status: proxied.status || 503 }
    )
  }

  return NextResponse.json(proxied.data)
}
