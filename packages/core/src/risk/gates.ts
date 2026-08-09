/**
 * 주문 전 게이트 10 (SPEC F4) — AUTO_TRADE_VER2 포팅.
 */
import type { GateResult, OrderIntent, RiskConfig } from '@tosspilot/shared'
import {
  add,
  cmp,
  dec,
  div,
  mul,
  toDisplay,
  toFixed,
  ZERO,
  type Dec
} from '../util/decimal.js'
import { convertUsdToKrw } from '../portfolio/compute.js'
import type { RiskContext } from './types.js'

const pass = (id: string, name: string, detail: string): GateResult => ({
  id,
  name,
  verdict: 'PASS',
  detail
})
const block = (id: string, name: string, detail: string): GateResult => ({
  id,
  name,
  verdict: 'BLOCK',
  detail
})
const warn = (id: string, name: string, detail: string): GateResult => ({
  id,
  name,
  verdict: 'WARN',
  detail
})

const unknown = (id: string, name: string, what: string): GateResult =>
  block(id, name, `${what}을(를) 확인하지 못해 차단했습니다`)

const WARNING_LABELS: Record<string, string> = {
  LIQUIDATION_TRADING: '정리매매',
  OVERHEATED: '단기과열',
  INVESTMENT_WARNING: '투자경고',
  INVESTMENT_RISK: '투자위험',
  VI_STATIC_AND_DYNAMIC: 'VI 정적+동적 발동',
  VI_STATIC: 'VI 정적 발동',
  VI_DYNAMIC: 'VI 동적 발동',
  STOCK_WARRANTS: '신주인수권'
}

const BLOCKING_WARNINGS = new Set([
  'LIQUIDATION_TRADING',
  'INVESTMENT_RISK',
  'INVESTMENT_WARNING',
  'OVERHEATED'
])

export function gateKillSwitch(config: RiskConfig): GateResult {
  const id = 'F4.10'
  const name = '킬 스위치'
  return config.killSwitch
    ? block(id, name, '전체 정지 상태입니다. 해제 전에는 어떤 주문도 나가지 않습니다')
    : pass(id, name, '해제됨')
}

export function gateMarketOpen(ctx: RiskContext): GateResult {
  const id = 'F4.1'
  const name = '장 운영'
  if (!ctx.marketOpen) return unknown(id, name, '장 운영 시간')
  return ctx.marketOpen.open
    ? pass(id, name, ctx.marketOpen.detail)
    : block(id, name, ctx.marketOpen.detail)
}

export function gateStockWarnings(ctx: RiskContext, intent: OrderIntent): GateResult {
  const id = 'F4.2'
  const name = '종목 상태'
  if (ctx.warnings === null) return unknown(id, name, '종목 유의사항')

  const labels = ctx.warnings.map((w) => WARNING_LABELS[w] ?? w)
  if (ctx.warnings.length === 0) return pass(id, name, '유의사항 없음')

  const blocking = ctx.warnings.filter((w) => BLOCKING_WARNINGS.has(w))
  if (blocking.length > 0 && intent.side === 'BUY') {
    return block(id, name, `매수 제한 종목: ${labels.join(', ')}`)
  }
  return warn(id, name, `유의사항 있음: ${labels.join(', ')}`)
}

export function gatePriceLimits(ctx: RiskContext, intent: OrderIntent): GateResult {
  const id = 'F4.3'
  const name = '가격 범위'

  if (intent.orderType === 'MARKET') return pass(id, name, '시장가 — 가격 제한 대상 아님')
  if (!intent.price) return block(id, name, '지정가 주문인데 가격이 없습니다')
  if (ctx.priceLimits === null) return unknown(id, name, '상·하한가')

  const upper = ctx.priceLimits.upperLimitPrice
  const lower = ctx.priceLimits.lowerLimitPrice
  if (!upper && !lower) return pass(id, name, '가격 제한이 없는 시장')

  const price = dec(intent.price)
  if (upper && cmp(price, dec(upper)) > 0) {
    return block(id, name, `상한가 ${toDisplay(dec(upper))} 초과`)
  }
  if (lower && cmp(price, dec(lower)) < 0) {
    return block(id, name, `하한가 ${toDisplay(dec(lower))} 미만`)
  }
  return pass(
    id,
    name,
    `${lower ? toDisplay(dec(lower)) : '—'} ~ ${upper ? toDisplay(dec(upper)) : '—'} 범위 내`
  )
}

