/**
 * R1: 종목 브리핑용 토스 API Evidence 팩
 */

import type { TossClient } from '../toss/client.js'
import type { EvidenceItem, StockBriefPack } from './types.js'

function eid(prefix: string, i: number): string {
  return `${prefix}_${i}_${Date.now().toString(36)}`
}

function inferMarket(symbol: string): 'KR' | 'US' {
  return /^\d{6}$/.test(symbol.trim()) ? 'KR' : 'US'
}

export async function collectStockBriefPack(
  client: TossClient,
  rawSymbol: string
): Promise<StockBriefPack> {
  const symbol = rawSymbol.trim().toUpperCase()
  const market = inferMarket(symbol)
  const generatedAt = new Date().toISOString()
  const evidence: EvidenceItem[] = []
  const errors: string[] = []
  let ei = 0

  const tables: StockBriefPack['tables'] = {
    price: null,
    stock: null,
    warnings: [],
    candles1d: []
  }

  // 가격
  try {
    const prices = await client.prices([symbol])
    const p = prices[0]
    if (p) {
      tables.price = {
        lastPrice: p.lastPrice,
        currency: p.currency,
        timestamp: p.timestamp
      }
      evidence.push({
        id: eid('px', ei++),
        collectedAt: generatedAt,
        claimType: 'fact_number',
        sourceTier: 'official',
        sourceName: '토스증권 Open API · prices',
        sourceUrl: 'https://openapi.tossinvest.com',
        summary: `${symbol} 현재가 ${p.lastPrice} ${p.currency}` +
          (p.timestamp ? ` (${p.timestamp})` : ''),
        data: { ...p },
        market,
        symbol
      })
    } else {
      errors.push('prices: 종목 시세 없음')
    }
  } catch (e) {
    errors.push(`prices: ${msg(e)}`)
  }

  // 종목 마스터
  try {
    const stocks = await client.stocks([symbol])
    const s = stocks[0]
    if (s) {
      tables.stock = {
        name: s.name,
        marketCountry: s.marketCountry,
        currency: s.currency
      }
      evidence.push({
        id: eid('st', ei++),
        collectedAt: generatedAt,
        claimType: 'fact_event',
        sourceTier: 'official',
        sourceName: '토스증권 Open API · stocks',
        sourceUrl: 'https://openapi.tossinvest.com',
        summary: `${symbol} ${s.name ?? ''} (${s.marketCountry ?? market})`,
        data: { ...s },
        market,
        symbol
      })
    }
  } catch (e) {
    errors.push(`stocks: ${msg(e)}`)
  }

  // 유의
  try {
    const warnings = await client.stockWarnings(symbol)
    tables.warnings = warnings
    evidence.push({
      id: eid('wn', ei++),
      collectedAt: generatedAt,
      claimType: 'fact_event',
      sourceTier: 'official',
      sourceName: '토스증권 Open API · stocks/warnings',
      sourceUrl: 'https://openapi.tossinvest.com',
      summary:
        warnings.length === 0
          ? `${symbol} 유의사항 없음`
          : `${symbol} 유의사항 ${warnings.length}건`,
      data: { warnings },
      market,
      symbol
    })
  } catch (e) {
    errors.push(`warnings: ${msg(e)}`)
  }

  // 일봉
  try {
    const page = await client.candles({ symbol, interval: '1d', count: 30 })
    tables.candles1d = page.candles.slice(-30).map((c) => ({
      timestamp: c.timestamp,
      closePrice: c.closePrice,
      volume: c.volume
    }))
    const last = tables.candles1d[tables.candles1d.length - 1]
    const first = tables.candles1d[0]
    let changeNote = ''
    if (first && last) {
      const a = Number(first.closePrice)
      const b = Number(last.closePrice)
      if (Number.isFinite(a) && Number.isFinite(b) && a !== 0) {
        changeNote = ` · 약 ${tables.candles1d.length}거래일 구간 종가 변화 ${(((b - a) / a) * 100).toFixed(2)}%`
      }
    }
    evidence.push({
      id: eid('cd', ei++),
      collectedAt: generatedAt,
      claimType: 'fact_number',
      sourceTier: 'official',
      sourceName: '토스증권 Open API · candles (1d)',
      sourceUrl: 'https://openapi.tossinvest.com',
      summary: `${symbol} 일봉 ${tables.candles1d.length}개` +
        (last ? ` · 최근 종가 ${last.closePrice}` : '') +
        changeNote,
      data: { count: tables.candles1d.length, last, first },
      market,
      symbol
    })
  } catch (e) {
    errors.push(`candles: ${msg(e)}`)
  }

  return { generatedAt, symbol, market, evidence, errors, tables }
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
