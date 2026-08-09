/**
 * 포트폴리오 합산 · 환율 환산 · 표시용 스냅샷.
 * holdings 는 통화 간 합산을 안 해 주므로 midRate 로 클라이언트가 합친다.
 */

import {
  add,
  dec,
  div,
  mul,
  toDisplay,
  toFixed,
  ZERO,
  type Dec
} from '../util/decimal.js'
import type { ExchangeRate, Holdings, HoldingItem } from '../toss/client.js'

export type DisplayCurrency = 'KRW' | 'USD'

export function convertUsdToKrw(usd: Dec, fx: ExchangeRate): Dec {
  if (usd === ZERO) return ZERO
  const rate = dec(fx.midRate)
  if (rate === ZERO) return ZERO
  if (fx.baseCurrency === 'USD' && fx.quoteCurrency === 'KRW') return mul(usd, rate)
  if (fx.baseCurrency === 'KRW' && fx.quoteCurrency === 'USD') return div(usd, rate)
  return ZERO
}

export function convertKrwToUsd(krw: Dec, fx: ExchangeRate): Dec {
  if (krw === ZERO) return ZERO
  const rate = dec(fx.midRate)
  if (rate === ZERO) return ZERO
  if (fx.baseCurrency === 'USD' && fx.quoteCurrency === 'KRW') return div(krw, rate)
  if (fx.baseCurrency === 'KRW' && fx.quoteCurrency === 'USD') return mul(krw, rate)
  return ZERO
}

function combine(
  amount: { krw: string; usd?: string | null } | undefined,
  fx: ExchangeRate | null
): { totalKrw: Dec; totalUsd: Dec; krw: Dec; usd: Dec; fxMissing: boolean } {
  const krw = dec(amount?.krw ?? '0')
  const usd = dec(amount?.usd ?? '0')
  if (usd === ZERO && krw === ZERO) {
    return { totalKrw: ZERO, totalUsd: ZERO, krw, usd, fxMissing: false }
  }
  if (!fx) {
    // 환율 없으면 같은 통화만 총액에 넣고, 반대 통화는 누락 표시
    return {
      totalKrw: krw,
      totalUsd: usd,
      krw,
      usd,
      fxMissing: usd !== ZERO && krw !== ZERO ? true : usd !== ZERO || krw !== ZERO
        ? usd !== ZERO && krw === ZERO
          ? true // only USD without fx
          : false
        : false
    }
  }
  // fxMissing for USD-only without conversion was true above; with fx:
  const totalKrw = add(krw, convertUsdToKrw(usd, fx))
  const totalUsd = add(usd, convertKrwToUsd(krw, fx))
  return { totalKrw, totalUsd, krw, usd, fxMissing: false }
}

export interface PortfolioTotals {
  /** 총자산 = 주식 + 예수금 */
  valueKrw: Dec
  valueUsd: Dec
  stocksValueKrw: Dec
  stocksValueUsd: Dec
  cashValueKrw: Dec
  cashValueUsd: Dec
  cashKrw: Dec
  cashUsd: Dec
  stocksKrw: Dec
  stocksUsd: Dec
  purchaseKrw: Dec
  purchaseUsd: Dec
  profitLossKrw: Dec
  profitLossUsd: Dec
  dailyProfitLossKrw: Dec
  dailyProfitLossUsd: Dec
  profitLossRate: Dec
  dailyProfitLossRate: Dec
  fxMissing: boolean
}

export function computeTotals(
  holdings: Holdings | null,
  fx: ExchangeRate | null,
  cash?: { krw: Dec; usd: Dec }
): PortfolioTotals {
  const stocks = combine(holdings?.marketValue.amount, fx)
  const purchase = combine(holdings?.totalPurchaseAmount, fx)
  const pl = combine(holdings?.profitLoss.amount, fx)
  const daily = combine(holdings?.dailyProfitLoss.amount, fx)

  const cashKrw = cash?.krw ?? ZERO
  const cashUsd = cash?.usd ?? ZERO
  let cashValueKrw = cashKrw
  let cashValueUsd = cashUsd
  let cashFxMissing = false
  if (fx) {
    cashValueKrw = add(cashKrw, convertUsdToKrw(cashUsd, fx))
    cashValueUsd = add(cashUsd, convertKrwToUsd(cashKrw, fx))
  } else if (cashUsd !== ZERO && cashKrw !== ZERO) {
    cashFxMissing = true
  } else if (cashUsd !== ZERO && !fx) {
    cashFxMissing = true
  }

  return {
    stocksValueKrw: stocks.totalKrw,
    stocksValueUsd: stocks.totalUsd,
    cashValueKrw,
    cashValueUsd,
    cashKrw,
    cashUsd,
    stocksKrw: stocks.krw,
    stocksUsd: stocks.usd,
    valueKrw: add(stocks.totalKrw, cashValueKrw),
    valueUsd: add(stocks.totalUsd, cashValueUsd),
    purchaseKrw: purchase.totalKrw,
    purchaseUsd: purchase.totalUsd,
    profitLossKrw: pl.totalKrw,
    profitLossUsd: pl.totalUsd,
    dailyProfitLossKrw: daily.totalKrw,
    dailyProfitLossUsd: daily.totalUsd,
    profitLossRate: dec(holdings?.profitLoss.rate ?? '0'),
    dailyProfitLossRate: dec(holdings?.dailyProfitLoss.rate ?? '0'),
    fxMissing: stocks.fxMissing || pl.fxMissing || daily.fxMissing || cashFxMissing
  }
}

