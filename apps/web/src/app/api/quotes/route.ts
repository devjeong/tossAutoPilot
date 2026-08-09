import { NextResponse } from 'next/server'
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
    .from('quote_snapshots')
    .select('quotes, symbol_count, poll_interval_ms, last_error, polled_at, updated_at')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    snapshot: data
      ? {
          quotes: data.quotes ?? [],
          symbol_count: data.symbol_count,
          poll_interval_ms: data.poll_interval_ms,
          last_error: data.last_error,
          polled_at: data.polled_at
        }
      : null
  })
}