export function gateBuyingPower(
  ctx: RiskContext,
  intent: OrderIntent,
  notionalNative: Dec
): GateResult {
  const id = 'F4.4'
  const name = '매수여력'
  if (intent.side !== 'BUY') return pass(id, name, '매도 주문 — 해당 없음')
  if (ctx.buyingPower === null) return unknown(id, name, '매수가능금액')

  const unit = intent.market === 'KR' ? '원' : '달러'
  if (cmp(notionalNative, ctx.buyingPower) <= 0) {
    return pass(
      id,
      name,
      `가능 ${toDisplay(ctx.buyingPower, intent.market === 'KR' ? 0 : 2)}${unit}`
    )
  }

  const price = intent.price ? dec(intent.price) : ctx.lastPrice
  if (price && price > ZERO) {
    const affordable = dec(toFixed(div(ctx.buyingPower, price), 0))
    const capped = cmp(affordable, dec(intent.quantity)) < 0 ? affordable : dec(intent.quantity)
    if (capped > ZERO) {
      return {
        id,
        name,
        verdict: 'BLOCK',
        detail: `여력 부족 — 필요 ${toDisplay(notionalNative, 0)}${unit} / 가능 ${toDisplay(ctx.buyingPower, 0)}${unit}`,
        adjustment: {
          quantity: toFixed(capped, 0),
          reason: `매수여력에 맞춰 ${toFixed(capped, 0)}주로 축소`
        }
      }
    }
  }
  return block(
    id,
    name,
    `여력 부족 — 필요 ${toDisplay(notionalNative, 0)}${unit} / 가능 ${toDisplay(ctx.buyingPower, 0)}${unit}`
  )
}

export function gateSellableQuantity(ctx: RiskContext, intent: OrderIntent): GateResult {
  const id = 'F4.5'
  const name = '매도가능수량'
  if (intent.side !== 'SELL') return pass(id, name, '매수 주문 — 해당 없음')
  if (ctx.sellableQuantity === null) return unknown(id, name, '판매가능수량')

  const want = dec(intent.quantity)
  if (cmp(want, ctx.sellableQuantity) <= 0) {
    return pass(id, name, `가능 ${toDisplay(ctx.sellableQuantity, 0)}주`)
  }
  const avail = ctx.sellableQuantity
  const base = block(
    id,
    name,
    `보유 초과 — 요청 ${toDisplay(want, 0)}주 / 가능 ${toDisplay(avail, 0)}주`
  )
  return avail > ZERO
    ? {
        ...base,
        adjustment: {
          quantity: toFixed(avail, 0),
          reason: `가능 수량 ${toFixed(avail, 0)}주로 축소`
        }
      }
    : base
}

export function gateSymbolWeight(
  ctx: RiskContext,
  intent: OrderIntent,
  config: RiskConfig,
  notionalKrw: Dec
): GateResult {
  const id = 'F4.6'
  const name = '종목 비중'
  if (intent.side !== 'BUY') return pass(id, name, '매도 주문 — 비중이 늘지 않음')
  if (!ctx.holdings) return unknown(id, name, '보유 현황')

  const totalKrw = totalValueKrw(ctx)
  if (totalKrw === ZERO) return pass(id, name, '보유 자산이 없어 비중 계산 대상 아님')

  const current = currentSymbolValueKrw(ctx, intent.symbol)
  const after = add(current, notionalKrw)
  const denominator = add(totalKrw, notionalKrw)
  const weight = mul(div(after, denominator), dec('100'))
  const limit = dec(String(config.maxSymbolWeightPercent))

  if (cmp(weight, limit) <= 0) {
    return pass(id, name, `주문 후 ${toFixed(weight, 2)}% / 상한 ${config.maxSymbolWeightPercent}%`)
  }
  return block(
    id,
    name,
    `비중 초과 — 주문 후 ${toFixed(weight, 2)}% / 상한 ${config.maxSymbolWeightPercent}%`
  )
}

