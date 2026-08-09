import type { SupabaseClient } from '@supabase/supabase-js'
import { TossClient } from '@tosspilot/core'
import type { OrderIntent } from '@tosspilot/shared'
import type { EngineConfig } from './config.js'
import { listUsersWithCredentials, loadActiveCredentials } from './credentials.js'
import { sendOrderNotify, writeJournal } from './notify.js'

export type FillWatcherStatus = {
  lastPollAt: number | null
  lastOkAt: number | null
  lastError: string | null
  notifies: number
  intervalMs: number
}

/**
 * 미체결/최근 주문 폴링 → 체결 수량 증가 시 텔레그램 알림.
 * fill_track_json on notification_settings: { [orderId]: filledQty }
 */
export class FillWatcher {
  private timer: ReturnType<typeof setTimeout> | undefined
  private stopped = true
  private running = false
  private status: FillWatcherStatus = {
    lastPollAt: null,
    lastOkAt: null,
    lastError: null,
    notifies: 0,
    intervalMs: 12_000
  }

  constructor(
    private readonly opts: {
      supabase: SupabaseClient
      config: EngineConfig
      masterKey: string
      baseIntervalMs?: number
    }
  ) {
    this.status.intervalMs = opts.baseIntervalMs ?? 12_000
  }

  getStatus(): FillWatcherStatus {
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
      await this.watchUser(userId)
    }
  }

  private async watchUser(userId: string): Promise<void> {
    const { supabase, config, masterKey } = this.opts
    const { data: engine } = await supabase
      .from('engine_status')
      .select('mode, active_account_seq')
      .eq('user_id', userId)
      .maybeSingle()

    if ((engine?.mode as string) !== 'live') return
    const accountSeq = engine?.active_account_seq as number | null | undefined
    if (accountSeq == null) return

    const creds = await loadActiveCredentials(supabase, userId, masterKey)
    if (!creds) return

    const { data: notif } = await supabase
      .from('notification_settings')
      .select('telegram_enabled, fill_track_json, notify_on_fill')
      .eq('user_id', userId)
      .maybeSingle()

    if (!notif?.telegram_enabled || notif.notify_on_fill === false) return

    let track: Record<string, string> = {}
    try {
      track = notif.fill_track_json ? (JSON.parse(notif.fill_track_json) as Record<string, string>) : {}
    } catch {
      track = {}
    }

    // track submitted exchange orders from recent commands
    const { data: cmds } = await supabase
      .from('order_commands')
      .select('exchange_order_id, intent, source')
      .eq('user_id', userId)
      .eq('status', 'submitted')
      .not('exchange_order_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(40)

    const client = new TossClient({
      baseUrl: config.tossBaseUrl,
      credentials: creds,
      accountSeq
    })

    let openList: Awaited<ReturnType<TossClient['orders']>>['orders'] = []
    try {
      openList = (await client.orders({ status: 'OPEN', limit: 100 })).orders
    } catch {
      return
    }

    const openById = new Map(openList.map((o) => [o.orderId, o]))
    const dirty = { ...track }

    for (const cmd of cmds ?? []) {
      const orderId = cmd.exchange_order_id as string
      if (!orderId) continue
      const intent = cmd.intent as OrderIntent
      const source = cmd.source === 'reserved' ? 'reserved' : 'manual'
      const prev = dirty[orderId] ?? '0'

      let filled = '0'
      let status = 'OPEN'
      let avg: string | null | undefined
      let amount: string | null | undefined
      let qty = intent.quantity

      const open = openById.get(orderId)
      if (open) {
        filled = open.execution?.filledQuantity ?? '0'
        status = open.status
        avg = open.execution?.averageFilledPrice
        amount = open.execution?.filledAmount
        qty = open.quantity
      } else {
        try {
          const o = await client.order(orderId)
          filled = o.execution?.filledQuantity ?? '0'
          status = o.status
          avg = o.execution?.averageFilledPrice
          amount = o.execution?.filledAmount
          qty = o.quantity
        } catch {
          continue
        }
      }

      if (Number(filled) > Number(prev)) {
        const complete =
          status === 'FILLED' ||
          status === 'COMPLETED' ||
          (Number(qty) > 0 && Number(filled) >= Number(qty))
        await sendOrderNotify({
          supabase,
          userId,
          masterKey,
          event: {
            kind: 'fill',
            orderId,
            symbol: intent.symbol,
            market: intent.market,
            side: intent.side,
            status,
            filledQuantity: filled,
            quantity: qty,
            averageFilledPrice: avg,
            filledAmount: amount,
            source,
            complete
          }
        })
        await writeJournal(supabase, userId, 'fill', complete ? '전량 체결' : '부분 체결', {
          orderId,
          filled,
          qty,
          status
        })
        this.status.notifies += 1
        dirty[orderId] = filled
      } else if (!(orderId in dirty)) {
        dirty[orderId] = filled
      }

      // terminal without more fills
      if (
        !openById.has(orderId) &&
        status !== 'OPEN' &&
        status !== 'PARTIAL' &&
        Number(filled) <= Number(prev) &&
        !['FILLED', 'COMPLETED'].includes(status) &&
        dirty[`${orderId}:term`] !== status
      ) {
        await sendOrderNotify({
          supabase,
          userId,
          masterKey,
          event: {
            kind: 'terminal',
            orderId,
            symbol: intent.symbol,
            market: intent.market,
            side: intent.side,
            status,
            filledQuantity: filled,
            quantity: qty,
            source
          }
        })
        dirty[`${orderId}:term`] = status
        this.status.notifies += 1
      }
    }

    // prune track map size
    const keys = Object.keys(dirty)
    if (keys.length > 80) {
      for (const k of keys.slice(0, keys.length - 60)) delete dirty[k]
    }

    await supabase
      .from('notification_settings')
      .update({
        fill_track_json: JSON.stringify(dirty),
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
  }
}
