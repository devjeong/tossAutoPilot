import type { TossClient } from '../toss/client.js'
import { collectMarketBriefPack } from './collect.js'
import { collectStockBriefPack } from './collect-stock.js'
import { fetchNewsFeed } from './news.js'
import { chatCompletion, type LlmProviderId } from './llm.js'
import {
  buildMarketBriefSystemPrompt,
  buildMarketBriefUserPrompt,
  buildStockBriefSystemPrompt,
  buildStockBriefUserPrompt,
  renderTemplateBrief,
  renderTemplateStockBrief
} from './prompts.js'
import type { MarketReportResult, NewsFeedItem, ReportKind } from './types.js'

export interface WriteMarketBriefOptions {
  client: TossClient
  kind?: ReportKind
  provider?: LlmProviderId
  env?: Record<string, string | undefined>
  fetchImpl?: typeof fetch
}

function countKadara(text: string, evidenceUnknown: number): number {
  const inBody = (text.match(/\(카더라\)/g) || []).length
  return inBody + evidenceUnknown
}

function titleFor(kind: ReportKind, llmTitle?: string, symbol?: string): string {
  if (llmTitle) return llmTitle
  if (kind === 'stock_brief') return `${symbol ?? '종목'} 종목 브리핑`
  if (kind === 'market_brief_kr') return '국내 시황 브리핑'
  if (kind === 'market_brief_us') return '미국 시황 브리핑'
  return '국내·미국 시황 브리핑'
}

function extractTitle(md: string): string | undefined {
  const m = md.match(/^#\s+(.+)$/m)
  return m?.[1]?.trim()
}

/**
 * R0 시황 브리핑 생성: 수집 → (LLM 또는 템플릿) → 결과
 */
export async function writeMarketBrief(
  opts: WriteMarketBriefOptions
): Promise<MarketReportResult> {
  const kind = opts.kind ?? 'market_brief_both'
  const pack = await collectMarketBriefPack(opts.client)

  const system = buildMarketBriefSystemPrompt()
  const user = buildMarketBriefUserPrompt(pack, kind)

  let bodyMarkdown = ''
  let provider = 'template'
  let model = 'template'
  let rawLlm: string | undefined

  try {
    const llm = await chatCompletion({
      system,
      user,
      ...(opts.provider ? { provider: opts.provider } : {}),
      ...(opts.env ? { env: opts.env } : {}),
      ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {})
    })
    provider = llm.provider
    model = llm.model
    rawLlm = llm.text
    if (llm.provider === 'template' || !llm.text.trim()) {
      bodyMarkdown = renderTemplateBrief(pack, kind)
      provider = 'template'
      model = 'template'
    } else {
      bodyMarkdown = llm.text.trim()
    }
  } catch {
    // LLM 실패 시 템플릿 폴백
    bodyMarkdown = renderTemplateBrief(pack, kind)
    provider = 'template'
    model = 'template-fallback'
  }

  // 미출처 방지: unknown evidence 가 본문에 쓰였는데 (카더라) 없으면 보정 힌트 섹션
  const unknownIds = pack.evidence.filter((e) => e.sourceTier === 'unknown')
  if (unknownIds.length && !bodyMarkdown.includes('(카더라)')) {
    bodyMarkdown +=
      '\n\n## 출처 주의\n' +
      unknownIds.map((e) => `- ${e.summary} (카더라) [\`e:${e.id}\`]`).join('\n')
  }

  const sources = pack.evidence.map((e) => ({
    id: e.id,
    label:
      e.sourceTier === 'unknown'
        ? `${e.sourceName} (카더라)`
        : e.sourceName,
    tier: e.sourceTier
  }))

  const kadaraCount = countKadara(
    bodyMarkdown,
    unknownIds.length
  )

  return {
    title: titleFor(kind, extractTitle(bodyMarkdown)),
    kind,
    bodyMarkdown,
    sources,
    kadaraCount,
    provider,
    model,
    evidence: pack.evidence,
    tables: pack.tables,
    ...(rawLlm ? { rawLlm } : {})
  }
}

