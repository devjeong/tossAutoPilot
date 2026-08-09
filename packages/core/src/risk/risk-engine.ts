/**
 * 주문 게이트 오케스트레이터 — 전송 직전 본문까지 생성. 실제 POST 는 하지 않음.
 */
import type { OrderIntent, RiskConfig } from '@tosspilot/shared'
import { DEFAULT_RISK_CONFIG } from '@tosspilot/shared'
import {
  add,
  dec,
  mul,
  toDisplay,
  toFixed,
  ZERO,
  type Dec
} from '../util/decimal.js'
import { convertUsdToKrw } from '../portfolio/compute.js'
import { makeClientOrderId } from '../util/idempotency.js'
import type { TossClient } from '../toss/client.js'
import {
  gateBuyingPower,
  gateDailyLoss,
  gateHighValue,
  gateKillSwitch,
  gateMarketOpen,
  gateMaxOrderAmount,
  gatePriceLimits,
  gateSellableQuantity,
  gateStockWarnings,
  gateSymbolWeight,
  toKrw
} from './gates.js'
import { evaluateMarketOpen } from './market-open.js'
import { normalizePrice, normalizeQuantity } from './price-rules.js'
import type { RiskContext, RiskDecision } from './types.js'

export type RiskEngineOptions = {
  client: TossClient
  config?: Partial<RiskConfig>
  idGenerator?: () => string
  log?: (msg: string, extra?: Record<string, unknown>) => void
}

export class RiskEngine {
  private config: RiskConfig
  private readonly log: (msg: string, extra?: Record<string, unknown>) => void

  constructor(private readonly opts: RiskEngineOptions) {
    this.config = { ...DEFAULT_RISK_CONFIG, ...opts.config }
    this.log = opts.log ?? (() => undefined)
  }

  getConfig(): RiskConfig {
    return this.config
  }

  setConfig(patch: Partial<RiskConfig>): RiskConfig {
    this.config = { ...this.config, ...patch }
    return this.config
  }

  async collectContext(intent: OrderIntent): Promise<RiskContext> {
    const api = this.opts.client
    const nullable = async <T>(label: string, fn: () => Promise<T>): Promise<T | null> => {
      try {
        return await fn()
      } catch (err) {
        this.log(`게이트 데이터 조회 실패: ${label}`, {
          error: err instanceof Error ? err.message : String(err)
        })
        return null
      }
    }

    const currency = intent.market === 'KR' ? 'KRW' : 'USD'

    const [
      calendar,
      warningsRaw,
      priceLimits,
      prices,
      buyingPower,
      sellable,
      holdings,
      fx,
      bpKrw,
      bpUsd
    ] = await Promise.all([
      nullable('장 운영', () => api.marketCalendar(intent.market)),
      nullable('종목 유의사항', () => api.stockWarnings(intent.symbol)),
      nullable('상하한가', () => api.priceLimits(intent.symbol)),
      nullable('현재가', () => api.prices([intent.symbol])),
      intent.side === 'BUY'
        ? nullable('매수여력', () => api.buyingPower(currency))
        : Promise.resolve(null),
      intent.side === 'SELL'
        ? nullable('판매가능수량', () => api.sellableQuantity(intent.symbol))
        : Promise.resolve(null),
      nullable('보유 현황', () => api.holdings()),
      nullable('환율', () => api.exchangeRate()),
      nullable('예수금 KRW', () => api.buyingPower('KRW')),
      nullable('예수금 USD', () => api.buyingPower('USD'))
    ])

    const warnings =
      warningsRaw === null
        ? null
        : warningsRaw.map((w) => {
            if (typeof w === 'string') return w
            if (w && typeof w === 'object' && 'warningType' in w) {
              return String((w as { warningType: unknown }).warningType)
            }
            return String(w)
          })

    const lastPriceStr = prices?.find((p) => p.symbol === intent.symbol)?.lastPrice
    const dailyRate = holdings ? dec(holdings.dailyProfitLoss.rate) : null

    let cashValueKrw: Dec | null = null
    if (bpKrw || bpUsd) {
      const krwCash = bpKrw ? dec(bpKrw.cashBuyingPower) : ZERO
      const usdCash = bpUsd ? dec(bpUsd.cashBuyingPower) : ZERO
      if (usdCash === ZERO) {
        cashValueKrw = krwCash
      } else if (fx) {
        cashValueKrw = add(krwCash, convertUsdToKrw(usdCash, fx))
      } else {
        cashValueKrw = krwCash
      }
    }

    return {
      now: Date.now(),
      marketOpen: calendar ? evaluateMarketOpen(calendar, Date.now()) : null,
      warnings,
      priceLimits,
      lastPrice: lastPriceStr ? dec(lastPriceStr) : null,
      buyingPower: buyingPower ? dec(buyingPower.cashBuyingPower) : null,
      sellableQuantity: sellable ? dec(sellable.sellableQuantity) : null,
      holdings,
      fx,
      cashValueKrw,
      dailyPnlRate: dailyRate
    }
  }

