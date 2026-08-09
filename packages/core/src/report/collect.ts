/**
 * R0: 토스 Open API 만으로 시황 브리핑용 Evidence 팩 수집.
 */

import type { TossClient } from '../toss/client.js'
import { MARKET_INDICATOR_SYMBOLS_DEFAULT } from '../toss/client.js'
import type { EvidenceItem, MarketBriefPack } from './types.js'

function eid(prefix: string, i: number): string {
  return `${prefix}_${i}_${Date.now().toString(36)}`
}

function pct(rate: string | null | undefined): string | null {
  if (rate == null || rate === '') return null
  const n = Number(rate)
  if (!Number.isFinite(n)) return rate
  return `${(n * 100).toFixed(2)}%`
}

/**
 * 국내·미국 시황 브리핑에 필요한 스냅샷을 수집한다.
 * 일부 API 실패는 errors 에 넣고 나머지는 살린다.
 */
export async function collectMarketBriefPack(client: TossClient): Promise<MarketBriefPack> {
  const generatedAt = new Date().toISOString()
  const evidence: EvidenceItem[] = []
  const errors: string[] = []
  let ei = 0

  const tables: MarketBriefPack['tables'] = {
    indicators: [],
    fx: null,
    calendarKr: null,
    calendarUs: null,
    rankingsKr: [],
    rankingsUs: []
  }

  // ── 지수 ────────────────────────────────────────────────────────────
  try {
    const indicators = await client.marketIndicatorPrices([...MARKET_INDICATOR_SYMBOLS_DEFAULT])
    tables.indicators = indicators.map((x) => ({
      symbol: x.symbol,
      lastPrice: x.lastPrice,
      timestamp: x.timestamp
    }))
    for (const ind of indicators) {
      evidence.push({
        id: eid('ind', ei++),
        collectedAt: generatedAt,
        claimType: 'fact_number',
        sourceTier: 'official',
        sourceName: '토스증권 Open API · market-indicators/prices',
        sourceUrl: 'https://openapi.tossinvest.com',
        summary: `${ind.symbol} 지표 가격 ${ind.lastPrice}` +
          (ind.timestamp ? ` (as of ${ind.timestamp})` : ''),
        data: { ...ind },
        market: ind.symbol.startsWith('KR') || ind.symbol === 'KOSPI' || ind.symbol === 'KOSDAQ'
          ? 'KR'
          : 'ALL'
      })
    }
  } catch (e) {
    errors.push(`지표: ${msg(e)}`)
  }

  // ── 환율 ────────────────────────────────────────────────────────────
  try {
    const fx = await client.exchangeRate()
    tables.fx = {
      midRate: fx.midRate,
      rate: fx.rate,
      pair: `${fx.baseCurrency}/${fx.quoteCurrency}`,
      changeType: fx.rateChangeType
    }
    evidence.push({
      id: eid('fx', ei++),
      collectedAt: generatedAt,
      claimType: 'fact_number',
      sourceTier: 'official',
      sourceName: '토스증권 Open API · exchange-rate',
      sourceUrl: 'https://openapi.tossinvest.com',
      summary: `USD/KRW mid ${fx.midRate} (rate ${fx.rate}, ${fx.rateChangeType})`,
      data: { ...fx },
      market: 'FX'
    })
  } catch (e) {
    errors.push(`환율: ${msg(e)}`)
  }

  // ── 캘린더 ──────────────────────────────────────────────────────────
  for (const country of ['KR', 'US'] as const) {
    try {
      const cal = await client.marketCalendar(country)
      if (country === 'KR') tables.calendarKr = cal
      else tables.calendarUs = cal
      evidence.push({
        id: eid(`cal_${country}`, ei++),
        collectedAt: generatedAt,
        claimType: 'fact_event',
        sourceTier: 'official',
        sourceName: `토스증권 Open API · market-calendar/${country}`,
        sourceUrl: 'https://openapi.tossinvest.com',
        summary: `${country} 장 캘린더 스냅샷 (today/prev/next business day)`,
        data: cal as Record<string, unknown>,
        market: country
      })
    } catch (e) {
      errors.push(`캘린더 ${country}: ${msg(e)}`)
    }
  }

  // ── 랭킹 (국내/미국) ────────────────────────────────────────────────
  const rankingSpecs: {
    type: 'MARKET_TRADING_AMOUNT' | 'TOP_GAINERS' | 'TOP_LOSERS'
    duration: '1d' | 'realtime'
    label: string
  }[] = [
    { type: 'MARKET_TRADING_AMOUNT', duration: '1d', label: '거래대금' },
    { type: 'TOP_GAINERS', duration: '1d', label: '급등' },
    { type: 'TOP_LOSERS', duration: '1d', label: '급락' }
  ]

  for (const market of ['KR', 'US'] as const) {
    for (const spec of rankingSpecs) {
      try {
        const res = await client.rankings({
          type: spec.type,
          marketCountry: market,
          duration: spec.duration,
          count: 10
        })
        const items = res.rankings.slice(0, 10).map((r) => ({
          rank: r.rank,
          symbol: r.symbol,
          lastPrice: r.price.lastPrice,
          changeRate: r.price.changeRate ?? null
        }))
        const block = {
          type: spec.type,
          rankedAt: res.rankedAt,
          items
        }
        if (market === 'KR') tables.rankingsKr.push(block)
        else tables.rankingsUs.push(block)

        const topLine = items
          .slice(0, 5)
          .map(
            (it) =>
              `${it.rank}. ${it.symbol} ${it.lastPrice}` +
              (it.changeRate != null ? ` (${pct(it.changeRate)})` : '')
          )
          .join('; ')

        evidence.push({
          id: eid(`rank_${market}_${spec.type}`, ei++),
          collectedAt: generatedAt,
          claimType: 'fact_number',
          sourceTier: 'official',
          sourceName: `토스증권 Open API · rankings (${spec.type}, ${market}, ${spec.duration})`,
          sourceUrl: 'https://openapi.tossinvest.com',
          summary: `${market} ${spec.label} Top: ${topLine || '(empty)'}`,
          data: { rankedAt: res.rankedAt, items },
          market
        })
      } catch (e) {
        errors.push(`랭킹 ${market}/${spec.type}: ${msg(e)}`)
      }
    }
  }

  return { generatedAt, evidence, errors, tables }
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