export interface WriteStockBriefOptions {
  client: TossClient
  symbol: string
  /** 관련 뉴스 (사전 수집). 없으면 내부에서 심볼 키워드로 RSS 시도 */
  news?: NewsFeedItem[]
  provider?: LlmProviderId
  env?: Record<string, string | undefined>
  fetchImpl?: typeof fetch
  includeNewsFetch?: boolean
}

/**
 * R1 종목 브리핑: 토스 팩트 + (선택) 뉴스/카더라
 */
export async function writeStockBrief(
  opts: WriteStockBriefOptions
): Promise<MarketReportResult> {
  const pack = await collectStockBriefPack(opts.client, opts.symbol)
  let news = opts.news ?? []
  if (news.length === 0 && opts.includeNewsFetch !== false) {
    try {
      const fetched = await fetchNewsFeed({
        market: pack.market,
        symbols: [pack.symbol],
        queries: [
          pack.symbol,
          pack.tables.stock?.name ? `${pack.tables.stock.name} 주식` : pack.symbol
        ].filter(Boolean) as string[],
        maxPerQuery: 6,
        ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {})
      })
      news = fetched.items
      // 뉴스를 evidence 로 편입
      for (const n of news.slice(0, 12)) {
        pack.evidence.push({
          id: n.id,
          collectedAt: n.collectedAt,
          claimType: n.isKadara ? 'rumor' : 'fact_event',
          sourceTier: n.sourceTier,
          sourceName: n.sourceName,
          sourceUrl: n.url,
          summary: n.title + (n.summary ? ` — ${n.summary.slice(0, 120)}` : ''),
          market: pack.market,
          symbol: pack.symbol
        })
      }
      if (fetched.errors.length) {
        pack.errors.push(...fetched.errors.map((e) => `news: ${e}`))
      }
    } catch (e) {
      pack.errors.push(`news: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const newsLines = news.map(
    (n) =>
      `- ${n.isKadara ? '(카더라) ' : ''}[${n.sourceTier}] ${n.sourceName}: ${n.title}` +
      (n.url ? ` <${n.url}>` : '')
  )

  const system = buildStockBriefSystemPrompt()
  const user = buildStockBriefUserPrompt(pack, newsLines)

  let bodyMarkdown = ''
  let provider = 'template'
  let model = 'template'
  let rawLlm: string | undefined

  try {
    const llm = await chatCompletion({
      system,
      user,
      ...(opts.provider ? { provider: opts.provider } : {}),
      ...(opts.env ? { env: opts.env } : {}),
      ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {})
    })
    provider = llm.provider
    model = llm.model
    rawLlm = llm.text
    if (llm.provider === 'template' || !llm.text.trim()) {
      bodyMarkdown = renderTemplateStockBrief(pack)
      provider = 'template'
      model = 'template'
    } else {
      bodyMarkdown = llm.text.trim()
    }
  } catch {
    bodyMarkdown = renderTemplateStockBrief(pack)
    provider = 'template'
    model = 'template-fallback'
  }

  // 뉴스 카더라 목록 섹션 보강
  if (news.some((n) => n.isKadara) && !bodyMarkdown.includes('(카더라)')) {
    bodyMarkdown += '\n\n## 뉴스·카더라\n'
    for (const n of news.filter((x) => x.isKadara).slice(0, 8)) {
      bodyMarkdown += `- (카더라) ${n.title} — ${n.sourceName}\n`
    }
  }

  const unknownIds = pack.evidence.filter((e) => e.sourceTier === 'unknown')
  const sources = pack.evidence.map((e) => ({
    id: e.id,
    label:
      e.sourceTier === 'unknown' ? `${e.sourceName} (카더라)` : e.sourceName,
    tier: e.sourceTier
  }))

  return {
    title: titleFor('stock_brief', extractTitle(bodyMarkdown), pack.symbol),
    kind: 'stock_brief',
    bodyMarkdown,
    sources,
    kadaraCount: countKadara(bodyMarkdown, unknownIds.length),
    provider,
    model,
    evidence: pack.evidence,
    tables: pack.tables,
    symbol: pack.symbol,
    ...(rawLlm ? { rawLlm } : {})
  }
}
