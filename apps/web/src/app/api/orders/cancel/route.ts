import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const Body = z.object({
  orderId: z.string().min(1),
  symbol: z.string().optional(),
  market: z.enum(['KR', 'US']).optional(),
  side: z.enum(['BUY', 'SELL']).optional(),
  quantity: z.string().optional()
})

/** POST — 거래소 주문 취소 명령 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  let body: z.infer<typeof Body>
  try {
    body = Body.parse(await req.json())
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'invalid body' },
      { status: 400 }
    )
  }

  const intent = {
    symbol: (body.symbol ?? 'CANCEL').toUpperCase(),
    market: body.market ?? 'KR',
    side: body.side ?? 'BUY',
    orderType: 'LIMIT' as const,
    timeInForce: 'DAY' as const,
    quantity: body.quantity ?? '0',
    cancelOrderId: body.orderId
  }

  const { data, error } = await supabase
    .from('order_commands')
    .insert({
      user_id: user.id,
      source: 'cancel',
      status: 'pending',
      intent
    })
    .select('id, status')
    .single()

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, command: data })
}
