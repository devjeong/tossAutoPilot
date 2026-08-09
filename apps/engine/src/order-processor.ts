import type { SupabaseClient } from '@supabase/supabase-js'
import { RiskEngine, TossClient, type RiskDecision } from '@tosspilot/core'
import {
  DEFAULT_RISK_CONFIG,
  type OrderIntent,
  type RiskConfig
} from '@tosspilot/shared'
import type { EngineConfig } from './config.js'
import { loadActiveCredentials } from './credentials.js'
import { sendOrderNotify, writeJournal } from './notify.js'

export type OrderProcessorStatus = {
  lastPollAt: number | null
  lastOkAt: number | null
  lastError: string | null
  processed: number
  intervalMs: number
}

type CommandRow = {
  id: string
  user_id: string
  source: string
  status: string
  intent: OrderIntent
  reserved_order_id: string | null
  client_order_id: string | null
  exchange_order_id: string | null
}

/**
 * order_commands pending → claim → 게이트 → paper/live 전송.
 */
export class OrderProcessor {
  private timer: ReturnType<typeof setTimeout> | undefined
  private stopped = true
  private running = false
  private status: OrderProcessorStatus = {
    lastPollAt: null,
    lastOkAt: null,
    lastError: null,
    processed: 0,
    intervalMs: 2000
  }

  constructor(
    private readonly opts: {
      supabase: SupabaseClient
      config: EngineConfig
      masterKey: string
      baseIntervalMs?: number
    }
  ) {
    this.status.intervalMs = opts.baseIntervalMs ?? 2000
  }

