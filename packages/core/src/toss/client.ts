/**
 * 토스 Open API 클라이언트 — 토큰 · prices · holdings · 환율 · 예수금.
 */

import { z } from 'zod'
import { TokenBucket } from '../rateLimit/tokenBucket.js'
import type { TossCredentials } from '../crypto/credentials-payload.js'
import { DEFAULT_TOSS_BASE_URL } from './connection-test.js'

export const MAX_SYMBOLS_PER_PRICE_CALL = 200
export const MAX_ORDER_PAGE_SIZE = 100

const TokenResponse = z.object({
  access_token: z.string().min(1),
  token_type: z.string(),
  expires_in: z.number().int().positive()
})

const Price = z.object({
  symbol: z.string(),
  timestamp: z.string().nullable().optional(),
  lastPrice: z.string(),
  currency: z.string()
})
export type TossPrice = z.infer<typeof Price>
const PriceList = z.array(Price)

const decimal = z.string()
const CurrencyAmount = z.object({
  krw: decimal,
  usd: decimal.nullable().optional()
})

const HoldingItem = z.object({
  symbol: z.string(),
  name: z.string(),
  marketCountry: z.string(),
  currency: z.string(),
  quantity: decimal,
  lastPrice: decimal,
  averagePurchasePrice: decimal,
  marketValue: z.object({
    purchaseAmount: decimal,
    amount: decimal,
    amountAfterCost: decimal
  }),
  profitLoss: z.object({
    amount: decimal,
    amountAfterCost: decimal,
    rate: decimal,
    rateAfterCost: decimal
  }),
  dailyProfitLoss: z.object({
    amount: decimal,
    rate: decimal
  }),
  cost: z
    .object({
      commission: decimal,
      tax: decimal.nullable().optional()
    })
    .passthrough()
    .optional()
})
export type HoldingItem = z.infer<typeof HoldingItem>

const Holdings = z.object({
  totalPurchaseAmount: CurrencyAmount,
  marketValue: z.object({
    amount: CurrencyAmount,
    amountAfterCost: CurrencyAmount
  }),
  profitLoss: z.object({
    amount: CurrencyAmount,
    amountAfterCost: CurrencyAmount,
    rate: decimal,
    rateAfterCost: decimal
  }),
  dailyProfitLoss: z.object({
    amount: CurrencyAmount,
    rate: decimal
  }),
  items: z.array(HoldingItem)
})
export type Holdings = z.infer<typeof Holdings>

const ExchangeRate = z.object({
  baseCurrency: z.string(),
  quoteCurrency: z.string(),
  rate: decimal,
  midRate: decimal,
  basisPoint: decimal.optional(),
  rateChangeType: z.string(),
  validFrom: z.string().optional(),
  validUntil: z.string().optional()
})
export type ExchangeRate = z.infer<typeof ExchangeRate>

const BuyingPower = z.object({
  currency: z.string(),
  cashBuyingPower: decimal
})
export type BuyingPower = z.infer<typeof BuyingPower>

const MarketIndicatorPrice = z.object({
  symbol: z.string(),
  timestamp: z.string().nullable().optional(),
  lastPrice: decimal
})
export type MarketIndicatorPrice = z.infer<typeof MarketIndicatorPrice>
const MarketIndicatorPriceList = z.array(MarketIndicatorPrice)

export const RANKING_TYPES = [
  'MARKET_TRADING_AMOUNT',
  'MARKET_TRADING_VOLUME',
  'TOP_GAINERS',
  'TOP_LOSERS',
  'TOSS_SECURITIES_TRADING_AMOUNT',
  'TOSS_SECURITIES_TRADING_VOLUME'
] as const
export type RankingType = (typeof RANKING_TYPES)[number]

export const RANKING_DURATIONS = ['realtime', '1d', '1w', '1mo', '3mo', '6mo', '1y'] as const
export type RankingDuration = (typeof RANKING_DURATIONS)[number]

const RankingItem = z.object({
  rank: z.number().int(),
  symbol: z.string(),
  currency: z.string(),
  price: z.object({
    lastPrice: decimal,
    basePrice: decimal,
    changeRate: decimal.nullable().optional()
  }),
  tradingVolume: decimal,
  tradingAmount: decimal
})
export type RankingItem = z.infer<typeof RankingItem>

const RankingResponse = z.object({
  rankedAt: z.string().nullable().optional(),
  rankings: z.array(RankingItem)
})
export type RankingResponse = z.infer<typeof RankingResponse>

