import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { engineFetchJson } from '@/lib/engine-proxy'

/**
 * GET /api/quotes
 * live=1 (기본): 엔진 → 토스 prices 즉시
 * live=0: DB 스냅샷
 */
export async function GET(req: Request) {
  const supabase = await createClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const live = new URL(req.url).searchParams.get('live') !== '0'

  if (live) {
    const proxied = await engineFetchJson<{
      ok: boolean
      snapshot?: {
        quotes: unknown[]
        symbol_count: number
        poll_interval_ms: number | null
        last_error: string | null
        polled_at: string
      } | null
      error?: string | null
      via?: string
    }>('/internal/toss/quotes', {
      method: 'POST',
      body: JSON.stringify({ userId: user.id, persist: true }),
      signal: AbortSignal.timeout(30_000)
    })

    if (proxied.ok && proxied.data.ok) {
      return NextResponse.json({
        ok: true,
        snapshot: proxied.data.snapshot,
        via: proxied.data.via ?? 'engine-live'
      })
    }

    const { data } = await supabase
      .from('quote_snapshots')
      .select('quotes, symbol_count, poll_interval_ms, last_error, polled_at')
      .eq('user_id', user.id)
      .maybeSingle()

    return NextResponse.json({
      ok: Boolean(data),
      snapshot: data
        ? {
            quotes: data.quotes ?? [],
            symbol_count: data.symbol_count,
            poll_interval_ms: data.poll_interval_ms,
            last_error: data.last_error,
            polled_at: data.polled_at
          }
        : null,
      via: data ? 'db-fallback' : 'failed',
      engineError: proxied.ok ? proxied.data.error : proxied.error
    })
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
      : null,
    via: 'db'
  })
}
