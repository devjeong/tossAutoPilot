import { NextResponse } from 'next/server'
import type { PortfolioSnapshotDto } from '@tosspilot/core'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('portfolio_snapshots')
    .select('snapshot, last_error, polled_at')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const raw = data?.snapshot
  const snapshot =
    raw && typeof raw === 'object' && 'totals' in (raw as object)
      ? (raw as PortfolioSnapshotDto)
      : null

  return NextResponse.json({
    ok: true,
    snapshot,
    lastError: data?.last_error ?? null,
    polledAt: data?.polled_at ?? null
  })
}