const pct = (ratio: Dec): string => toFixed(mul(ratio, dec('100')), 2)

/** DB/UI 로 직렬화 가능한 스냅샷 (bigint 없음) */
export interface PortfolioSnapshotDto {
  updatedAt: number
  fx: {
    baseCurrency: string
    quoteCurrency: string
    midRate: string
    rate: string
    rateChangeType: string
  } | null
  totals: {
    valueKrw: string
    valueUsd: string
    stocksValueKrw: string
    stocksValueUsd: string
    cashValueKrw: string
    cashValueUsd: string
    cashKrw: string
    cashUsd: string
    stocksKrw: string
    stocksUsd: string
    purchaseKrw: string
    purchaseUsd: string
    profitLossKrw: string
    profitLossUsd: string
    dailyProfitLossKrw: string
    dailyProfitLossUsd: string
    profitLossPercent: string
    dailyProfitLossPercent: string
    fxMissing: boolean
  }
  items: {
    symbol: string
    name: string
    currency: string
    marketCountry: string
    quantity: string
    lastPrice: string
    averagePurchasePrice: string
    marketValue: string
    marketValueKrw: string
    marketValueUsd: string
    profitLoss: string
    profitLossPercent: string
    dailyProfitLoss: string
    weightPercent: string
  }[]
  partialErrors: string[]
}

function itemValueInKrw(it: HoldingItem, fx: ExchangeRate | null): Dec {
  const amt = dec(it.marketValue.amount)
  if (it.currency === 'USD') {
    if (!fx) return ZERO
    return convertUsdToKrw(amt, fx)
  }
  return amt
}

function itemValueInUsd(it: HoldingItem, fx: ExchangeRate | null): Dec {
  const amt = dec(it.marketValue.amount)
  if (it.currency === 'KRW') {
    if (!fx) return ZERO
    return convertKrwToUsd(amt, fx)
  }
  return amt
}

export function buildPortfolioSnapshot(params: {
  holdings: Holdings | null
  fx: ExchangeRate | null
  cashKrw: Dec
  cashUsd: Dec
  partialErrors: string[]
  now?: number
}): PortfolioSnapshotDto {
  const t = computeTotals(params.holdings, params.fx, {
    krw: params.cashKrw,
    usd: params.cashUsd
  })
  const totalKrw = t.valueKrw

  return {
    updatedAt: params.now ?? Date.now(),
    fx: params.fx
      ? {
          baseCurrency: params.fx.baseCurrency,
          quoteCurrency: params.fx.quoteCurrency,
          midRate: params.fx.midRate,
          rate: params.fx.rate,
          rateChangeType: params.fx.rateChangeType
        }
      : null,
    totals: {
      valueKrw: toDisplay(t.valueKrw),
      valueUsd: toDisplay(t.valueUsd, 2),
      stocksValueKrw: toDisplay(t.stocksValueKrw),
      stocksValueUsd: toDisplay(t.stocksValueUsd, 2),
      cashValueKrw: toDisplay(t.cashValueKrw),
      cashValueUsd: toDisplay(t.cashValueUsd, 2),
      cashKrw: toDisplay(t.cashKrw),
      cashUsd: toDisplay(t.cashUsd, 2),
      stocksKrw: toDisplay(t.stocksKrw),
      stocksUsd: toDisplay(t.stocksUsd, 2),
      purchaseKrw: toDisplay(t.purchaseKrw),
      purchaseUsd: toDisplay(t.purchaseUsd, 2),
      profitLossKrw: toDisplay(t.profitLossKrw),
      profitLossUsd: toDisplay(t.profitLossUsd, 2),
      dailyProfitLossKrw: toDisplay(t.dailyProfitLossKrw),
      dailyProfitLossUsd: toDisplay(t.dailyProfitLossUsd, 2),
      profitLossPercent: pct(t.profitLossRate),
      dailyProfitLossPercent: pct(t.dailyProfitLossRate),
      fxMissing: t.fxMissing
    },
    items: (params.holdings?.items ?? []).map((it) => {
      const isUsd = it.currency === 'USD'
      const priceDp = isUsd ? 2 : 0
      const vKrw = itemValueInKrw(it, params.fx)
      const vUsd = itemValueInUsd(it, params.fx)
      const weight = totalKrw === ZERO ? ZERO : div(vKrw, totalKrw)
      return {
        symbol: it.symbol,
        name: it.name,
        currency: it.currency,
        marketCountry: it.marketCountry,
        quantity: toDisplay(dec(it.quantity), isUsd ? 4 : 0),
        lastPrice: toDisplay(dec(it.lastPrice), priceDp),
        averagePurchasePrice: toDisplay(dec(it.averagePurchasePrice), priceDp),
        marketValue: toDisplay(dec(it.marketValue.amount), priceDp),
        marketValueKrw: toDisplay(vKrw),
        marketValueUsd: toDisplay(vUsd, 2),
        profitLoss: toDisplay(dec(it.profitLoss.amount), priceDp),
        profitLossPercent: pct(dec(it.profitLoss.rate)),
        dailyProfitLoss: toDisplay(dec(it.dailyProfitLoss.amount), priceDp),
        weightPercent: pct(weight)
      }
    }),
    partialErrors: params.partialErrors
  }
}
