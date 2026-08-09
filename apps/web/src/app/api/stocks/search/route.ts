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

export type StockSearchHit = {
  symbol: string
  name: string
  market: 'KR' | 'US'
  exchange?: string
  currency?: string
}

/** GET /api/stocks/search?q=삼성 */
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

  const creds = await loadDecryptedCredentials(user.id)
  if (!creds) {
    return NextResponse.json(
      { ok: false, error: 'API 키를 설정에서 등록하세요' },
      { status: 400 }
    )
  }

  const toss = new TossClient({
    baseUrl: process.env.TOSS_BASE_URL || 'https://openapi.tossinvest.com',
    credentials: creds
  })

  const hits: StockSearchHit[] = []
  const seen = new Set<string>()

  const push = (h: StockSearchHit) => {
    const key = h.symbol.toUpperCase()
    if (seen.has(key)) return
    seen.add(key)
    hits.push(h)
  }

  try {
    // 1) 국내: 종목명 / 코드 마스터 검색
    if (hasHangul(q) || isKrSymbolCode(q) || /^\d+$/.test(q)) {
      const masterHits = searchKrMaster(q, 15)
      if (masterHits.length) {
        // 토스 메타 보강
        try {
          const infos = await toss.stocks(masterHits.map((m) => m.symbol))
          const bySym = new Map(infos.map((i) => [i.symbol, i]))
          for (const m of masterHits) {
            const info = bySym.get(m.symbol)
            push({
              symbol: m.symbol,
              name: info?.name || m.name,
              market: detectMarketFromStockInfo({ ...info, symbol: m.symbol }),
              exchange: info?.market,
              currency: info?.currency ?? 'KRW'
            })
          }
        } catch {
          for (const m of masterHits) {
            push({ symbol: m.symbol, name: m.name, market: 'KR', currency: 'KRW' })
          }
        }
      }

      // 6자리 정확 코드 — 마스터에 없어도 조회
      if (isKrSymbolCode(q) && !seen.has(q)) {
        try {
          const infos = await toss.stocks([q])
          const info = infos[0]
          if (info) {
            push({
              symbol: info.symbol,
              name: info.name || info.symbol,
              market: detectMarketFromStockInfo(info),
              exchange: info.market,
              currency: info.currency
            })
          }
        } catch {
          /* ignore */
        }
      }
    }

    // 2) 미국 티커 / 영문 심볼
    if (isUsTickerLike(q) || (!hasHangul(q) && !/^\d+$/.test(q))) {
      const ticker = q.toUpperCase()
      try {
        const infos = await toss.stocks([ticker])
        for (const info of infos) {
          push({
            symbol: info.symbol,
            name: info.name || info.englishName || info.symbol,
            market: detectMarketFromStockInfo(info),
            exchange: info.market,
            currency: info.currency
          })
        }
      } catch {
        // 실패해도 휴리스틱 후보
        if (isUsTickerLike(ticker) && !seen.has(ticker)) {
          push({
            symbol: ticker,
            name: ticker,
            market: isKrSymbolCode(ticker) ? 'KR' : 'US'
          })
        }
      }
    }

    // 3) 영문 부분 — 마스터 영문 없음, 인기 티커 힌트는 생략

    return NextResponse.json({ ok: true, items: hits.slice(0, 20) })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}
