import type { SupabaseClient } from '@supabase/supabase-js'
import { TossClient, type TossPrice } from '@tosspilot/core'
import type { EngineConfig } from './config.js'
import {
  listUsersWithCredentials,
  loadActiveCredentials
} from './credentials.js'

export type QuotesPollStatus = {
  lastPollAt: number | null
  lastOkAt: number | null
  lastError: string | null
  lastSymbolCount: number
  lastUserCount: number
  pollCount: number
  intervalMs: number
}

/**
 * 유저별 watchlist 심볼 → /prices 폴링 → quote_snapshots upsert.
 */
export class QuotesPoller {
  private timer: ReturnType<typeof setTimeout> | undefined
  private stopped = true
  private running = false
  private clients = new Map<string, TossClient>()
  private status: QuotesPollStatus = {
    lastPollAt: null,
    lastOkAt: null,
    lastError: null,
    lastSymbolCount: 0,
    lastUserCount: 0,
    pollCount: 0,
    intervalMs: 5000
  }

  constructor(
    private readonly opts: {
      supabase: SupabaseClient
      config: EngineConfig
      masterKey: string
      baseIntervalMs?: number
    }
  ) {
    this.status.intervalMs = opts.baseIntervalMs ?? 5000
  }

  getStatus(): QuotesPollStatus {
    return { ...this.status }
  }

  start(): void {
    if (!this.stopped) return
    this.stopped = false
    void this.loop()
  }

  stop(): void {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
  }

  private schedule(ms: number): void {
    if (this.stopped) return
    this.timer = setTimeout(() => void this.loop(), ms)
  }

  private async loop(): Promise<void> {
    if (this.stopped || this.running) return
    this.running = true
    let nextInterval = this.status.intervalMs

    try {
      await this.pollOnce()
      // headroom 기반 적응 (첫 유저 클라이언트 기준)
      const first = this.clients.values().next().value as TossClient | undefined
      if (first) {
        const h = first.marketHeadroom()
        if (h < 0.2) nextInterval = Math.min(30_000, Math.round(this.status.intervalMs * 1.5))
        else if (h > 0.6) nextInterval = Math.max(3000, Math.round(this.status.intervalMs * 0.9))
        else nextInterval = this.opts.baseIntervalMs ?? 5000
        this.status.intervalMs = nextInterval
      }
      this.status.lastError = null
    } catch (e) {
      this.status.lastError = e instanceof Error ? e.message : String(e)
      console.error(JSON.stringify({ msg: 'quotes poll failed', error: this.status.lastError }))
      nextInterval = Math.min(60_000, this.status.intervalMs * 2)
      this.status.intervalMs = nextInterval
    } finally {
      this.running = false
      this.schedule(nextInterval)
    }
  }

  private async pollOnce(): Promise<void> {
    const { supabase, config, masterKey } = this.opts
    this.status.lastPollAt = Date.now()
    this.status.pollCount += 1

    let userIds: string[]
    if (config.userId) {
      userIds = [config.userId]
    } else {
      userIds = await listUsersWithCredentials(supabase)
    }

    this.status.lastUserCount = userIds.length
    let totalSymbols = 0

    for (const userId of userIds) {
      const symbols = await this.loadSymbols(userId)
      totalSymbols += symbols.length
      if (symbols.length === 0) {
        await this.upsertSnapshot(userId, [], null, this.status.intervalMs)
        continue
      }

      const client = await this.getClient(userId)
      if (!client) {
        await this.upsertSnapshot(
          userId,
          [],
          'no active credentials',
          this.status.intervalMs
        )
        continue
      }

      try {
        const prices = await client.prices(symbols)
        await this.upsertSnapshot(userId, prices, null, this.status.intervalMs)
        // last_quote_at on engine_status
        await supabase
          .from('engine_status')
          .update({
            last_quote_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        await this.upsertSnapshot(userId, [], msg, this.status.intervalMs)
        throw e
      }
    }

    this.status.lastSymbolCount = totalSymbols
    this.status.lastOkAt = Date.now()

    if (this.status.pollCount <= 3 || this.status.pollCount % 20 === 0) {
      console.log(
        JSON.stringify({
          msg: 'quotes poll ok',
          users: userIds.length,
          symbols: totalSymbols,
          intervalMs: this.status.intervalMs,
          n: this.status.pollCount
        })
      )
    }
  }

  private async loadSymbols(userId: string): Promise<string[]> {
    const { data, error } = await this.opts.supabase
      .from('watchlist_items')
      .select('symbol')
      .eq('user_id', userId)

    if (error) throw new Error(error.message)
    return [...new Set((data ?? []).map((r) => String(r.symbol).trim()).filter(Boolean))]
  }

  private async getClient(userId: string): Promise<TossClient | null> {
    let client = this.clients.get(userId)
    if (client) return client

    const creds = await loadActiveCredentials(
      this.opts.supabase,
      userId,
      this.opts.masterKey
    )
    if (!creds) return null

    // accountSeq 는 prices 에 불필요
    client = new TossClient({
      credentials: creds,
      baseUrl: this.opts.config.tossBaseUrl
    })
    this.clients.set(userId, client)
    return client
  }

  /** 자격증명 변경 시 캐시 무효화 (portfolio 와 공유 안 함) */
  clearClientCache(): void {
    this.clients.clear()
  }

  /** 자격증명 변경 시 캐시 무효화 */
  invalidateUser(userId: string): void {
    this.clients.delete(userId)
  }

  private async upsertSnapshot(
    userId: string,
    prices: TossPrice[],
    lastError: string | null,
    pollIntervalMs: number
  ): Promise<void> {
    const now = new Date().toISOString()
    const quotes = prices.map((p) => ({
      symbol: p.symbol,
      lastPrice: p.lastPrice,
      currency: p.currency,
      quoteTs: p.timestamp ?? null
    }))

    const { error } = await this.opts.supabase.from('quote_snapshots').upsert(
      {
        user_id: userId,
        quotes,
        symbol_count: quotes.length,
        poll_interval_ms: pollIntervalMs,
        last_error: lastError,
        polled_at: now,
        updated_at: now
      },
      { onConflict: 'user_id' }
    )
    if (error) throw new Error(error.message)
  }
}
