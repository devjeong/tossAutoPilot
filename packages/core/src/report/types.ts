/** 시황 보고서 R0 — Evidence & Report 계약 */

export type SourceTier = 'official' | 'licensed_media' | 'secondary' | 'unknown'
export type ClaimType = 'fact_number' | 'fact_event' | 'opinion' | 'rumor'
export type ReportKind =
  | 'market_brief_kr'
  | 'market_brief_us'
  | 'market_brief_both'
  | 'stock_brief'
export type ReportStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface EvidenceItem {
  id: string
  collectedAt: string
  claimType: ClaimType
  sourceTier: SourceTier
  /** 표시용 출처명. unknown 이면 UI/본문에 (카더라) */
  sourceName: string
  sourceUrl?: string | null
  /** 사람이 읽을 한 줄 요약(수치 포함) */
  summary: string
  /** 구조화 페이로드 */
  data?: Record<string, unknown>
  market?: 'KR' | 'US' | 'FX' | 'ALL'
  symbol?: string
}

export interface MarketBriefPack {
  generatedAt: string
  evidence: EvidenceItem[]
  errors: string[]
  /** 렌더용 숫자 표 (LLM 없이 표시 가능) */
  tables: {
    indicators: { symbol: string; lastPrice: string; timestamp?: string | null }[]
    fx: { midRate: string; rate: string; pair: string; changeType: string } | null
    calendarKr: unknown
    calendarUs: unknown
    rankingsKr: {
      type: string
      rankedAt?: string | null
      items: { rank: number; symbol: string; lastPrice: string; changeRate: string | null }[]
    }[]
    rankingsUs: {
      type: string
      rankedAt?: string | null
      items: { rank: number; symbol: string; lastPrice: string; changeRate: string | null }[]
    }[]
  }
}

export interface StockBriefPack {
  generatedAt: string
  symbol: string
  market: 'KR' | 'US'
  evidence: EvidenceItem[]
  errors: string[]
  tables: {
    price: { lastPrice: string; currency?: string; timestamp?: string | null } | null
    stock: { name?: string; marketCountry?: string; currency?: string } | null
    warnings: unknown[]
    candles1d: { timestamp: string; closePrice: string; volume: string }[]
  }
}

export interface MarketReportResult {
  title: string
  kind: ReportKind
  /** 마크다운 본문 */
  bodyMarkdown: string
  /** 출처 목록 (본문 하단용) */
  sources: { id: string; label: string; tier: SourceTier }[]
  kadaraCount: number
  provider: string
  model: string
  evidence: EvidenceItem[]
  tables: MarketBriefPack['tables'] | StockBriefPack['tables'] | Record<string, unknown>
  symbol?: string
  rawLlm?: string
}

/** 뉴스 피드 항목 (화면 리스트 + 보고서 재료) */
export interface NewsFeedItem {
  id: string
  title: string
  summary?: string
  url?: string | null
  sourceName: string
  sourceTier: SourceTier
  /** true 이면 UI에 (카더라) 배지 */
  isKadara: boolean
  market?: 'KR' | 'US' | 'ALL'
  symbols: string[]
  publishedAt?: string | null
  collectedAt: string
}
