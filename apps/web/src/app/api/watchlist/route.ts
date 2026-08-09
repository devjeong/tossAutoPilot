import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function normalizeSymbol(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '')
}

function inferMarket(symbol: string): 'KR' | 'US' {
  // 숫자 6자리(국내) 또는 영문 티커
  if (/^\d{6}$/.test(symbol)) return 'KR'
  return 'US'
}

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('watchlist_items')
    .select('id, symbol, market, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

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

  let body: { symbol?: string; market?: string }
  try {
    body = (await request.json()) as { symbol?: string; market?: string }
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 })
  }

  const symbol = normalizeSymbol(body.symbol ?? '')
  if (!symbol) {
    return NextResponse.json({ ok: false, error: 'symbol required' }, { status: 400 })
  }
  const market =
    body.market === 'KR' || body.market === 'US' ? body.market : inferMarket(symbol)

  const { data, error } = await supabase
    .from('watchlist_items')
    .insert({
      user_id: user.id,
      symbol,
      market
    })
    .select('id, symbol, market, created_at')
    .single()

  if (error) {
    // unique violation
    if (error.code === '23505') {
      return NextResponse.json({ ok: false, error: '이미 관심종목에 있습니다' }, { status: 409 })
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, item: data })
}

export async function DELETE(request: Request) {
  const supabase = await createClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const symbol = normalizeSymbol(url.searchParams.get('symbol') ?? '')
  const id = url.searchParams.get('id')
  if (!symbol && !id) {
    return NextResponse.json({ ok: false, error: 'symbol or id required' }, { status: 400 })
  }

  let q = supabase.from('watchlist_items').delete().eq('user_id', user.id)
  if (id) q = q.eq('id', id)
  else q = q.eq('symbol', symbol)

  const { error } = await q
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