export function gateDailyLoss(ctx: RiskContext, config: RiskConfig): GateResult {
  const id = 'F4.7'
  const name = '일일 손실 한도'
  if (ctx.dailyPnlRate === null) return unknown(id, name, '일간 손익')

  const pctValue = mul(ctx.dailyPnlRate, dec('100'))
  const limit = dec(String(config.dailyLossLimitPercent))
  if (cmp(pctValue, limit) <= 0) {
    return block(
      id,
      name,
      `한도 도달 — 오늘 ${toFixed(pctValue, 2)}% / 한도 ${config.dailyLossLimitPercent}%`
    )
  }
  return pass(id, name, `오늘 ${toFixed(pctValue, 2)}% / 한도 ${config.dailyLossLimitPercent}%`)
}

export function gateHighValue(
  intent: OrderIntent,
  config: RiskConfig,
  notionalKrw: Dec
): GateResult {
  const id = 'F4.8'
  const name = '착오주문 방지'
  const threshold = dec(config.highValueThresholdKrw)
  if (cmp(notionalKrw, threshold) < 0) {
    return pass(id, name, `${toDisplay(threshold)}원 미만`)
  }

  if (intent.highValueApproved || config.autoApproveHighValue) {
    return warn(
      id,
      name,
      `고액 주문 ${toDisplay(notionalKrw)}원 — ${intent.highValueApproved ? '사용자 승인됨' : '설정에 의해 자동 승인'}`
    )
  }
  return block(
    id,
    name,
    `고액 주문 ${toDisplay(notionalKrw)}원 — 확인이 필요합니다 (confirmHighValueOrder)`
  )
}

export const SPEC_MAX_ORDER_AMOUNT_KRW = '3000000000'

export function gateMaxOrderAmount(config: RiskConfig, notionalKrw: Dec): GateResult {
  const id = 'F4.9'
  const name = '최대 주문금액'
  const max = dec(config.maxOrderAmountKrw)
  if (cmp(notionalKrw, max) >= 0) {
    const isSpecLimit = cmp(max, dec(SPEC_MAX_ORDER_AMOUNT_KRW)) >= 0
    return block(
      id,
      name,
      isSpecLimit
        ? `${toDisplay(max)}원 이상은 서버가 거부합니다`
        : `설정한 한도 ${toDisplay(max)}원을 넘습니다`
    )
  }
  return pass(id, name, `설정 한도 ${toDisplay(max)}원 미만`)
}

export function totalValueKrw(ctx: RiskContext): Dec {
  let stocks = ZERO
  const h = ctx.holdings
  if (h) {
    const krw = dec(h.marketValue.amount.krw)
    const usd = dec(h.marketValue.amount.usd ?? '0')
    stocks = usd === ZERO || !ctx.fx ? krw : add(krw, convertUsdToKrw(usd, ctx.fx))
  }
  const cash = ctx.cashValueKrw ?? ZERO
  return add(stocks, cash)
}

export function currentSymbolValueKrw(ctx: RiskContext, symbol: string): Dec {
  const item = ctx.holdings?.items.find((i) => i.symbol === symbol)
  if (!item) return ZERO
  const value = dec(item.marketValue.amount)
  if (item.currency !== 'USD') return value
  return ctx.fx ? convertUsdToKrw(value, ctx.fx) : ZERO
}

export function toKrw(amount: Dec, market: 'KR' | 'US', ctx: RiskContext): Dec | null {
  if (market === 'KR') return amount
  if (!ctx.fx) return null
  return convertUsdToKrw(amount, ctx.fx)
}
