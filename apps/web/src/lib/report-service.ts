/**
 * 보고서·뉴스.
 * 토스 시세 수집이 필요한 보고서는 엔진 경유. 뉴스 RSS 는 토스 아님 → 웹에서 가능.
 */
import { fetchNewsFeed, type MarketReportResult, type NewsFeedItem, type ReportKind } from '@tosspilot/core'
import { createAdminClient } from '@/lib/supabase/admin'
import { engineFetchJson } from '@/lib/engine-proxy'

export async function generateMarketReportForUser(
  userId: string,
  kind: ReportKind = 'market_brief_both'
): Promise<{ id: string; result?: MarketReportResult; title?: string; provider?: string }> {
  if (kind === 'stock_brief') {
    throw new Error('종목 리포트는 symbol 과 함께 generateStockReportForUser 를 사용하세요')
  }

  const proxied = await engineFetchJson<{
    ok: boolean
    id?: string
    title?: string
    provider?: string
    kind?: string
    error?: string
  }>('/internal/toss/report', {
    method: 'POST',
    body: JSON.stringify({ userId, kind }),
    // 보고서 수집+LLM 은 시간 소요
    signal: AbortSignal.timeout(180_000)
  })

  if (!proxied.ok) {
    throw new Error(proxied.error)
  }
  if (!proxied.data.ok || !proxied.data.id) {
    throw new Error(proxied.data.error || '보고서 생성 실패')
  }

  return {
    id: proxied.data.id,
    title: proxied.data.title,
    provider: proxied.data.provider
  }
}

export async function generateStockReportForUser(
  userId: string,
  symbol: string
): Promise<{ id: string; title?: string; provider?: string }> {
  const proxied = await engineFetchJson<{
    ok: boolean
    id?: string
    title?: string
    provider?: string
    error?: string
  }>('/internal/toss/report', {
    method: 'POST',
    body: JSON.stringify({ userId, kind: 'stock_brief', symbol }),
    signal: AbortSignal.timeout(180_000)
  })

  if (!proxied.ok) {
    throw new Error(proxied.error)
  }
  if (!proxied.data.ok || !proxied.data.id) {
    throw new Error(proxied.data.error || '종목 보고서 생성 실패')
  }

  return {
    id: proxied.data.id,
    title: proxied.data.title,
    provider: proxied.data.provider
  }
}

export async function refreshNewsForUser(
  userId: string,
  opts?: { market?: 'KR' | 'US' | 'ALL'; symbols?: string[] }
): Promise<{ items: NewsFeedItem[]; errors: string[]; saved: number }> {
  // RSS 등 — 토스 Open API 아님
  let symbols = opts?.symbols ?? []
  const admin = createAdminClient()
  if (!symbols.length) {
    const { data } = await admin
      .from('watchlist_items')
      .select('symbol')
      .eq('user_id', userId)
      .limit(20)
    symbols = (data ?? []).map((r) => String(r.symbol))
  }

  const { items, errors } = await fetchNewsFeed({
    market: opts?.market ?? 'ALL',
    symbols,
    maxPerQuery: 8
  })

  let saved = 0
  for (const it of items) {
    const { error } = await admin.from('news_items').upsert(
      {
        id: `${userId}_${it.id}`,
        user_id: userId,
        title: it.title,
        summary: it.summary ?? null,
        url: it.url ?? null,
        source_name: it.sourceName,
        source_tier: it.sourceTier,
        is_kadara: it.isKadara,
        market: it.market ?? 'ALL',
        symbols: it.symbols,
        published_at: it.publishedAt,
        collected_at: it.collectedAt
      },
      { onConflict: 'id' }
    )
    if (!error) saved += 1
  }

  return { items, errors, saved }
}
