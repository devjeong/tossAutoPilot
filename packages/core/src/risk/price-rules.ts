/**
 * 주문 가격·수량 정규화 (SPEC F5.3) — AUTO_TRADE_VER2 포팅.
 */
import { dec, div, mul, toFixed, ZERO, type Dec } from '../util/decimal.js'

export interface TickBand {
  below: number
  tick: number
}

export const KR_TICK_BANDS: readonly TickBand[] = [
  { below: 2_000, tick: 1 },
  { below: 5_000, tick: 5 },
  { below: 20_000, tick: 10 },
  { below: 50_000, tick: 50 },
  { below: 200_000, tick: 100 },
  { below: 500_000, tick: 500 },
  { below: Number.POSITIVE_INFINITY, tick: 1_000 }
]

export function krTickSize(price: Dec): number {
  const p = Number(toFixed(price, 0))
  for (const band of KR_TICK_BANDS) {
    if (p < band.below) return band.tick
  }
  return 1_000
}

export interface NormalizedPrice {
  value: Dec
  adjusted: boolean
  rule: string
}

export function normalizeKrPrice(price: Dec, side: 'BUY' | 'SELL'): NormalizedPrice {
  const tick = krTickSize(price)
  const tickDec = dec(String(tick))
  const units = div(price, tickDec)
  const floorUnits = dec(toFixed(units, 0))
  let snapped = mul(floorUnits, tickDec)

  if (side === 'BUY' && snapped > price) snapped = mul(floorUnits - dec('1'), tickDec)
  if (side === 'SELL' && snapped < price) snapped = mul(floorUnits + dec('1'), tickDec)

  return {
    value: snapped,
    adjusted: snapped !== price,
    rule: `KR 호가단위 ${tick.toLocaleString('en-US')}원 (${side === 'BUY' ? '내림' : '올림'})`
  }
}

export function normalizeUsPrice(price: Dec): NormalizedPrice {
  const dp = price < dec('1') ? 4 : 2
  const truncated = truncate(price, dp)
  return {
    value: truncated,
    adjusted: truncated !== price,
    rule: `US 가격 소수 ${dp}자리 절삭`
  }
}

export function normalizePrice(
  price: Dec,
  market: 'KR' | 'US',
  side: 'BUY' | 'SELL'
): NormalizedPrice {
  return market === 'KR' ? normalizeKrPrice(price, side) : normalizeUsPrice(price)
}

export function truncate(value: Dec, dp: number): Dec {
  const scale = dec('1' + '0'.repeat(dp))
  const scaled = mul(value, scale)
  const whole = dec(integerPart(scaled))
  return div(whole, scale)
}

function integerPart(value: Dec): string {
  const s = toFixed(value, 12)
  const [int = '0'] = s.split('.')
  return int
}

export function normalizeQuantity(quantity: Dec): { value: Dec; adjusted: boolean } {
  const whole = dec(integerPart(quantity))
  return { value: whole, adjusted: whole !== quantity }
}

export function orderNotional(price: Dec | null, quantity: Dec): Dec {
  if (price === null) return ZERO
  return mul(price, quantity)
}
