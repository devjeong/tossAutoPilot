import { NextResponse } from 'next/server'
import { OrderIntentSchema, type OrderIntent } from '@tosspilot/shared'
import { createClient } from '@/lib/supabase/server'
import { getServerEnv } from '@/lib/env'
import {
  TelegramClient,
  formatOrderNotifyMessage,
  masterKeyFromEnv,
  open
} from '@tosspilot/core'
import { z } from 'zod'

const CreateBody = z.object({
  intent: OrderIntentSchema,
  autoRequeue: z.boolean().optional().default(true),
  note: z.string().optional()
})

/** GET — 예약 목록 */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('reserved_orders')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, items: data ?? [] })
}

/** POST — 예약 등록 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const parsed = CreateBody.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 })
  }
  const body = parsed.data

  const intent: OrderIntent = {
    ...body.intent,
    symbol: body.intent.symbol.trim().toUpperCase()
  }
  if (intent.orderType === 'LIMIT' && !intent.price) {
    return NextResponse.json({ ok: false, error: '지정가는 가격이 필요합니다' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('reserved_orders')
    .insert({
      user_id: user.id,
      status: 'armed',
      intent,
      auto_requeue: body.autoRequeue ?? true,
      note: body.note ?? null
    })
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  // fire-and-forget telegram (best effort via service decrypt)
  void notifyReserveCreated(user.id, intent)

  return NextResponse.json({ ok: true, item: data })
}

/** DELETE — ?id= */
export async function DELETE(req: Request) {
  const supabase = await createClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })

  const { data: row } = await supabase
    .from('reserved_orders')
    .select('intent, status')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  const { error } = await supabase
    .from('reserved_orders')
    .update({
      status: 'cancelled',
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .in('status', ['armed', 'working', 'paused', 'error'])

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  if (row?.intent) {
    const intent = row.intent as {
      symbol: string
      market: 'KR' | 'US'
      side: 'BUY' | 'SELL'
      orderType: 'LIMIT' | 'MARKET'
      quantity: string
      price?: string
    }
    void notifyReserveCancelled(user.id, intent)
  }

  return NextResponse.json({ ok: true })
}

async function notifyReserveCreated(
  userId: string,
  intent: {
    symbol: string
    market: 'KR' | 'US'
    side: 'BUY' | 'SELL'
    orderType: 'LIMIT' | 'MARKET'
    quantity: string
    price?: string
  }
) {
  await sendTelegram(userId, {
    kind: 'reserve',
    action: 'created',
    symbol: intent.symbol,
    market: intent.market,
    side: intent.side,
    orderType: intent.orderType,
    quantity: intent.quantity,
    price: intent.price
  })
}

async function notifyReserveCancelled(
  userId: string,
  intent: {
    symbol: string
    market: 'KR' | 'US'
    side: 'BUY' | 'SELL'
    orderType: 'LIMIT' | 'MARKET'
    quantity: string
    price?: string
  }
) {
  await sendTelegram(userId, {
    kind: 'reserve',
    action: 'cancelled',
    symbol: intent.symbol,
    market: intent.market,
    side: intent.side,
    orderType: intent.orderType,
    quantity: intent.quantity,
    price: intent.price
  })
}

async function sendTelegram(
  userId: string,
  event: Parameters<typeof formatOrderNotifyMessage>[0]
) {
  try {
    const { createClient: createAdmin } = await import('@supabase/supabase-js')
    const env = getServerEnv()
    if (!env.supabaseUrl || !env.serviceRoleKey || !env.credentialsMasterKey) return

    const admin = createAdmin(env.supabaseUrl, env.serviceRoleKey)
    const { data } = await admin
      .from('notification_settings')
      .select(
        'telegram_enabled, telegram_chat_id, telegram_bot_token_enc, notify_on_reserve, notify_on_cancel'
      )
      .eq('user_id', userId)
      .maybeSingle()

    if (!data?.telegram_enabled || !data.telegram_chat_id || !data.telegram_bot_token_enc) return
    if (event.kind === 'reserve' && event.action === 'created' && !data.notify_on_reserve) return
    if (event.kind === 'reserve' && event.action === 'cancelled' && !data.notify_on_cancel) return

    const token = open(data.telegram_bot_token_enc, masterKeyFromEnv(env.credentialsMasterKey))
    const client = new TelegramClient(token)
    await client.sendMessage(data.telegram_chat_id, formatOrderNotifyMessage(event))
  } catch {
    /* ignore notify failures */
  }
}
