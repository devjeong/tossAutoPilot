import { NextResponse } from 'next/server'
import {
  OrderIntentSchema,
  type OrderIntent
} from '@tosspilot/shared'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const CreateBody = z.object({
  intent: OrderIntentSchema,
  confirmLive: z.boolean().optional(),
  highValueApproved: z.boolean().optional()
})

/** POST — 수동 주문 명령 enqueue (엔진이 claim) */
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
    symbol: body.intent.symbol.trim().toUpperCase(),
    highValueApproved: body.highValueApproved ?? body.intent.highValueApproved
  }

  if (intent.orderType === 'LIMIT' && !intent.price) {
    return NextResponse.json({ ok: false, error: '지정가는 가격이 필요합니다' }, { status: 400 })
  }

  const { data: engine } = await supabase
    .from('engine_status')
    .select('mode')
    .eq('user_id', user.id)
    .maybeSingle()

  if (engine?.mode === 'live' && !body.confirmLive) {
    return NextResponse.json(
      { ok: false, error: '실거래 모드 — confirmLive: true 가 필요합니다' },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('order_commands')
    .insert({
      user_id: user.id,
      source: 'manual',
      status: 'pending',
      intent
    })
    .select('id, status, created_at')
    .single()

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, command: data })
}

/** GET — 최근 주문 명령 목록 */
export async function GET(req: Request) {
  const supabase = await createClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 40), 100)

  const { data, error } = await supabase
    .from('order_commands')
    .select(
      'id, source, status, intent, client_order_id, exchange_order_id, error, gate_snapshot, created_at, finished_at, reserved_order_id'
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, items: data ?? [] })
}
