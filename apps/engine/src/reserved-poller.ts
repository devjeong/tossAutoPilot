import type { SupabaseClient } from '@supabase/supabase-js'
import { TossClient, evaluateMarketOpen, sessionDateKeyKst } from '@tosspilot/core'
import type { OrderIntent } from '@tosspilot/shared'
import type { EngineConfig } from './config.js'
import { loadActiveCredentials, listUsersWithCredentials } from './credentials.js'
import { sendOrderNotify, writeJournal } from './notify.js'

export type ReservedPollStatus = {
  lastPollAt: number | null
  lastOkAt: number | null
  lastError: string | null
  enqueued: number
  requeued: number
  intervalMs: number
}

type ReservedRow = {
  id: string
  user_id: string
  status: string
  intent: OrderIntent
  auto_requeue: boolean
  requeue_count: number
  last_submit_session_date: string | null
  last_exchange_order_id: string | null
  last_client_order_id: string | null
  last_command_id: string | null
  filled_quantity: string | null
}

/**
 * 1) armed 예약 → 장중 order_commands enqueue
 * 2) working + 거래소 미체결 종료 → 다음 영업일 armed 재예약
 */
export class ReservedPoller {
  private timer: ReturnType<typeof setTimeout> | undefined
  private stopped = true
  private running = false
  private status: ReservedPollStatus = {
    lastPollAt: null,
    lastOkAt: null,
    lastError: null,
    enqueued: 0,
    requeued: 0,
    intervalMs: 15_000
  }

  constructor(
    private readonly opts: {
      supabase: SupabaseClient
      config: EngineConfig
      masterKey: string
      baseIntervalMs?: number
    }
  ) {
    this.status.intervalMs = opts.baseIntervalMs ?? 15_000
  }

