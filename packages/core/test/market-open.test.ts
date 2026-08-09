import { describe, expect, it } from 'vitest'
import { evaluateMarketOpen, sessionDateKeyKst } from '../src/risk/market-open.js'

describe('evaluateMarketOpen', () => {
  it('returns closed when no sessions', () => {
    const r = evaluateMarketOpen(
      {
        today: { date: '2026-01-01' }
      },
      Date.parse('2026-01-01T01:00:00+09:00')
    )
    expect(r.open).toBe(false)
    expect(r.detail).toContain('휴장')
  })

  it('detects open regular session', () => {
    const start = '2026-03-10T09:00:00+09:00'
    const end = '2026-03-10T15:30:00+09:00'
    const mid = Date.parse('2026-03-10T12:00:00+09:00')
    const r = evaluateMarketOpen(
      {
        today: {
          date: '2026-03-10',
          regularMarket: { startTime: start, endTime: end }
        }
      },
      mid
    )
    expect(r.open).toBe(true)
  })
})

describe('sessionDateKeyKst', () => {
  it('returns YYYY-MM-DD', () => {
    expect(sessionDateKeyKst(Date.parse('2026-03-10T12:00:00+09:00'))).toMatch(
      /^\d{4}-\d{2}-\d{2}$/
    )
  })
})
