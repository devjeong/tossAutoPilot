import {
  TossClient,
  writeMarketBrief,
  writeStockBrief,
  fetchNewsFeed,
  type MarketReportResult,
  type ReportKind,
  type NewsFeedItem
} from '@tosspilot/core'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadDecryptedCredentials } from '@/lib/credentials-store'

async function tossClientForUser(userId: string): Promise<TossClient> {
  const creds = await loadDecryptedCredentials(userId)
  if (!creds) {
    throw new Error('저장된 토스 API 자격증명이 없습니다. 설정에서 등록하세요.')
  }
  return new TossClient({
    credentials: creds,
    baseUrl: process.env.TOSS_BASE_URL || 'https://openapi.tossinvest.com'
  })
}

async function saveReport(
  userId: string,
  result: MarketReportResult
): Promise<string> {
  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { data, error } = await admin
    .from('market_reports')
    .insert({
      user_id: userId,
      kind: result.kind,
      status: 'completed',
      title: result.title,
      body_markdown: result.bodyMarkdown,
      provider: result.provider,
      model: result.model,
      kadara_count: result.kadaraCount,
      payload: {
        sources: result.sources,
        evidence: result.evidence,
        tables: result.tables,
        symbol: result.symbol
      },
      created_at: now,
      updated_at: now
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  if (!data?.id) throw new Error('보고서 저장 실패')
  return data.id as string
}

export async function generateMarketReportForUser(
  userId: string,
  kind: ReportKind = 'market_brief_both'
): Promise<{ id: string; result: MarketReportResult }> {
  if (kind === 'stock_brief') {
    throw new Error('종목 리포트는 symbol 과 함께 generateStockReportForUser 를 사용하세요')
  }
  const client = await tossClientForUser(userId)
  const result = await writeMarketBrief({
    client,
    kind,
    env: process.env as Record<string, string | undefined>
  })
  const id = await saveReport(userId, result)
  return { id, result }
}

export async function generateStockReportForUser(
  userId: string,
  symbol: string
): Promise<{ id: string; result: MarketReportResult }> {
  const client = await tossClientForUser(userId)
  const result = await writeStockBrief({
    client,
    symbol,
    includeNewsFetch: true,
    env: process.env as Record<string, string | undefined>
  })
  const id = await saveReport(userId, result)
  return { id, result }
}

export async function refreshNewsForUser(
  userId: string,
  opts?: { market?: 'KR' | 'US' | 'ALL'; symbols?: string[] }
): Promise<{ items: NewsFeedItem[]; errors: string[]; saved: number }> {
  // 관심 종목 보강
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
