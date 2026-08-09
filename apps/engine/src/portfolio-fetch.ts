/**
 * 토스 포트폴리오 즉시 조회 (허용 IP 엔진 전용).
 * 폴러·HTTP 라이브 엔드포인트 공용.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  TossClient,
  buildPortfolioSnapshot,
  dec,
  type PortfolioSnapshotDto
} from '@tosspilot/core'
import type { EngineConfig } from './config.js'
import { loadActiveCredentials } from './credentials.js'

export type LivePortfolioResult = {
  ok: boolean
  snapshot: PortfolioSnapshotDto | null
  lastError: string | null
  polledAt: string
  via: 'engine-live'
}

export async function fetchLivePortfolio(opts: {
  supabase: SupabaseClient
  config: EngineConfig
  masterKey: string
  userId: string
  /** true 면 portfolio_snapshots 에도 반영 */
  persist?: boolean
  clientCache?: Map<string, TossClient>
}): Promise<LivePortfolioResult> {
  const polledAt = new Date().toISOString()
  const errors: string[] = []

  if (!opts.masterKey) {
    return {
      ok: false,
      snapshot: null,
      lastError: 'CREDENTIALS_MASTER_KEY missing on engine',
      polledAt,
      via: 'engine-live'
    }
  }

  const creds = await loadActiveCredentials(opts.supabase, opts.userId, opts.masterKey)
  if (!creds) {
    const r: LivePortfolioResult = {
      ok: false,
      snapshot: null,
      lastError: 'no active credentials',
      polledAt,
      via: 'engine-live'
    }
    if (opts.persist) await persistSnapshot(opts.supabase, opts.userId, null, r.lastError, polledAt)
    return r
  }

  let client = opts.clientCache?.get(opts.userId)
  if (!client) {
    client = new TossClient({
      credentials: creds,
      baseUrl: opts.config.tossBaseUrl
    })
    opts.clientCache?.set(opts.userId, client)
  }

  const { data: eng } = await opts.supabase
    .from('engine_status')
    .select('active_account_seq')
    .eq('user_id', opts.userId)
    .maybeSingle()

  const seq = eng?.active_account_seq as number | null | undefined
  if (seq == null) {
    const err = 'accountSeq 없음 — 설정에서 실 API 연결 테스트를 먼저 실행하세요'
    if (opts.persist) await persistSnapshot(opts.supabase, opts.userId, null, err, polledAt)
    return { ok: false, snapshot: null, lastError: err, polledAt, via: 'engine-live' }
  }
  client.setAccountSeq(seq)

  const [holdings, bpKrw, bpUsd, fx] = await Promise.all([
    client.holdings().catch((e: unknown) => {
      errors.push(`보유: ${msg(e)}`)
      return null
    }),
    client.buyingPower('KRW').catch((e: unknown) => {
      errors.push(`원화 예수금: ${msg(e)}`)
      return null
    }),
    client.buyingPower('USD').catch((e: unknown) => {
      errors.push(`달러 예수금: ${msg(e)}`)
      return null
    }),
    client.exchangeRate().catch((e: unknown) => {
      errors.push(`환율: ${msg(e)}`)
      return null
    })
  ])

  if (!holdings && !bpKrw && !bpUsd) {
    const err = errors.join('; ') || '포트폴리오 조회 실패'
    if (opts.persist) await persistSnapshot(opts.supabase, opts.userId, null, err, polledAt)
    return { ok: false, snapshot: null, lastError: err, polledAt, via: 'engine-live' }
  }

  const snap = buildPortfolioSnapshot({
    holdings,
    fx,
    cashKrw: dec(bpKrw?.cashBuyingPower ?? '0'),
    cashUsd: dec(bpUsd?.cashBuyingPower ?? '0'),
    partialErrors: errors
  })

  const lastError = errors.length ? errors.join('; ') : null
  if (opts.persist) {
    await persistSnapshot(opts.supabase, opts.userId, snap, lastError, polledAt)
  }

  return {
    ok: true,
    snapshot: snap,
    lastError,
    polledAt,
    via: 'engine-live'
  }
}

export async function fetchLiveQuotes(opts: {
  supabase: SupabaseClient
  config: EngineConfig
  masterKey: string
  userId: string
  persist?: boolean
  clientCache?: Map<string, TossClient>
}): Promise<{
  ok: boolean
  snapshot: {
    quotes: { symbol: string; lastPrice: string; currency: string; quoteTs?: string | null }[]
    symbol_count: number
    poll_interval_ms: number | null
    last_error: string | null
    polled_at: string
  } | null
  error?: string
  via: 'engine-live'
}> {
  const polledAt = new Date().toISOString()
  if (!opts.masterKey) {
    return { ok: false, snapshot: null, error: 'CREDENTIALS_MASTER_KEY missing', via: 'engine-live' }
  }

  const { data: items } = await opts.supabase
    .from('watchlist_items')
    .select('symbol')
    .eq('user_id', opts.userId)
    .order('created_at', { ascending: true })

  const symbols = (items ?? []).map((r) => String(r.symbol).trim()).filter(Boolean)
  if (!symbols.length) {
    return {
      ok: true,
      snapshot: {
        quotes: [],
        symbol_count: 0,
        poll_interval_ms: null,
        last_error: null,
        polled_at: polledAt
      },
      via: 'engine-live'
    }
  }

  const creds = await loadActiveCredentials(opts.supabase, opts.userId, opts.masterKey)
  if (!creds) {
    return { ok: false, snapshot: null, error: 'no active credentials', via: 'engine-live' }
  }

  let client = opts.clientCache?.get(opts.userId)
  if (!client) {
    client = new TossClient({
      credentials: creds,
      baseUrl: opts.config.tossBaseUrl
    })
    opts.clientCache?.set(opts.userId, client)
  }

  try {
    const prices = await client.prices(symbols)
    const quotes = prices.map((p) => ({
      symbol: p.symbol,
      lastPrice: p.lastPrice,
      currency: p.currency,
      quoteTs: p.timestamp ?? null
    }))
    const snap = {
      quotes,
      symbol_count: quotes.length,
      poll_interval_ms: null as number | null,
      last_error: null as string | null,
      polled_at: polledAt
    }

    if (opts.persist) {
      await opts.supabase.from('quote_snapshots').upsert(
        {
          user_id: opts.userId,
          quotes,
          symbol_count: quotes.length,
          poll_interval_ms: null,
          last_error: null,
          polled_at: polledAt,
          updated_at: polledAt
        },
        { onConflict: 'user_id' }
      )
    }

    return { ok: true, snapshot: snap, via: 'engine-live' }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    return { ok: false, snapshot: null, error, via: 'engine-live' }
  }
}

async function persistSnapshot(
  supabase: SupabaseClient,
  userId: string,
  snapshot: PortfolioSnapshotDto | null,
  lastError: string | null,
  polledAt: string
): Promise<void> {
  await supabase.from('portfolio_snapshots').upsert(
    {
      user_id: userId,
      snapshot: snapshot ?? {},
      last_error: lastError,
      polled_at: polledAt,
      updated_at: polledAt
    },
    { onConflict: 'user_id' }
  )
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