  async evaluate(intent: OrderIntent): Promise<RiskDecision> {
    const ctx = await this.collectContext(intent)
    return this.evaluateWith(intent, ctx)
  }

  evaluateWith(intent: OrderIntent, ctx: RiskContext): RiskDecision {
    const notes: string[] = []

    const qty = normalizeQuantity(dec(intent.quantity))
    if (qty.adjusted) notes.push(`수량을 정수 ${toFixed(qty.value, 0)}주로 맞췄습니다`)

    let priceDec: Dec | null = null
    if (intent.orderType === 'LIMIT' && intent.price) {
      const np = normalizePrice(dec(intent.price), intent.market, intent.side)
      priceDec = np.value
      if (np.adjusted) {
        notes.push(
          `가격을 ${toDisplay(dec(intent.price), intent.market === 'KR' ? 0 : 4)} → ${toDisplay(np.value, intent.market === 'KR' ? 0 : 4)} 로 조정 (${np.rule})`
        )
      }
    }

    const normalized: OrderIntent = {
      ...intent,
      quantity: toFixed(qty.value, 0),
      ...(priceDec === null
        ? {}
        : { price: toFixed(priceDec, intent.market === 'KR' ? 0 : 4) })
    }

    const referencePrice = priceDec ?? ctx.lastPrice
    const notionalIsEstimate = intent.orderType === 'MARKET'
    const notionalNative = referencePrice ? mul(referencePrice, qty.value) : ZERO
    const notionalKrwOrNull = toKrw(notionalNative, intent.market, ctx)
    const notionalKrw = notionalKrwOrNull ?? ZERO

    const results = [
      gateKillSwitch(this.config),
      gateMarketOpen(ctx),
      gateStockWarnings(ctx, normalized),
      gatePriceLimits(ctx, normalized),
      gateBuyingPower(ctx, normalized, notionalNative),
      gateSellableQuantity(ctx, normalized),
      gateSymbolWeight(ctx, normalized, this.config, notionalKrw),
      gateDailyLoss(ctx, this.config)
    ]

    if (notionalKrwOrNull === null) {
      results.push({
        id: 'F4.8',
        name: '착오주문 방지',
        verdict: 'BLOCK',
        detail: '환율을 확인하지 못해 원화 환산 주문금액을 계산할 수 없습니다'
      })
      results.push({
        id: 'F4.9',
        name: '최대 주문금액',
        verdict: 'BLOCK',
        detail: '환율을 확인하지 못해 한도를 판정할 수 없습니다'
      })
    } else if (referencePrice === null) {
      results.push({
        id: 'F4.8',
        name: '착오주문 방지',
        verdict: 'BLOCK',
        detail: '참조가를 확인하지 못해 주문금액을 계산할 수 없습니다'
      })
      results.push({
        id: 'F4.9',
        name: '최대 주문금액',
        verdict: 'BLOCK',
        detail: '참조가를 확인하지 못해 한도를 판정할 수 없습니다'
      })
    } else {
      results.push(gateHighValue(normalized, this.config, notionalKrw))
      results.push(gateMaxOrderAmount(this.config, notionalKrw))
    }

    const blocked = results.filter((r) => r.verdict === 'BLOCK')
    const allowed = blocked.length === 0

    const decision: RiskDecision = {
      allowed,
      intent,
      normalized,
      normalizationNotes: notes,
      results,
      notionalKrw,
      notionalIsEstimate,
      request: allowed ? this.buildRequest(normalized) : null,
      blockedBy: blocked.map((r) => `${r.id} ${r.name}: ${r.detail}`)
    }

    this.log(allowed ? '게이트 통과 — 전송 대기' : '게이트 차단', {
      symbol: intent.symbol,
      side: intent.side,
      blocked: decision.blockedBy
    })

    return decision
  }

  buildRequest(intent: OrderIntent) {
    const body = {
      clientOrderId: this.opts.idGenerator?.() ?? makeClientOrderId('ord').slice(0, 36),
      symbol: intent.symbol,
      side: intent.side,
      orderType: intent.orderType,
      timeInForce: intent.timeInForce ?? 'DAY',
      quantity: intent.quantity,
      confirmHighValueOrder: intent.highValueApproved === true,
      ...(intent.orderType === 'LIMIT' && intent.price ? { price: intent.price } : {})
    }
    return body
  }
}
