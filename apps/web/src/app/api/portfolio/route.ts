import { NextResponse } from 'next/server'
import type { PortfolioSnapshotDto } from '@tosspilot/core'
import { createClient } from '@/lib/supabase/server'
import { engineFetchJson } from '@/lib/engine-proxy'

/**
 * GET /api/portfolio
 * live=1 (기본): 엔진 → 토스 즉시 조회
 * live=0: DB 스냅샷만 (폴백)
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
      snapshot?: PortfolioSnapshotDto | null
      lastError?: string | null
      polledAt?: string
      via?: string
      error?: string
    }>('/internal/toss/portfolio', {
      method: 'POST',
      body: JSON.stringify({ userId: user.id, persist: true }),
      signal: AbortSignal.timeout(45_000)
    })

    if (proxied.ok && proxied.data.ok) {
      return NextResponse.json({
        ok: true,
        snapshot: proxied.data.snapshot ?? null,
        lastError: proxied.data.lastError ?? null,
        polledAt: proxied.data.polledAt ?? null,
        via: proxied.data.via ?? 'engine-live'
      })
    }

    // 엔진 실패 시 마지막 DB 스냅샷 폴백
    const { data } = await supabase
      .from('portfolio_snapshots')
      .select('snapshot, last_error, polled_at')
      .eq('user_id', user.id)
      .maybeSingle()

    const raw = data?.snapshot
    const snapshot =
      raw && typeof raw === 'object' && 'totals' in (raw as object)
        ? (raw as PortfolioSnapshotDto)
        : null

    return NextResponse.json({
      ok: Boolean(snapshot),
      snapshot,
      lastError:
        (proxied.ok ? proxied.data.lastError || proxied.data.error : proxied.error) ||
        data?.last_error ||
        '엔진 라이브 조회 실패',
      polledAt: data?.polled_at ?? null,
      via: snapshot ? 'db-fallback' : 'failed',
      engineError: proxied.ok ? proxied.data.error : proxied.error
    })
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
    polledAt: data?.polled_at ?? null,
    via: 'db'
  })
}
