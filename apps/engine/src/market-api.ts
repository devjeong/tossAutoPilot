/**
 * 토스 시세·캔들·종목 조회 — 허용 IP 의 엔진에서만 호출.
 * Vercel 등 다른 egress IP 는 토스에서 차단되므로 웹이 이 API 로 프록시한다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  TossClient,
  aggregateCandles,
  detectMarketFromStockInfo,
  hasHangul,
  isKrSymbolCode,
  isUsTickerLike,
  searchKrMaster,
  sourcePlan,
  CHART_INTERVALS,
  type ChartInterval
} from '@tosspilot/core'
import type { EngineConfig } from './config.js'
import { loadActiveCredentials } from './credentials.js'

export async function handleMarketCandles(opts: {
  supabase: SupabaseClient
  config: EngineConfig
  masterKey: string
  userId: string
  symbol: string
  interval: string
}): Promise<{ status: number; body: unknown }> {
  const symbol = opts.symbol.trim().toUpperCase()
  const interval = opts.interval as ChartInterval
  if (!symbol) return { status: 400, body: { ok: false, error: 'symbol required' } }
  if (!(CHART_INTERVALS as readonly string[]).includes(interval)) {
    return {
      status: 400,
      body: { ok: false, error: `interval must be one of ${CHART_INTERVALS.join(',')}` }
    }
  }

  const client = await makeClient(opts)
  if ('error' in client) return client.error

  try {
    const plan = sourcePlan(interval)
    const raw = await client.toss.candlesMulti({
      symbol,
      interval: plan.sourceInterval,
      pages: plan.pages,
      countPerPage: 200
    })
    const candles = aggregateCandles(raw, interval)
    return {
      status: 200,
      body: {
        ok: true,
        symbol,
        interval,
        sourceInterval: plan.sourceInterval,
        sourceCount: raw.length,
        via: 'engine',
        candles: candles.map((c) => ({
          time: c.timestamp,
          open: c.openPrice,
          high: c.highPrice,
          low: c.lowPrice,
          close: c.closePrice,
          volume: c.volume,
          currency: c.currency
        }))
      }
    }
  } catch (e) {
    return {
      status: 502,
      body: { ok: false, error: formatTossError(e), via: 'engine' }
    }
  }
}

export async function handleMarketSearch(opts: {
  supabase: SupabaseClient
  config: EngineConfig
  masterKey: string
  userId: string
  q: string
}): Promise<{ status: number; body: unknown }> {
  const q = opts.q.trim()
  if (!q) return { status: 200, body: { ok: true, items: [], via: 'engine' } }

  type Hit = {
    symbol: string
    name: string
    market: 'KR' | 'US'
    exchange?: string
    currency?: string
  }
  const hits: Hit[] = []
  const seen = new Set<string>()
  const push = (h: Hit) => {
    const key = h.symbol.toUpperCase()
    if (seen.has(key)) return
    seen.add(key)
    hits.push(h)
  }

  // 마스터 검색은 토스 없이도 가능
  if (hasHangul(q) || isKrSymbolCode(q) || /^\d+$/.test(q)) {
    for (const m of searchKrMaster(q, 15)) {
      push({ symbol: m.symbol, name: m.name, market: 'KR', currency: 'KRW' })
    }
  }

  const client = await makeClient(opts)
  if ('error' in client) {
    // 자격증명/엔진 문제여도 마스터 결과는 반환
    if (hits.length) return { status: 200, body: { ok: true, items: hits, via: 'engine-master' } }
    return client.error
  }

  try {
    if (hits.length) {
      const infos = await client.toss.stocks(hits.map((h) => h.symbol))
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
    }

    if (isKrSymbolCode(q) && !seen.has(q)) {
      const infos = await client.toss.stocks([q])
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
    }

    if (isUsTickerLike(q) || (!hasHangul(q) && !/^\d+$/.test(q))) {
      const ticker = q.toUpperCase()
      try {
        const infos = await client.toss.stocks([ticker])
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
        if (isUsTickerLike(ticker) && !seen.has(ticker)) {
          push({ symbol: ticker, name: ticker, market: 'US' })
        }
      }
    }

    return { status: 200, body: { ok: true, items: hits.slice(0, 20), via: 'engine' } }
  } catch (e) {
    if (hits.length) {
      return {
        status: 200,
        body: {
          ok: true,
          items: hits.slice(0, 20),
          via: 'engine-master',
          warning: formatTossError(e)
        }
      }
    }
    return { status: 502, body: { ok: false, error: formatTossError(e), via: 'engine' } }
  }
}

async function makeClient(opts: {
  supabase: SupabaseClient
  config: EngineConfig
  masterKey: string
  userId: string
}): Promise<{ toss: TossClient } | { error: { status: number; body: unknown } }> {
  if (!opts.masterKey) {
    return {
      error: {
        status: 500,
        body: { ok: false, error: 'CREDENTIALS_MASTER_KEY missing on engine' }
      }
    }
  }
  const creds = await loadActiveCredentials(opts.supabase, opts.userId, opts.masterKey)
  if (!creds) {
    return {
      error: {
        status: 400,
        body: { ok: false, error: '활성 API 키 없음 — 설정에서 등록하세요' }
      }
    }
  }
  return {
    toss: new TossClient({
      baseUrl: opts.config.tossBaseUrl,
      credentials: creds
    })
  }
}

function formatTossError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (/ip address not allowed|not allowed|403|ip/i.test(msg)) {
    return (
      `${msg} — 토스 Open API 가 엔진(허용 IP) 외 호출을 차단했습니다. ` +
      `엔진이 토스 콘솔에 등록한 IP 에서 실행 중인지 확인하세요.`
    )
  }
  return msg
}
