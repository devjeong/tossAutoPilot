import { describe, expect, it } from 'vitest'
import { dec } from '../src/util/decimal.js'
import {
  buildPortfolioSnapshot,
  computeTotals,
  convertKrwToUsd,
  convertUsdToKrw
} from '../src/portfolio/compute.js'
import type { ExchangeRate, Holdings } from '../src/toss/client.js'

const fx: ExchangeRate = {
  baseCurrency: 'USD',
  quoteCurrency: 'KRW',
  rate: '1385.50',
  midRate: '1384.20',
  rateChangeType: 'UP'
}

describe('portfolio fx', () => {
  it('USD→KRW midRate', () => {
    expect(convertUsdToKrw(dec('10'), fx).toString()).not.toBe('0')
  })

  it('합산 총자산 = 주식 + 예수금', () => {
    const holdings = {
      totalPurchaseAmount: { krw: '1000000', usd: '0' },
      marketValue: { amount: { krw: '1100000', usd: '100' }, amountAfterCost: { krw: '0', usd: '0' } },
      profitLoss: {
        amount: { krw: '100000', usd: '0' },
        amountAfterCost: { krw: '0', usd: '0' },
        rate: '0.1',
        rateAfterCost: '0.1'
      },
      dailyProfitLoss: { amount: { krw: '1000', usd: '0' }, rate: '0.001' },
      items: []
    } as Holdings

    const t = computeTotals(holdings, fx, { krw: dec('500000'), usd: dec('0') })
    // 1100000 + 100*1384.20 + 500000
    expect(t.valueKrw > dec('1600000')).toBe(true)
  })

  it('buildPortfolioSnapshot serializes', () => {
    const snap = buildPortfolioSnapshot({
      holdings: null,
      fx,
      cashKrw: dec('1000'),
      cashUsd: dec('10'),
      partialErrors: []
    })
    expect(snap.totals.cashKrw).toBe('1,000')
    expect(snap.fx?.midRate).toBe('1384.20')
    expect(snap.totals.valueUsd).not.toBe('0.00')
  })
})
