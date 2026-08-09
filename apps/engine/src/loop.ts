import type { EngineRunState } from '@tosspilot/shared'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { EngineConfig } from './config.js'
import { markStopped, pulseHeartbeat, type HeartbeatResult } from './heartbeat.js'
import { QuotesPoller, type QuotesPollStatus } from './quotes-poller.js'
import { PortfolioPoller, type PortfolioPollStatus } from './portfolio-poller.js'

export interface EngineLoopOptions {
  tickMs: number
  heartbeatMs: number
  config: EngineConfig
  supabase: SupabaseClient | null
  masterKey: string
  quotesIntervalMs: number
  portfolioIntervalMs: number
}

export interface EngineLoopStatus {
  state: EngineRunState
  startedAt: number | null
  lastTickAt: number | null
  lastHeartbeatAt: number | null
  lastHeartbeatDb: HeartbeatResult | null
  tickCount: number
  heartbeatCount: number
  dbEnabled: boolean
  quotes: QuotesPollStatus | null
  portfolio: PortfolioPollStatus | null
  note: string
}

/**
 * 상주 엔진 루프: heartbeat + 시세 폴링.
 */
export class EngineLoop {
  private state: EngineRunState = 'stopped'
  private tickTimer: ReturnType<typeof setInterval> | undefined
  private hbTimer: ReturnType<typeof setInterval> | undefined
  private startedAt: number | null = null
  private lastTickAt: number | null = null
  private lastHeartbeatAt: number | null = null
  private lastHeartbeatDb: HeartbeatResult | null = null
  private tickCount = 0
  private heartbeatCount = 0
  private pulsing = false
  private quotes: QuotesPoller | null = null
  private portfolio: PortfolioPoller | null = null

  constructor(private readonly opts: EngineLoopOptions) {}

  status(): EngineLoopStatus {
    return {
      state: this.state,
      startedAt: this.startedAt,
      lastTickAt: this.lastTickAt,
      lastHeartbeatAt: this.lastHeartbeatAt,
      lastHeartbeatDb: this.lastHeartbeatDb,
      tickCount: this.tickCount,
      heartbeatCount: this.heartbeatCount,
      dbEnabled: Boolean(this.opts.supabase),
      quotes: this.quotes?.getStatus() ?? null,
      portfolio: this.portfolio?.getStatus() ?? null,
      note: this.opts.supabase
        ? 'heartbeat + quotes + portfolio → Supabase'
        : 'DB 미연결 — SUPABASE_URL + SERVICE_ROLE|SECRET 필요'
    }
  }

  start(): void {
    if (this.state === 'running' || this.state === 'starting') return
    this.state = 'starting'
    this.startedAt = Date.now()
    this.state = 'running'

    this.tickTimer = setInterval(() => {
      this.tickCount += 1
      this.lastTickAt = Date.now()
    }, this.opts.tickMs)

    this.hbTimer = setInterval(() => {
      void this.heartbeat()
    }, this.opts.heartbeatMs)

    void this.heartbeat()

    if (this.opts.supabase && this.opts.masterKey) {
      this.quotes = new QuotesPoller({
        supabase: this.opts.supabase,
        config: this.opts.config,
        masterKey: this.opts.masterKey,
        baseIntervalMs: this.opts.quotesIntervalMs
      })
      this.quotes.start()

      this.portfolio = new PortfolioPoller({
        supabase: this.opts.supabase,
        config: this.opts.config,
        masterKey: this.opts.masterKey,
        baseIntervalMs: this.opts.portfolioIntervalMs
      })
      this.portfolio.start()
    } else {
      console.warn(
        JSON.stringify({
          msg: 'quotes/portfolio poller not started',
          hasDb: Boolean(this.opts.supabase),
          hasMasterKey: Boolean(this.opts.masterKey)
        })
      )
    }
  }

  async stop(): Promise<void> {
    if (this.tickTimer) clearInterval(this.tickTimer)
    if (this.hbTimer) clearInterval(this.hbTimer)
    this.tickTimer = undefined
    this.hbTimer = undefined
    this.quotes?.stop()
    this.quotes = null
    this.portfolio?.stop()
    this.portfolio = null

    if (this.opts.supabase) {
      try {
        this.lastHeartbeatDb = await markStopped(this.opts.supabase, this.opts.config)
      } catch (e) {
        this.lastHeartbeatDb = {
          ok: false,
          updated: 0,
          error: e instanceof Error ? e.message : String(e),
          at: new Date().toISOString()
        }
      }
    }
    this.state = 'stopped'
  }

  private async heartbeat(): Promise<void> {
    if (this.pulsing) return
    this.pulsing = true
    this.lastHeartbeatAt = Date.now()
    this.heartbeatCount += 1

    try {
      if (!this.opts.supabase) {
        this.lastHeartbeatDb = {
          ok: false,
          updated: 0,
          error: 'supabase client not configured',
          at: new Date().toISOString()
        }
        if (this.state === 'running') this.state = 'degraded'
        return
      }

      const result = await pulseHeartbeat(this.opts.supabase, this.opts.config, {
        state: 'running',
        lastError: null
      })
      this.lastHeartbeatDb = result

      if (!result.ok) {
        this.state = 'degraded'
        console.error(
          JSON.stringify({
            msg: 'heartbeat failed',
            error: result.error,
            at: result.at
          })
        )
      } else if (this.state === 'degraded') {
        this.state = 'running'
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      this.state = 'degraded'
      this.lastHeartbeatDb = {
        ok: false,
        updated: 0,
        error,
        at: new Date().toISOString()
      }
      console.error(JSON.stringify({ msg: 'heartbeat exception', error }))
    } finally {
      this.pulsing = false
    }
  }
}