  getStatus(): ReservedPollStatus {
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
      console.error(JSON.stringify({ msg: 'reserved-poller error', error: this.status.lastError }))
    } finally {
      this.running = false
      this.status.lastPollAt = Date.now()
      this.schedule(this.status.intervalMs)
    }
  }

  private async pollOnce(): Promise<void> {
    const users = this.opts.config.userId
      ? [this.opts.config.userId]
      : await listUsersWithCredentials(this.opts.supabase)

    for (const userId of users) {
      await this.enqueueArmed(userId)
      await this.reconcileWorking(userId)
    }
  }

  private async enqueueArmed(userId: string): Promise<void> {
    const { supabase, config, masterKey } = this.opts
    const sessionDate = sessionDateKeyKst()

    const { data: rows, error } = await supabase
      .from('reserved_orders')
      .select(
        'id, user_id, status, intent, auto_requeue, requeue_count, last_submit_session_date, last_exchange_order_id, last_client_order_id, last_command_id, filled_quantity'
      )
      .eq('user_id', userId)
      .eq('status', 'armed')
      .limit(50)

    if (error) throw new Error(error.message)
    if (!rows?.length) return

    const creds = await loadActiveCredentials(supabase, userId, masterKey)
    if (!creds) return

    const { data: engine } = await supabase
      .from('engine_status')
      .select('active_account_seq')
      .eq('user_id', userId)
      .maybeSingle()
    const accountSeq = engine?.active_account_seq as number | null | undefined
    if (accountSeq == null) return

    const client = new TossClient({
      baseUrl: config.tossBaseUrl,
      credentials: creds,
      accountSeq
    })

    const openCache = new Map<'KR' | 'US', boolean>()

    for (const raw of rows as ReservedRow[]) {
      const intent = raw.intent
      if (raw.last_submit_session_date === sessionDate) continue

      let isOpen = openCache.get(intent.market)
      if (isOpen === undefined) {
        try {
          const cal = await client.marketCalendar(intent.market)
          isOpen = evaluateMarketOpen(cal, Date.now()).open
        } catch {
          isOpen = false
        }
        openCache.set(intent.market, isOpen)
      }
      if (!isOpen) continue

      // enqueue command
      const { data: cmd, error: insErr } = await supabase
        .from('order_commands')
        .insert({
          user_id: userId,
          source: 'reserved',
          status: 'pending',
          intent,
          reserved_order_id: raw.id
        })
        .select('id')
        .single()

      if (insErr) {
        console.error(JSON.stringify({ msg: 'reserved enqueue failed', error: insErr.message }))
        continue
      }

      await supabase
        .from('reserved_orders')
        .update({
          status: 'working',
          last_submit_session_date: sessionDate,
          last_command_id: cmd.id,
          last_error: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', raw.id)

      this.status.enqueued += 1
      await writeJournal(supabase, userId, 'reserve', '예약 → 주문 큐 등록', {
        reservedId: raw.id,
        commandId: cmd.id,
        sessionDate
      })
      await sendOrderNotify({
        supabase,
        userId,
        masterKey,
        event: {
          kind: 'reserve',
          action: 'working',
          symbol: intent.symbol,
          market: intent.market,
          side: intent.side,
          orderType: intent.orderType,
          quantity: intent.quantity,
          price: intent.price,
          detail: `세션 ${sessionDate}`
        }
      })
    }
  }

  private async reconcileWorking(userId: string): Promise<void> {
    const { supabase, config, masterKey } = this.opts

    const { data: rows, error } = await supabase
      .from('reserved_orders')
      .select(
        'id, user_id, status, intent, auto_requeue, requeue_count, last_submit_session_date, last_exchange_order_id, last_client_order_id, last_command_id, filled_quantity'
      )
      .eq('user_id', userId)
      .eq('status', 'working')
      .limit(50)

    if (error) throw new Error(error.message)
    if (!rows?.length) return

    const creds = await loadActiveCredentials(supabase, userId, masterKey)
    if (!creds) return

    const { data: engine } = await supabase
      .from('engine_status')
      .select('mode, active_account_seq')
      .eq('user_id', userId)
      .maybeSingle()
    const mode = (engine?.mode as string) === 'live' ? 'live' : 'paper'
    const accountSeq = engine?.active_account_seq as number | null | undefined
    if (accountSeq == null) return

    // paper: working reserved with would_submit — requeue next day if still not filled
    if (mode === 'paper') {
      for (const raw of rows as ReservedRow[]) {
        await this.maybeRequeueAfterSession(raw, userId, null)
      }
      return
    }

    const client = new TossClient({
      baseUrl: config.tossBaseUrl,
      credentials: creds,
      accountSeq
    })

    let openOrders: Awaited<ReturnType<TossClient['orders']>>['orders'] = []
    try {
      const page = await client.orders({ status: 'OPEN', limit: 100 })
      openOrders = page.orders
    } catch (e) {
      console.error(
        JSON.stringify({
          msg: 'reserved open orders fetch failed',
          error: e instanceof Error ? e.message : String(e)
        })
      )
      return
    }

    for (const raw of rows as ReservedRow[]) {
      const exId = raw.last_exchange_order_id
      if (!exId) {
        // command may still be pending/claimed
        const { data: cmd } = await supabase
          .from('order_commands')
          .select('status, exchange_order_id, error')
          .eq('id', raw.last_command_id as string)
          .maybeSingle()
        if (cmd?.exchange_order_id) {
          await supabase
            .from('reserved_orders')
            .update({
              last_exchange_order_id: cmd.exchange_order_id as string,
              updated_at: new Date().toISOString()
            })
            .eq('id', raw.id)
          continue
        }
        if (cmd?.status === 'blocked' || cmd?.status === 'failed') {
          if (raw.auto_requeue) {
            await this.rearm(raw, userId, String(cmd.error ?? cmd.status))
          } else {
            await supabase
              .from('reserved_orders')
              .update({
                status: 'error',
                last_error: String(cmd.error ?? cmd.status),
                updated_at: new Date().toISOString()
              })
              .eq('id', raw.id)
          }
        }
        continue
      }

      const stillOpen = openOrders.find((o) => o.orderId === exId)
      if (stillOpen) {
        const filled = stillOpen.execution?.filledQuantity ?? '0'
        await supabase
          .from('reserved_orders')
          .update({ filled_quantity: filled, updated_at: new Date().toISOString() })
          .eq('id', raw.id)
        continue
      }

      // not in OPEN — check detail
      try {
        const o = await client.order(exId)
        const filled = o.execution?.filledQuantity ?? '0'
        const qty = Number(o.quantity)
        const filledN = Number(filled)
        const terminalFilled =
          o.status === 'FILLED' ||
          o.status === 'COMPLETED' ||
          (qty > 0 && filledN >= qty)

        if (terminalFilled) {
          await supabase
            .from('reserved_orders')
            .update({
              status: 'filled',
              filled_quantity: filled,
              updated_at: new Date().toISOString()
            })
            .eq('id', raw.id)
          continue
        }

        // canceled / expired / rejected without full fill
        if (raw.auto_requeue) {
          await this.rearm(raw, userId, `거래소 종료 ${o.status} (체결 ${filled}/${o.quantity})`)
        } else {
          await supabase
            .from('reserved_orders')
            .update({
              status: 'cancelled',
              filled_quantity: filled,
              last_error: o.status,
              updated_at: new Date().toISOString()
            })
            .eq('id', raw.id)
        }
      } catch {
        // if order lookup fails after session, requeue conservatively when market closed
        await this.maybeRequeueAfterSession(raw, userId, client)
      }
    }
  }

  private async maybeRequeueAfterSession(
    raw: ReservedRow,
    userId: string,
    client: TossClient | null
  ): Promise<void> {
    if (!raw.auto_requeue) return
    const sessionDate = sessionDateKeyKst()
    if (raw.last_submit_session_date === sessionDate) {
      // same day — wait until next calendar day for paper requeue
      // if market closed, still wait for date change
      return
    }
    // previous session date → re-arm
    if (
      raw.last_submit_session_date &&
      raw.last_submit_session_date < sessionDate
    ) {
      // ensure market not open for accidental double? re-arm is fine; enqueue checks open
      if (client) {
        try {
          const cal = await client.marketCalendar(raw.intent.market)
          const open = evaluateMarketOpen(cal, Date.now()).open
          // if still open same day after date key change (timezone edge) skip
          if (open && raw.last_submit_session_date === sessionDate) return
        } catch {
          /* ignore */
        }
      }
      await this.rearm(raw, userId, '세션 종료 후 자동 재예약')
    }
  }

  private async rearm(raw: ReservedRow, userId: string, detail: string): Promise<void> {
    const { supabase, masterKey } = this.opts
    const nextCount = (raw.requeue_count ?? 0) + 1
    await supabase
      .from('reserved_orders')
      .update({
        status: 'armed',
        requeue_count: nextCount,
        last_exchange_order_id: null,
        last_client_order_id: null,
        last_command_id: null,
        last_error: detail,
        // clear session so next open day can submit
        last_submit_session_date: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', raw.id)

    this.status.requeued += 1
    await writeJournal(supabase, userId, 'reserve', '예약 재등록', {
      reservedId: raw.id,
      requeueCount: nextCount,
      detail
    })
    await sendOrderNotify({
      supabase,
      userId,
      masterKey,
      event: {
        kind: 'reserve',
        action: 'requeued',
        symbol: raw.intent.symbol,
        market: raw.intent.market,
        side: raw.intent.side,
        orderType: raw.intent.orderType,
        quantity: raw.intent.quantity,
        price: raw.intent.price,
        requeueCount: nextCount,
        detail
      }
    })
  }
}