const MarketCalendar = z
  .object({
    today: z.record(z.string(), z.unknown()),
    previousBusinessDay: z.record(z.string(), z.unknown()).optional(),
    nextBusinessDay: z.record(z.string(), z.unknown()).optional()
  })
  .passthrough()
export type MarketCalendar = z.infer<typeof MarketCalendar>

export const MARKET_INDICATOR_SYMBOLS_DEFAULT = [
  'KOSPI',
  'KOSDAQ',
  'KR_BOND_3Y',
  'KR_BOND_10Y'
] as const

const StockInfo = z
  .object({
    symbol: z.string(),
    name: z.string().optional(),
    englishName: z.string().optional(),
    market: z.string().optional(),
    marketCountry: z.string().optional(),
    currency: z.string().optional(),
    status: z.string().optional()
  })
  .passthrough()
export type StockInfo = z.infer<typeof StockInfo>
const StockInfoList = z.array(StockInfo)

const Candle = z.object({
  timestamp: z.string(),
  openPrice: decimal,
  highPrice: decimal,
  lowPrice: decimal,
  closePrice: decimal,
  volume: decimal,
  currency: z.string().optional()
})
export type Candle = z.infer<typeof Candle>
const CandlePage = z.object({
  candles: z.array(Candle),
  nextBefore: z.string().nullable().optional()
})
export type CandlePage = z.infer<typeof CandlePage>

const PriceLimits = z.object({
  timestamp: z.string().optional(),
  upperLimitPrice: decimal.nullable().optional(),
  lowerLimitPrice: decimal.nullable().optional(),
  currency: z.string().optional()
})
export type PriceLimits = z.infer<typeof PriceLimits>

const SellableQuantity = z.object({
  sellableQuantity: decimal
})
export type SellableQuantity = z.infer<typeof SellableQuantity>

const OrderExecution = z.object({
  filledQuantity: decimal,
  averageFilledPrice: decimal.nullable().optional(),
  filledAmount: decimal.nullable().optional(),
  commission: decimal.nullable().optional(),
  tax: decimal.nullable().optional(),
  filledAt: z.string().nullable().optional(),
  settlementDate: z.string().nullable().optional()
})

const TossOrder = z.object({
  orderId: z.string(),
  symbol: z.string(),
  side: z.string(),
  orderType: z.string(),
  timeInForce: z.string().optional(),
  status: z.string(),
  price: decimal.nullable().optional(),
  quantity: decimal,
  orderAmount: decimal.nullable().optional(),
  currency: z.string().optional(),
  orderedAt: z.string().optional(),
  canceledAt: z.string().nullable().optional(),
  execution: OrderExecution.optional()
})
export type TossOrder = z.infer<typeof TossOrder>

const OrderPage = z.object({
  orders: z.array(TossOrder),
  nextCursor: z.string().nullable().optional(),
  hasNext: z.boolean().optional()
})
export type OrderPage = z.infer<typeof OrderPage>

const OrderCreateResult = z.object({
  orderId: z.string(),
  clientOrderId: z.string().nullable().optional()
})
export type OrderCreateResult = z.infer<typeof OrderCreateResult>

const OrderCancelResult = z.object({
  orderId: z.string()
})
export type OrderCancelResult = z.infer<typeof OrderCancelResult>

export type OrderCreateBody = {
  clientOrderId: string
  symbol: string
  side: 'BUY' | 'SELL'
  orderType: 'LIMIT' | 'MARKET'
  timeInForce: 'DAY' | 'CLS'
  quantity: string
  price?: string
  confirmHighValueOrder: boolean
}

export interface TossClientOptions {
  baseUrl?: string
  credentials: TossCredentials
  /** 계좌 컨텍스트 API 용. holdings / buying-power 필수. */
  accountSeq?: number
  fetchImpl?: typeof fetch
  timeoutMs?: number
  marketDataLimit?: number
}

export class TossClient {
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number
  private readonly marketBucket: TokenBucket
  private readonly genericBucket: TokenBucket
  private accessToken: string | undefined
  private expiresAt = 0
  private inflightToken: Promise<string> | undefined
  private credentials: TossCredentials
  private accountSeq: number | undefined

