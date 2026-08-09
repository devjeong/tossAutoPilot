import { NextResponse } from 'next/server'
import {
  TossClient,
  detectMarketFromStockInfo,
  hasHangul,
  isKrSymbolCode,
  isUsTickerLike,
  searchKrMaster
} from '@tosspilot/core'
import { createClient } from '@/lib/supabase/server'
import { loadDecryptedCredentials } from '@/lib/credentials-store'
import { engineFetchJson, isIpBlockedError } from '@/lib/engine-proxy'

export type StockSearchHit = {
  symbol: string
  name: string
  market: 'KR' | 'US'
  exchange?: string
  currency?: string
}

/** GET /api/stocks/search?q=삼성 — 엔진 프록시 우선 */
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

  // 1) 엔진
  const proxied = await engineFetchJson<{
    ok: boolean
    items?: StockSearchHit[]
    error?: string
    via?: string
  }>('/internal/market/search', {
    method: 'POST',
    body: JSON.stringify({ userId: user.id, q })
  })

  if (proxied.ok && proxied.data.ok) {
    return NextResponse.json(proxied.data)
  }

  const proxyErr = proxied.ok ? undefined : proxied.error
  const proxyUnreachable = !proxied.ok && Boolean(proxied.unreachable)

  // 2) 마스터 단독 (한글/코드) — 토스 없이 동작
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

  // 3) 직접 토스 (허용 IP 로컬 개발)
  const creds = await loadDecryptedCredentials(user.id)
  if (!creds) {
    if (masterHits.length) {
      return NextResponse.json({
        ok: true,
        items: masterHits,
        via: 'master-only',
        warning: proxyErr || 'API 키 없음 — 마스터 검색만 사용'
      })
    }
    return NextResponse.json(
      { ok: false, error: proxyErr || 'API 키를 설정에서 등록하세요' },
      { status: 400 }
    )
  }

  try {
    const toss = new TossClient({
      baseUrl: process.env.TOSS_BASE_URL || 'https://openapi.tossinvest.com',
      credentials: creds
    })
    const hits: StockSearchHit[] = [...masterHits]
    const seen = new Set(hits.map((h) => h.symbol))

    if (hits.length) {
      try {
        const infos = await toss.stocks(hits.map((h) => h.symbol))
        const bySym = new Map(infos.map((i) => [i.symbol, i]))
        for (const h of hits) {
          const info = bySym.get(h.symbol)
          if (info) {
            h.name = info.name || h.name
            h.market = detectMarketFromStockInfo({ ...info, symbol: h.symbol })
            h.exchange = info.market
            h.currency = info.currency ?? h.currency
          }
        }
      } catch {
        /* keep master names */
      }
    }

    if (isUsTickerLike(q) || (!hasHangul(q) && !/^\d+$/.test(q))) {
      const ticker = q.toUpperCase()
      if (!seen.has(ticker)) {
        const infos = await toss.stocks([ticker])
        for (const info of infos) {
          hits.push({
            symbol: info.symbol,
            name: info.name || info.englishName || info.symbol,
            market: detectMarketFromStockInfo(info),
            exchange: info.market,
            currency: info.currency
          })
        }
      }
    }

    return NextResponse.json({
      ok: true,
      items: hits.slice(0, 20),
      via: 'web-direct',
      engineNote: proxyUnreachable ? proxyErr : undefined
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (masterHits.length) {
      return NextResponse.json({
        ok: true,
        items: masterHits,
        via: 'master-only',
        warning: isIpBlockedError(msg)
          ? '토스 IP 제한 — 국내 마스터 검색만 표시. 차트는 엔진(허용 IP) 필요.'
          : msg
      })
    }
    return NextResponse.json(
      {
        ok: false,
        error: isIpBlockedError(msg)
          ? `${msg} — 엔진을 허용 IP 에서 실행하고 ENGINE_URL 을 연결하세요.`
          : msg
      },
      { status: 502 }
    )
  }
}
