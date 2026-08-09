import type { GateResult, OrderIntent, RiskConfig } from '@tosspilot/shared'
import type { Dec } from '../util/decimal.js'
import type { ExchangeRate, Holdings, OrderCreateBody, PriceLimits } from '../toss/client.js'

export type { RiskConfig }

export type MarketOpenInfo = { open: boolean; detail: string }

export type RiskContext = {
  now: number
  marketOpen: MarketOpenInfo | null
  /** warningType 문자열 목록 */
  warnings: string[] | null
  priceLimits: PriceLimits | null
  lastPrice: Dec | null
  buyingPower: Dec | null
  sellableQuantity: Dec | null
  holdings: Holdings | null
  fx: ExchangeRate | null
  cashValueKrw: Dec | null
  /** holdings.dailyProfitLoss.rate (소수비율) */
  dailyPnlRate: Dec | null
}

export type RiskDecision = {
  allowed: boolean
  intent: OrderIntent
  normalized: OrderIntent
  normalizationNotes: string[]
  results: GateResult[]
  notionalKrw: Dec
  notionalIsEstimate: boolean
  request: OrderCreateBody | null
  blockedBy: string[]
}