  constructor(opts: TossClientOptions) {
    this.baseUrl = (opts.baseUrl || DEFAULT_TOSS_BASE_URL).replace(/\/$/, '')
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch
    this.timeoutMs = opts.timeoutMs ?? 15_000
    this.credentials = {
      clientId: opts.credentials.clientId.trim(),
      clientSecret: opts.credentials.clientSecret.trim()
    }
    this.accountSeq = opts.accountSeq
    this.marketBucket = new TokenBucket(opts.marketDataLimit ?? 5)
    this.genericBucket = new TokenBucket(3)
  }

  setCredentials(c: TossCredentials): void {
    this.credentials = {
      clientId: c.clientId.trim(),
      clientSecret: c.clientSecret.trim()
    }
    this.invalidateToken()
  }

  setAccountSeq(seq: number | undefined): void {
    this.accountSeq = seq
  }

  invalidateToken(): void {
    this.accessToken = undefined
    this.expiresAt = 0
  }

  marketHeadroom(): number {
    return this.marketBucket.headroom()
  }

  private async getToken(): Promise<string> {
    const skewMs = 5 * 60 * 1000
    if (this.accessToken && Date.now() < this.expiresAt - skewMs) {
      return this.accessToken
    }
    if (this.inflightToken) return this.inflightToken
    this.inflightToken = this.issueToken().finally(() => {
      this.inflightToken = undefined
    })
    return this.inflightToken
  }