  getStatus(): OrderProcessorStatus {
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
      this.status.lastOkAt = Date.now()
    } catch (e) {
      this.status.lastError = e instanceof Error ? e.message : String(e)
      console.error(JSON.stringify({ msg: 'order-processor error', error: this.status.lastError }))
    } finally {
      this.running = false
      this.status.lastPollAt = Date.now()
      this.schedule(this.status.intervalMs)
    }
  }

  private async pollOnce(): Promise<void> {
    const { supabase, config, masterKey } = this.opts
    let q = supabase
      .from('order_commands')
      .select(
        'id, user_id, source, status, intent, reserved_order_id, client_order_id, exchange_order_id'
      )
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(10)

    if (config.userId) q = q.eq('user_id', config.userId)

    const { data, error } = await q
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as CommandRow[]
    for (const row of rows) {
      await this.processOne(row)
      this.status.processed += 1
    }
  }

  private async processOne(row: CommandRow): Promise<void> {
    const { supabase, config, masterKey } = this.opts
    const now = new Date().toISOString()

    // claim
    const { data: claimed, error: claimErr } = await supabase
      .from('order_commands')
      .update({ status: 'claimed', claimed_at: now })
      .eq('id', row.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()

    if (claimErr) throw new Error(claimErr.message)
    if (!claimed) return // lost race

    const intent = row.intent
    if (row.source === 'cancel' && intent && 'cancelOrderId' in (intent as object)) {
      await this.processCancel(row, (intent as OrderIntent & { cancelOrderId?: string }).cancelOrderId)
      return
    }

    try {
      const creds = await loadActiveCredentials(supabase, row.user_id, masterKey)
      if (!creds) {
        await this.finish(row, {
          status: 'failed',
          error: '활성 API 키 없음'
        })
        return
      }

      const { data: engine } = await supabase
        .from('engine_status')
        .select('mode, active_account_seq')
        .eq('user_id', row.user_id)
        .maybeSingle()

      const mode = (engine?.mode as string) === 'live' ? 'live' : 'paper'
      const accountSeq = engine?.active_account_seq as number | null | undefined
      if (accountSeq == null) {
        await this.finish(row, {
          status: 'failed',
          error: 'active_account_seq 없음 — 설정에서 API 연결 테스트로 계좌를 확보하세요'
        })
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('risk_config')
        .eq('id', row.user_id)
        .maybeSingle()

      const riskConfig = {
        ...DEFAULT_RISK_CONFIG,
        ...((profile?.risk_config as RiskConfig | null) ?? {})
      }

      const client = new TossClient({
        baseUrl: config.tossBaseUrl,
        credentials: creds,
        accountSeq
      })

      const engineRisk = new RiskEngine({
        client,
        config: riskConfig,
        log: (msg, extra) =>
          console.log(JSON.stringify({ msg: `risk:${msg}`, userId: row.user_id, ...extra }))
      })

      const decision = await engineRisk.evaluate(intent)
      await writeJournal(supabase, row.user_id, 'gate', decision.allowed ? '게이트 통과' : '게이트 차단', {
        commandId: row.id,
        results: decision.results,
        blockedBy: decision.blockedBy,
        notes: decision.normalizationNotes
      })

      if (!decision.allowed || !decision.request) {
        await this.finish(row, {
          status: 'blocked',
          error: decision.blockedBy.join(' | ') || '게이트 차단',
          gateSnapshot: decision,
          clientOrderId: null
        })
        if (row.reserved_order_id) {
          await supabase
            .from('reserved_orders')
            .update({
              status: 'error',
              last_error: decision.blockedBy.join(' | '),
              updated_at: now
            })
            .eq('id', row.reserved_order_id)
        }
        return
      }

      if (mode === 'paper') {
        await this.finish(row, {
          status: 'would_submit',
          clientOrderId: decision.request.clientOrderId,
          gateSnapshot: summaryGates(decision),
          error: null
        })
        await writeJournal(supabase, row.user_id, 'order', 'WOULD_SUBMIT (paper)', {
          commandId: row.id,
          request: decision.request
        })
        await sendOrderNotify({
          supabase,
          userId: row.user_id,
          masterKey,
          event: {
            kind: 'accepted',
            orderId: `paper-${decision.request.clientOrderId}`,
            symbol: decision.normalized.symbol,
            market: decision.normalized.market,
            side: decision.normalized.side,
            orderType: decision.normalized.orderType,
            quantity: decision.normalized.quantity,
            price: decision.normalized.price,
            source: row.source === 'reserved' ? 'reserved' : 'manual',
            paper: true
          }
        })
        if (row.reserved_order_id) {
          await supabase
            .from('reserved_orders')
            .update({
              status: 'working',
              last_client_order_id: decision.request.clientOrderId,
              last_command_id: row.id,
              last_error: null,
              updated_at: now
            })
            .eq('id', row.reserved_order_id)
        }
        return
      }

      // live submit
      const result = await client.createOrder(decision.request)
      await this.finish(row, {
        status: 'submitted',
        clientOrderId: decision.request.clientOrderId,
        exchangeOrderId: result.orderId,
        gateSnapshot: summaryGates(decision),
        error: null
      })
      await writeJournal(supabase, row.user_id, 'order', '주문 접수', {
        commandId: row.id,
        orderId: result.orderId,
        request: decision.request
      })
      await sendOrderNotify({
        supabase,
        userId: row.user_id,
        masterKey,
        event: {
          kind: 'accepted',
          orderId: result.orderId,
          symbol: decision.normalized.symbol,
          market: decision.normalized.market,
          side: decision.normalized.side,
          orderType: decision.normalized.orderType,
          quantity: decision.normalized.quantity,
          price: decision.normalized.price,
          source: row.source === 'reserved' ? 'reserved' : 'manual'
        }
      })
      if (row.reserved_order_id) {
        await supabase
          .from('reserved_orders')
          .update({
            status: 'working',
            last_exchange_order_id: result.orderId,
            last_client_order_id: decision.request.clientOrderId,
            last_command_id: row.id,
            last_error: null,
            updated_at: now
          })
          .eq('id', row.reserved_order_id)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await this.finish(row, { status: 'failed', error: msg })
      await writeJournal(
        supabase,
        row.user_id,
        'order',
        `주문 실패: ${msg}`,
        { commandId: row.id },
        'error'
      )
      if (row.reserved_order_id) {
        await supabase
          .from('reserved_orders')
          .update({ status: 'error', last_error: msg, updated_at: now })
          .eq('id', row.reserved_order_id)
      }
    }
  }

  private async processCancel(row: CommandRow, cancelOrderId?: string): Promise<void> {
    const { supabase, config, masterKey } = this.opts
    if (!cancelOrderId) {
      await this.finish(row, { status: 'failed', error: 'cancelOrderId 없음' })
      return
    }
    try {
      const creds = await loadActiveCredentials(supabase, row.user_id, masterKey)
      if (!creds) {
        await this.finish(row, { status: 'failed', error: '활성 API 키 없음' })
        return
      }
      const { data: engine } = await supabase
        .from('engine_status')
        .select('mode, active_account_seq')
        .eq('user_id', row.user_id)
        .maybeSingle()
      const mode = (engine?.mode as string) === 'live' ? 'live' : 'paper'
      const accountSeq = engine?.active_account_seq as number | null | undefined
      if (accountSeq == null) {
        await this.finish(row, { status: 'failed', error: 'accountSeq 없음' })
        return
      }

      if (mode === 'paper') {
        await this.finish(row, {
          status: 'would_submit',
          error: null,
          exchangeOrderId: cancelOrderId
        })
        return
      }

      const client = new TossClient({
        baseUrl: config.tossBaseUrl,
        credentials: creds,
        accountSeq
      })
      const res = await client.cancelOrder(cancelOrderId)
      await this.finish(row, {
        status: 'submitted',
        exchangeOrderId: res.orderId,
        error: null
      })
      await sendOrderNotify({
        supabase,
        userId: row.user_id,
        masterKey,
        event: {
          kind: 'terminal',
          orderId: cancelOrderId,
          symbol: row.intent.symbol,
          market: row.intent.market,
          side: row.intent.side,
          status: 'CANCELED',
          filledQuantity: '0',
          quantity: row.intent.quantity,
          source: 'manual',
          detail: `취소 요청 완료 → ${res.orderId}`
        }
      })
    } catch (e) {
      await this.finish(row, {
        status: 'failed',
        error: e instanceof Error ? e.message : String(e)
      })
    }
  }

  private async finish(
    row: CommandRow,
    patch: {
      status: string
      error?: string | null
      clientOrderId?: string | null
      exchangeOrderId?: string | null
      gateSnapshot?: unknown
    }
  ): Promise<void> {
    await this.opts.supabase
      .from('order_commands')
      .update({
        status: patch.status,
        error: patch.error ?? null,
        client_order_id: patch.clientOrderId ?? row.client_order_id,
        exchange_order_id: patch.exchangeOrderId ?? row.exchange_order_id,
        gate_snapshot: patch.gateSnapshot ?? null,
        finished_at: new Date().toISOString()
      })
      .eq('id', row.id)
  }
}

function summaryGates(d: RiskDecision) {
  return {
    allowed: d.allowed,
    blockedBy: d.blockedBy,
    notes: d.normalizationNotes,
    results: d.results.map((r) => ({
      id: r.id,
      name: r.name,
      verdict: r.verdict,
      detail: r.detail
    })),
    normalized: d.normalized
  }
}
