import type { SupabaseClient } from '@supabase/supabase-js'
import {
  TossClient,
  buildPortfolioSnapshot,
  dec,
  type PortfolioSnapshotDto
} from '@tosspilot/core'
import type { EngineConfig } from './config.js'
import {
  listUsersWithCredentials,
  loadActiveCredentials
} from './credentials.js'

export type PortfolioPollStatus = {
  lastPollAt: number | null
  lastOkAt: number | null
  lastError: string | null
  pollCount: number
  intervalMs: number
  lastUserCount: number
}

/**
 * holdings + buying-power + exchange-rate → portfolio_snapshots
 */
export class PortfolioPoller {
  private timer: ReturnType<typeof setTimeout> | undefined
  private stopped = true
  private running = false
  private clients = new Map<string, TossClient>()
  private status: PortfolioPollStatus = {
    lastPollAt: null,
    lastOkAt: null,
    lastError: null,
    pollCount: 0,
    intervalMs: 8000,
    lastUserCount: 0
  }
  private lastFxAt = 0
  private fxCache = new Map<string, Awaited<ReturnType<TossClient['exchangeRate']>>>()

  constructor(
    private readonly opts: {
      supabase: SupabaseClient
      config: EngineConfig
      masterKey: string
      baseIntervalMs?: number
      slowFxMs?: number
    }
  ) {
    this.status.intervalMs = opts.baseIntervalMs ?? 8000
  }

  getStatus(): PortfolioPollStatus {
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
    try {
      await this.pollOnce()
      this.status.lastError = null
    } catch (e) {
      this.status.lastError = e instanceof Error ? e.message : String(e)
      console.error(JSON.stringify({ msg: 'portfolio poll failed', error: this.status.lastError }))
      this.status.intervalMs = Math.min(60_000, this.status.intervalMs * 2)
    } finally {
      this.running = false
      this.schedule(this.status.intervalMs)
    }
  }

  private async pollOnce(): Promise<void> {
    const { supabase, config, masterKey } = this.opts
    this.status.lastPollAt = Date.now()
    this.status.pollCount += 1

    const userIds = config.userId
      ? [config.userId]
      : await listUsersWithCredentials(supabase)
    this.status.lastUserCount = userIds.length

    for (const userId of userIds) {
      await this.pollUser(userId, masterKey)
    }

    this.status.lastOkAt = Date.now()
    this.status.intervalMs = this.opts.baseIntervalMs ?? 8000

    if (this.status.pollCount <= 3 || this.status.pollCount % 15 === 0) {
      console.log(
        JSON.stringify({
          msg: 'portfolio poll ok',
          users: userIds.length,
          n: this.status.pollCount
        })
      )
    }
  }

  private async pollUser(userId: string, masterKey: string): Promise<void> {
    const client = await this.getClient(userId, masterKey)
    if (!client) {
      await this.upsert(userId, null, 'no active credentials')
      return
    }

    // accountSeq from engine_status
    const { data: eng } = await this.opts.supabase
      .from('engine_status')
      .select('active_account_seq')
      .eq('user_id', userId)
      .maybeSingle()

    const seq = eng?.active_account_seq as number | null | undefined
    if (seq == null) {
      await this.upsert(
        userId,
        null,
        'accountSeq 없음 — 설정에서 실 API 연결 테스트를 먼저 실행하세요'
      )
      return
    }
    client.setAccountSeq(seq)

    const errors: string[] = []
    const [holdings, bpKrw, bpUsd] = await Promise.all([
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
      })
    ])

    const slowMs = this.opts.slowFxMs ?? 60_000
    let fx = this.fxCache.get(userId) ?? null
    if (Date.now() - this.lastFxAt >= slowMs || !fx) {
      try {
        fx = await client.exchangeRate()
        this.fxCache.set(userId, fx)
        this.lastFxAt = Date.now()
      } catch (e) {
        errors.push(`환율: ${msg(e)}`)
        fx = this.fxCache.get(userId) ?? null
      }
    }

    const snap = buildPortfolioSnapshot({
      holdings,
      fx,
      cashKrw: dec(bpKrw?.cashBuyingPower ?? '0'),
      cashUsd: dec(bpUsd?.cashBuyingPower ?? '0'),
      partialErrors: errors
    })

    await this.upsert(userId, snap, errors.length ? errors.join('; ') : null)
  }

  private async getClient(userId: string, masterKey: string): Promise<TossClient | null> {
    let client = this.clients.get(userId)
    if (client) return client
    const creds = await loadActiveCredentials(this.opts.supabase, userId, masterKey)
    if (!creds) return null
    client = new TossClient({
      credentials: creds,
      baseUrl: this.opts.config.tossBaseUrl
    })
    this.clients.set(userId, client)
    return client
  }

  private async upsert(
    userId: string,
    snapshot: PortfolioSnapshotDto | null,
    lastError: string | null
  ): Promise<void> {
    const now = new Date().toISOString()
    const { error } = await this.opts.supabase.from('portfolio_snapshots').upsert(
      {
        user_id: userId,
        snapshot: snapshot ?? {},
        last_error: lastError,
        polled_at: now,
        updated_at: now
      },
      { onConflict: 'user_id' }
    )
    if (error) throw new Error(error.message)
  }
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
