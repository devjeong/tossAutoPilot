import type { SupabaseClient } from '@supabase/supabase-js'
import {
  TelegramClient,
  formatOrderNotifyMessage,
  masterKeyFromEnv,
  open,
  type OrderNotifyEvent
} from '@tosspilot/core'

type NotifRow = {
  telegram_enabled: boolean
  telegram_chat_id: string | null
  telegram_bot_token_enc: string | null
  notify_on_reserve: boolean
  notify_on_submit: boolean
  notify_on_fill: boolean
  notify_on_cancel: boolean
}

export async function loadNotifySettings(
  supabase: SupabaseClient,
  userId: string
): Promise<NotifRow | null> {
  const { data, error } = await supabase
    .from('notification_settings')
    .select(
      'telegram_enabled, telegram_chat_id, telegram_bot_token_enc, notify_on_reserve, notify_on_submit, notify_on_fill, notify_on_cancel'
    )
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as NotifRow | null
}

export async function sendOrderNotify(opts: {
  supabase: SupabaseClient
  userId: string
  masterKey: string
  event: OrderNotifyEvent
}): Promise<{ sent: boolean; reason?: string }> {
  const row = await loadNotifySettings(opts.supabase, opts.userId)
  if (!row?.telegram_enabled) return { sent: false, reason: 'disabled' }
  if (!row.telegram_chat_id || !row.telegram_bot_token_enc) {
    return { sent: false, reason: 'missing chat/token' }
  }

  const kind = opts.event.kind
  if (kind === 'reserve' && !row.notify_on_reserve) return { sent: false, reason: 'reserve off' }
  if (kind === 'accepted' && !row.notify_on_submit) return { sent: false, reason: 'submit off' }
  if (kind === 'fill' && !row.notify_on_fill) return { sent: false, reason: 'fill off' }
  if (kind === 'terminal' && !row.notify_on_cancel) return { sent: false, reason: 'cancel off' }

  try {
    const token = open(row.telegram_bot_token_enc, masterKeyFromEnv(opts.masterKey))
    const client = new TelegramClient(token)
    const text = formatOrderNotifyMessage(opts.event)
    const res = await client.sendMessage(row.telegram_chat_id, text)
    if (!res.ok) return { sent: false, reason: res.description }
    return { sent: true }
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : String(e) }
  }
}

export async function writeJournal(
  supabase: SupabaseClient,
  userId: string,
  category: string,
  message: string,
  payload: Record<string, unknown> = {},
  level = 'info'
): Promise<void> {
  await supabase.from('journal_entries').insert({
    user_id: userId,
    level,
    category,
    message,
    payload
  })
}
