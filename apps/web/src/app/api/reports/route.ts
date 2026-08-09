import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  generateMarketReportForUser,
  generateStockReportForUser
} from '@/lib/report-service'
import type { ReportKind } from '@tosspilot/core'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('market_reports')
    .select('id, kind, status, title, provider, model, kadara_count, created_at, payload')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

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

  let kind: ReportKind = 'market_brief_both'
  let symbol = ''
  try {
    const body = (await request.json()) as { kind?: ReportKind; symbol?: string }
    if (
      body.kind === 'market_brief_kr' ||
      body.kind === 'market_brief_us' ||
      body.kind === 'market_brief_both' ||
      body.kind === 'stock_brief'
    ) {
      kind = body.kind
    }
    symbol = (body.symbol ?? '').trim().toUpperCase()
  } catch {
    /* default */
  }

  try {
    if (kind === 'stock_brief') {
      if (!symbol) {
        return NextResponse.json(
          { ok: false, error: '종목 심볼(symbol)이 필요합니다' },
          { status: 400 }
        )
      }
      const { id, result } = await generateStockReportForUser(user.id, symbol)
      return NextResponse.json({
        ok: true,
        id,
        title: result.title,
        provider: result.provider,
        model: result.model,
        kadaraCount: result.kadaraCount,
        symbol: result.symbol
      })
    }

    const { id, result } = await generateMarketReportForUser(user.id, kind)
    return NextResponse.json({
      ok: true,
      id,
      title: result.title,
      provider: result.provider,
      model: result.model,
      kadaraCount: result.kadaraCount
    })
  } catch (e) {
    try {
      const admin = createAdminClient()
      await admin.from('market_reports').insert({
        user_id: user.id,
        kind,
        status: 'failed',
        title: kind === 'stock_brief' ? `${symbol || '종목'} 브리핑 실패` : '시황 브리핑 실패',
        body_markdown: '',
        error: e instanceof Error ? e.message : String(e),
        payload: { symbol }
      })
    } catch {
      /* ignore */
    }
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}
