import { NextResponse } from 'next/server'
import { hasHangul, isKrSymbolCode, searchKrMaster } from '@tosspilot/core'
import { createClient } from '@/lib/supabase/server'
import { engineFetchJson } from '@/lib/engine-proxy'

export type StockSearchHit = {
  symbol: string
  name: string
  market: 'KR' | 'US'
  exchange?: string
  currency?: string
}

/** GET — 종목 검색. 토스 stocks 조회는 엔진 경유. 마스터만 엔진 불가 시 허용 */
export async function GET(req: Request) {
  const supabase = await createClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const q = new URL(req.url).searchParams.get('q')?.trim() ?? ''
  if (q.length < 1) {
    return NextResponse.json({ ok: true, items: [] as StockSearchHit[] })
  }

  const proxied = await engineFetchJson<{
    ok: boolean
    items?: StockSearchHit[]
    error?: string
    via?: string
    warning?: string
  }>('/internal/market/search', {
    method: 'POST',
    body: JSON.stringify({ userId: user.id, q })
  })

  if (proxied.ok && proxied.data.ok) {
    return NextResponse.json(proxied.data)
  }

  // 엔진 불가 시: 토스 없이 로컬 마스터만 (한글/코드)
  const masterHits: StockSearchHit[] = []
  if (hasHangul(q) || isKrSymbolCode(q) || /^\d+$/.test(q)) {
    for (const m of searchKrMaster(q, 15)) {
      masterHits.push({
        symbol: m.symbol,
        name: m.name,
        market: 'KR',
        currency: 'KRW'
      })
    }
  }

  if (masterHits.length) {
    return NextResponse.json({
      ok: true,
      items: masterHits,
      via: 'master-only',
      warning:
        (proxied.ok ? undefined : proxied.error) ||
        '엔진 미연결 — 국내 마스터 검색만 사용 (토스 메타 없음)'
    })
  }

  return NextResponse.json(
    {
      ok: false,
      error:
        (proxied.ok ? '검색 결과 없음' : proxied.error) ||
        '엔진에 연결할 수 없습니다. 미국 티커 검색은 엔진(토스) 경유가 필요합니다.'
    },
    { status: proxied.ok ? 404 : proxied.status || 503 }
  )
}
