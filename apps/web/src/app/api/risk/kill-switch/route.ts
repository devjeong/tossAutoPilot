import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_RISK_CONFIG, type RiskConfig } from '@tosspilot/shared'
import { z } from 'zod'

const Body = z.object({
  killSwitch: z.boolean()
})

/** POST — 킬 스위치 토글 (profiles.risk_config) */
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

  const { data: profile } = await supabase
    .from('profiles')
    .select('risk_config')
    .eq('id', user.id)
    .maybeSingle()

  const next: RiskConfig = {
    ...DEFAULT_RISK_CONFIG,
    ...((profile?.risk_config as RiskConfig | null) ?? {}),
    killSwitch: body.killSwitch
  }

  const { error } = await supabase
    .from('profiles')
    .update({ risk_config: next, updated_at: new Date().toISOString() })
    .eq('id', user.id)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, riskConfig: next })
}
