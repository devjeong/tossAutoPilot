/**
 * 뉴스/카더라 피드 수집 (R1)
 * - Google News RSS 등 공개 피드
 * - 매체·URL 이 불명확하면 unknown → (카더라)
 */

import type { NewsFeedItem, SourceTier } from './types.js'

export interface FetchNewsOptions {
  /** 검색 키워드 (종목명·심볼·시황) */
  queries?: string[]
  market?: 'KR' | 'US' | 'ALL'
  /** 심볼 태깅용 */
  symbols?: string[]
  maxPerQuery?: number
  fetchImpl?: typeof fetch
}

const DEFAULT_QUERIES_KR = ['코스피', '코스닥', '한국 증시', '삼성전자 주식']
const DEFAULT_QUERIES_US = ['US stock market', 'S&P 500', 'Nasdaq', 'Federal Reserve']

/** 알려진 매체 키워드 → licensed_media, 그 외 secondary/unknown */
const KNOWN_MEDIA = [
  'reuters',
  'bloomberg',
  'wsj',
  'ft.com',
  'cnbc',
  '연 합',
  '연합',
  '한경',
  '한국경제',
  '매경',
  '매일경제',
  '조선',
  '중앙',
  '동아',
  '이데일리',
  '머니투데이',
  '서울경제',
  '파이낸셜뉴스',
  'yonhap',
  'mk.co.kr',
  'hankyung'
]

function tierForSource(sourceName: string, url: string | null): SourceTier {
  const hay = `${sourceName} ${url ?? ''}`.toLowerCase()
  if (!sourceName.trim() && !url) return 'unknown'
  if (KNOWN_MEDIA.some((k) => hay.includes(k.toLowerCase()))) return 'licensed_media'
  if (url && /^https?:\/\//i.test(url)) return 'secondary'
  return 'unknown'
}

function hashId(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return `news_${(h >>> 0).toString(16)}`
}

function stripCdata(s: string): string {
  return s
    .replace(/^<!\[CDATA\[/, '')
    .replace(/\]\]>$/, '')
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .trim()
}

function decodeXml(s: string): string {
  return stripCdata(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, '')
    .trim()
}

function parseRssItems(xml: string): {
  title: string
  link: string
  source: string
  pubDate: string
  description: string
}[] {
  const items: {
    title: string
    link: string
    source: string
    pubDate: string
    description: string
  }[] = []
  const blocks = xml.split(/<item[\s>]/i).slice(1)
  for (const block of blocks) {
    const end = block.indexOf('</item>')
    const chunk = end >= 0 ? block.slice(0, end) : block
    const title = matchTag(chunk, 'title')
    const link = matchTag(chunk, 'link') || matchTag(chunk, 'guid')
    const pubDate = matchTag(chunk, 'pubDate')
    const description = matchTag(chunk, 'description')
    const source =
      matchTag(chunk, 'source') ||
      matchAttr(chunk, 'source', 'url') ||
      hostOf(link) ||
      ''
    if (title) {
      items.push({
        title: decodeXml(title),
        link: decodeXml(link),
        source: decodeXml(source) || hostOf(link) || '',
        pubDate: decodeXml(pubDate),
        description: decodeXml(description).slice(0, 400)
      })
    }
  }
  return items
}

function matchTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i')
  const m = xml.match(re)
  return m?.[1]?.trim() ?? ''
}

function matchAttr(xml: string, tag: string, attr: string): string {
  const re = new RegExp(`<${tag}[^>]*\\s${attr}=["']([^"']+)["']`, 'i')
  const m = xml.match(re)
  return m?.[1]?.trim() ?? ''
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function googleNewsRssUrl(query: string, hl: 'ko' | 'en'): string {
  const q = encodeURIComponent(query)
  if (hl === 'ko') {
    return `https://news.google.com/rss/search?q=${q}&hl=ko&gl=KR&ceid=KR:ko`
  }
  return `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`
}

/**
 * 시황/종목 관련 뉴스를 수집한다.
 * Google News RSS 실패 시 빈 배열 + 에러 문자열 반환은 호출부 책임.
 */
export async function fetchNewsFeed(
  opts: FetchNewsOptions = {}
): Promise<{ items: NewsFeedItem[]; errors: string[] }> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch
  const maxPerQuery = opts.maxPerQuery ?? 8
  const market = opts.market ?? 'ALL'
  const symbols = (opts.symbols ?? []).map((s) => s.toUpperCase())

  let queries = opts.queries
  if (!queries?.length) {
    if (market === 'KR') queries = DEFAULT_QUERIES_KR
    else if (market === 'US') queries = DEFAULT_QUERIES_US
    else queries = [...DEFAULT_QUERIES_KR.slice(0, 2), ...DEFAULT_QUERIES_US.slice(0, 2)]
    if (symbols.length) {
      queries = [...symbols.slice(0, 4).map((s) => `${s} 주식 OR stock`), ...queries]
    }
  }

  const collectedAt = new Date().toISOString()
  const errors: string[] = []
  const byKey = new Map<string, NewsFeedItem>()

  for (const q of queries.slice(0, 8)) {
    const hl = market === 'US' || /[a-zA-Z]{2,}/.test(q) ? 'en' : 'ko'
    const url = googleNewsRssUrl(q, hl)
    try {
      const res = await fetchImpl(url, {
        headers: {
          'User-Agent': 'TossAutoPilot/0.1 (market-brief; +https://localhost)',
          Accept: 'application/rss+xml, application/xml, text/xml'
        }
      })
      if (!res.ok) {
        errors.push(`RSS ${q}: HTTP ${res.status}`)
        continue
      }
      const xml = await res.text()
      const parsed = parseRssItems(xml).slice(0, maxPerQuery)
      for (const it of parsed) {
        const tier = tierForSource(it.source, it.link || null)
        const isKadara = tier === 'unknown'
        const id = hashId(it.link || it.title)
        const taggedSymbols = symbols.filter(
          (s) =>
            it.title.toUpperCase().includes(s) ||
            (it.description ?? '').toUpperCase().includes(s)
        )
        const item: NewsFeedItem = {
          id,
          title: it.title,
          summary: it.description || undefined,
          url: it.link || null,
          sourceName: it.source || (isKadara ? '출처 불명' : 'RSS'),
          sourceTier: tier,
          isKadara,
          market,
          symbols: taggedSymbols,
          publishedAt: it.pubDate ? new Date(it.pubDate).toISOString() : null,
          collectedAt
        }
        // 동일 링크는 한 번만
        if (!byKey.has(id)) byKey.set(id, item)
      }
    } catch (e) {
      errors.push(`RSS ${q}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const items = [...byKey.values()].sort((a, b) => {
    const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0
    const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0
    return tb - ta
  })

  return { items, errors }
}
