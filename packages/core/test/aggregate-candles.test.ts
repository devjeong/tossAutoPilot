import { describe, expect, it } from 'vitest'
import { aggregateCandles, searchKrMaster } from '../src/index.js'

describe('aggregateCandles', () => {
  it('aggregates 1m to 5m', () => {
    const base = Date.parse('2026-03-10T00:00:00Z')
    const src = Array.from({ length: 10 }, (_, i) => ({
      timestamp: new Date(base + i * 60_000).toISOString(),
      openPrice: String(100 + i),
      highPrice: String(110 + i),
      lowPrice: String(90 + i),
      closePrice: String(105 + i),
      volume: '10'
    }))
    const out = aggregateCandles(src, '5m')
    expect(out.length).toBe(2)
    expect(out[0]!.openPrice).toBe('100')
    expect(out[0]!.closePrice).toBe('109')
    expect(out[0]!.volume).toBe('50')
  })
})

describe('searchKrMaster', () => {
  it('finds by hangul name', () => {
    const r = searchKrMaster('삼성')
    expect(r.some((x) => x.symbol === '005930')).toBe(true)
  })
})