  private async issueToken(): Promise<string> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json'
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.credentials.clientId,
        client_secret: this.credentials.clientSecret
      }).toString()
    })
    const json: unknown = await res.json().catch(() => ({}))
    if (!res.ok) {
      const err = json as { error?: string; error_description?: string }
      throw new Error(err.error_description || err.error || `token HTTP ${res.status}`)
    }
    const parsed = TokenResponse.parse(json)
    this.accessToken = parsed.access_token
    this.expiresAt = Date.now() + parsed.expires_in * 1000
    return this.accessToken
  }

  async prices(symbols: readonly string[]): Promise<TossPrice[]> {
    if (symbols.length === 0) return []
    const unique = [...new Set(symbols.map((s) => s.trim()).filter(Boolean))]
    const out: TossPrice[] = []
    for (let i = 0; i < unique.length; i += MAX_SYMBOLS_PER_PRICE_CALL) {
      const chunk = unique.slice(i, i + MAX_SYMBOLS_PER_PRICE_CALL)
      const payload = await this.authedGet({
        path: '/api/v1/prices',
        query: { symbols: chunk.join(',') },
        bucket: this.marketBucket,
        account: false
      })
      out.push(...PriceList.parse(payload))
    }
    return out
  }

  /** GET /api/v1/holdings — account 헤더 필수 */
  async holdings(): Promise<Holdings> {
    const payload = await this.authedGet({
      path: '/api/v1/holdings',
      bucket: this.genericBucket,
      account: true
    })
    return Holdings.parse(payload)
  }

  /** GET /api/v1/exchange-rate?baseCurrency=USD&quoteCurrency=KRW */
  async exchangeRate(): Promise<ExchangeRate> {
    const payload = await this.authedGet({
      path: '/api/v1/exchange-rate',
      query: { baseCurrency: 'USD', quoteCurrency: 'KRW' },
      bucket: this.genericBucket,
      account: false
    })
    return ExchangeRate.parse(payload)
  }

  /** GET /api/v1/buying-power?currency= */
  async buyingPower(currency: 'KRW' | 'USD'): Promise<BuyingPower> {
    const payload = await this.authedGet({
      path: '/api/v1/buying-power',
      query: { currency },
      bucket: this.genericBucket,
      account: true
    })
    return BuyingPower.parse(payload)
  }

  /** GET /api/v1/market-indicators/prices */
  async marketIndicatorPrices(symbols: readonly string[]): Promise<MarketIndicatorPrice[]> {
    if (symbols.length === 0) return []
    const payload = await this.authedGet({
      path: '/api/v1/market-indicators/prices',
      query: { symbols: symbols.join(',') },
      bucket: this.genericBucket,
      account: false
    })
    return MarketIndicatorPriceList.parse(payload)
  }

  /** GET /api/v1/rankings */
  async rankings(params: {
    type: RankingType
    marketCountry: 'KR' | 'US'
    duration: RankingDuration
    count?: number
  }): Promise<RankingResponse> {
    const query: Record<string, string> = {
      type: params.type,
      marketCountry: params.marketCountry,
      duration: params.duration
    }
    if (params.count !== undefined) query.count = String(params.count)
    const payload = await this.authedGet({
      path: '/api/v1/rankings',
      query,
      bucket: this.genericBucket,
      account: false
    })
    return RankingResponse.parse(payload)
  }

  /** GET /api/v1/market-calendar/{KR|US} */
  async marketCalendar(country: 'KR' | 'US'): Promise<MarketCalendar> {
    const payload = await this.authedGet({
      path: `/api/v1/market-calendar/${country}`,
      bucket: this.genericBucket,
      account: false
    })
    return MarketCalendar.parse(payload)
  }

  /** GET /api/v1/stocks?symbols= */
  async stocks(symbols: readonly string[]): Promise<StockInfo[]> {
    if (symbols.length === 0) return []
    const payload = await this.authedGet({
      path: '/api/v1/stocks',
      query: { symbols: symbols.join(',') },
      bucket: this.genericBucket,
      account: false
    })
    return StockInfoList.parse(payload)
  }

  /** GET /api/v1/stocks/{symbol}/warnings */
  async stockWarnings(symbol: string): Promise<unknown[]> {
    const payload = await this.authedGet({
      path: `/api/v1/stocks/${encodeURIComponent(symbol)}/warnings`,
      bucket: this.genericBucket,
      account: false
    })
    if (Array.isArray(payload)) return payload
    if (payload && typeof payload === 'object' && 'warnings' in payload) {
      const w = (payload as { warnings: unknown }).warnings
      return Array.isArray(w) ? w : []
    }
    return []
  }

  /** GET /api/v1/candles — interval 은 1m | 1d 만 (스펙) */
  async candles(params: {
    symbol: string
    interval: '1m' | '1d'
    count?: number
    before?: string
    adjusted?: boolean
  }): Promise<CandlePage> {
    const query: Record<string, string> = {
      symbol: params.symbol,
      interval: params.interval
    }
    if (params.count !== undefined) query.count = String(params.count)
    if (params.before) query.before = params.before
    if (params.adjusted !== undefined) query.adjusted = String(params.adjusted)
    const payload = await this.authedGet({
      path: '/api/v1/candles',
      query,
      bucket: this.marketBucket,
      account: false
    })
    return CandlePage.parse(payload)
  }

  /**
   * 캔들 여러 페이지 수집 (최신 → 과거). 반환은 시간 오름차순.
   * 토스 1회 최대 200봉.
   */
  async candlesMulti(params: {
    symbol: string
    interval: '1m' | '1d'
    pages?: number
    countPerPage?: number
  }): Promise<Candle[]> {
    const pages = Math.max(1, Math.min(params.pages ?? 1, 20))
    const count = Math.min(params.countPerPage ?? 200, 200)
    const all: Candle[] = []
    let before: string | undefined
    for (let i = 0; i < pages; i++) {
      const page = await this.candles({
        symbol: params.symbol,
        interval: params.interval,
        count,
        before,
        adjusted: true
      })
      if (!page.candles.length) break
      all.push(...page.candles)
      if (!page.nextBefore) break
      before = page.nextBefore
    }
    // 최신 페이지가 먼저 오므로 중복 제거 후 오름차순
    const byTs = new Map<string, Candle>()
    for (const c of all) byTs.set(c.timestamp, c)
    return [...byTs.values()].sort(
      (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)
    )
  }

  // ── Orders ────────────────────────────────────────────────────────────

  /** POST /api/v1/orders — clientOrderId 멱등키 필수 */
  async createOrder(body: OrderCreateBody): Promise<OrderCreateResult> {
    if (!body.clientOrderId?.trim()) {
      throw new Error('clientOrderId(멱등키) 없이 주문을 보낼 수 없습니다')
    }
    const payload = await this.authedRequest({
      method: 'POST',
      path: '/api/v1/orders',
      bucket: this.genericBucket,
      account: true,
      body
    })
    return OrderCreateResult.parse(payload)
  }

  /** POST /api/v1/orders/{id}/cancel — 새 orderId 발급됨 */
  async cancelOrder(orderId: string): Promise<OrderCancelResult> {
    const payload = await this.authedRequest({
      method: 'POST',
      path: `/api/v1/orders/${encodeURIComponent(orderId)}/cancel`,
      bucket: this.genericBucket,
      account: true,
      body: {}
    })
    return OrderCancelResult.parse(payload)
  }

  /** GET /api/v1/orders */
  async orders(query: {
    status: 'OPEN' | 'CLOSED'
    symbol?: string
    from?: string
    to?: string
    cursor?: string
    limit?: number
  }): Promise<OrderPage> {
    if (query.limit !== undefined && query.limit > MAX_ORDER_PAGE_SIZE) {
      throw new Error(`orders() limit must be <= ${MAX_ORDER_PAGE_SIZE}`)
    }
    const q: Record<string, string> = { status: query.status }
    if (query.symbol) q.symbol = query.symbol
    if (query.from) q.from = query.from
    if (query.to) q.to = query.to
    if (query.cursor) q.cursor = query.cursor
    if (query.limit !== undefined) q.limit = String(query.limit)
    const payload = await this.authedGet({
      path: '/api/v1/orders',
      query: q,
      bucket: this.genericBucket,
      account: true
    })
    return OrderPage.parse(payload)
  }

  /** GET /api/v1/orders/{id} */
  async order(orderId: string): Promise<TossOrder> {
    const payload = await this.authedGet({
      path: `/api/v1/orders/${encodeURIComponent(orderId)}`,
      bucket: this.genericBucket,
      account: true
    })
    return TossOrder.parse(payload)
  }

  /** GET /api/v1/price-limits */
  async priceLimits(symbol: string): Promise<PriceLimits> {
    const payload = await this.authedGet({
      path: '/api/v1/price-limits',
      query: { symbol },
      bucket: this.marketBucket,
      account: false
    })
    return PriceLimits.parse(payload)
  }

  /** GET /api/v1/sellable-quantity */
  async sellableQuantity(symbol: string): Promise<SellableQuantity> {
    const payload = await this.authedGet({
      path: '/api/v1/sellable-quantity',
      query: { symbol },
      bucket: this.genericBucket,
      account: true
    })
    return SellableQuantity.parse(payload)
  }

  private async authedGet(opts: {
    path: string
    query?: Record<string, string>
    bucket: TokenBucket
    account: boolean
  }): Promise<unknown> {
    return this.authedRequest({
      method: 'GET',
      path: opts.path,
      query: opts.query,
      bucket: opts.bucket,
      account: opts.account
    })
  }

  private async authedRequest(opts: {
    method: 'GET' | 'POST'
    path: string
    query?: Record<string, string>
    body?: unknown
    bucket: TokenBucket
    account: boolean
  }): Promise<unknown> {
    await opts.bucket.take(1)
    const token = await this.getToken()
    const url = new URL(opts.path, this.baseUrl)
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      url.searchParams.set(k, v)
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`
    }
    if (opts.account) {
      if (this.accountSeq === undefined) {
        throw new Error(`${opts.path} requires accountSeq`)
      }
      headers['X-Tossinvest-Account'] = String(this.accountSeq)
    }

    const init: RequestInit = { method: opts.method, headers }
    if (opts.method === 'POST') {
      headers['Content-Type'] = 'application/json'
      init.body = JSON.stringify(opts.body ?? {})
    }

    let res = await this.fetchWithTimeout(url.toString(), init)
    this.observe(opts.bucket, res)

    if (res.status === 401) {
      this.invalidateToken()
      const token2 = await this.getToken()
      headers.Authorization = `Bearer ${token2}`
      res = await this.fetchWithTimeout(url.toString(), init)
      this.observe(opts.bucket, res)
    }

    if (res.status === 429) {
      const retryAfter = Number(
        res.headers.get('retry-after') ?? res.headers.get('x-ratelimit-reset') ?? 1
      )
      opts.bucket.penalize(Number.isFinite(retryAfter) ? retryAfter : 1)
      throw new Error(`rate limited (429) ${opts.path}`)
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`${opts.path} HTTP ${res.status}: ${body.slice(0, 300)}`)
    }

    if (res.status === 204) return null
    const json: unknown = await res.json()
    if (json && typeof json === 'object' && 'result' in json) {
      return (json as { result: unknown }).result
    }
    return json
  }

  private observe(bucket: TokenBucket, res: Response): void {
    const limit = Number(res.headers.get('x-ratelimit-limit'))
    const remaining = Number(res.headers.get('x-ratelimit-remaining'))
    bucket.observeHeaders(
      Number.isFinite(limit) ? limit : undefined,
      Number.isFinite(remaining) ? remaining : undefined
    )
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), this.timeoutMs)
    try {
      return await this.fetchImpl(url, { ...init, signal: ac.signal })
    } finally {
      clearTimeout(timer)
    }
  }
}
