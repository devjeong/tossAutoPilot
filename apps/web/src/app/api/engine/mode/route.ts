import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const Body = z.object({
  mode: z.enum(['paper', 'live']),
  confirmLive: z.boolean().optional()
})

/** POST — paper / live 전환 */
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

  if (body.mode === 'live' && !body.confirmLive) {
    return NextResponse.json(
      { ok: false, error: '실거래 전환 시 confirmLive: true 필요' },
      { status: 400 }
    )
  }

  const { error } = await supabase
    .from('engine_status')
    .update({ mode: body.mode })
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, mode: body.mode })
}
