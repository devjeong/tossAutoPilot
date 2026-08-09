import type { SupabaseClient } from '@supabase/supabase-js'
import { TossClient } from '@tosspilot/core'
import type { EngineConfig } from './config.js'
import { listUsersWithCredentials } from './credentials.js'
import { fetchLivePortfolio } from './portfolio-fetch.js'

export type PortfolioPollStatus = {
  lastPollAt: number | null
  lastOkAt: number | null
  lastError: string | null
  pollCount: number
  intervalMs: number
  lastUserCount: number
}

/**
 * holdings + buying-power + exchange-rate → portfolio_snapshots (백그라운드)
 * 즉시 조회는 POST /internal/toss/portfolio
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

  constructor(
    private readonly opts: {
      supabase: SupabaseClient
      config: EngineConfig
      masterKey: string
      baseIntervalMs?: number
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
      await fetchLivePortfolio({
        supabase,
        config,
        masterKey,
        userId,
        persist: true,
        clientCache: this.clients
      })
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
}
