import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { refreshNewsForUser } from '@/lib/report-service'

export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const filter = url.searchParams.get('filter') // all | kadara | official
  const market = url.searchParams.get('market') // KR | US | ALL

  let q = supabase
    .from('news_items')
    .select(
      'id, title, summary, url, source_name, source_tier, is_kadara, market, symbols, published_at, collected_at'
    )
    .eq('user_id', user.id)
    .order('collected_at', { ascending: false })
    .limit(100)

  if (filter === 'kadara') q = q.eq('is_kadara', true)
  if (filter === 'sourced') q = q.eq('is_kadara', false)
  if (market === 'KR' || market === 'US') q = q.eq('market', market)

  const { data, error } = await q
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, items: data ?? [] })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  let market: 'KR' | 'US' | 'ALL' = 'ALL'
  try {
    const body = (await request.json()) as { market?: 'KR' | 'US' | 'ALL' }
    if (body.market === 'KR' || body.market === 'US' || body.market === 'ALL') {
      market = body.market
    }
  } catch {
    /* default */
  }

  try {
    const result = await refreshNewsForUser(user.id, { market })
    return NextResponse.json({
      ok: true,
      saved: result.saved,
      count: result.items.length,
      kadaraCount: result.items.filter((i) => i.isKadara).length,
      errors: result.errors
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}
