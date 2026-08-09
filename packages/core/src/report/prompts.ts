import type { EvidenceItem, MarketBriefPack, ReportKind } from './types.js'

export function buildMarketBriefSystemPrompt(): string {
  return `당신은 토스증권 자동매매 서비스용 **시황 브리핑 작성자**입니다.

규칙:
1. 제공된 Evidence 목록에 있는 사실·숫자만 사용하세요. 없는 수치·뉴스를 만들지 마세요.
2. 각 주요 문장 끝에 근거를 [e:evidence_id] 형태로 달세요. 여러 개면 [e:id1][e:id2].
3. sourceTier 가 unknown 이거나 출처가 불명확한 내용만 언급할 경우 반드시 본문에 (카더라) 를 붙이세요.
4. official 출처(토스증권 Open API)는 "출처: 토스증권 Open API" 로 서술하세요.
5. 투자 권유·매수/매도 추천 금지. 사실 정리와 중립적 관찰만.
6. 한국어 마크다운. 제목/소제목 사용.
7. 마지막에 ## 출처 목록 섹션을 두고 id · sourceName · tier 를 나열하세요.
8. Evidence 수집 오류(errors)가 있으면 ## 데이터 공백 섹션에 적으세요.`
}

export function buildMarketBriefUserPrompt(
  pack: MarketBriefPack,
  kind: ReportKind
): string {
  const scope =
    kind === 'market_brief_kr'
      ? '국내(KR) 중심'
      : kind === 'market_brief_us'
        ? '미국(US) 중심'
        : '국내+미국 통합'

  const evidenceJson = JSON.stringify(
    pack.evidence.map((e) => simplifyEvidence(e)),
    null,
    2
  )

  return `작성 시각(UTC): ${pack.generatedAt}
보고서 범위: ${scope} 일일 시황 브리핑 (R0 — 토스 API 데이터만)

## 수집 오류
${pack.errors.length ? pack.errors.map((x) => `- ${x}`).join('\n') : '(없음)'}

## 표 요약 (참고)
### 지표
${pack.tables.indicators.map((i) => `- ${i.symbol}: ${i.lastPrice}`).join('\n') || '(없음)'}

### 환율
${
  pack.tables.fx
    ? `${pack.tables.fx.pair} mid=${pack.tables.fx.midRate} rate=${pack.tables.fx.rate} (${pack.tables.fx.changeType})`
    : '(없음)'
}

### 국내 랭킹 블록 수: ${pack.tables.rankingsKr.length}
### 미국 랭킹 블록 수: ${pack.tables.rankingsUs.length}

## Evidence (JSON)
${evidenceJson}

위 자료만으로 시황 브리핑 마크다운을 작성하세요.`
}

function simplifyEvidence(e: EvidenceItem) {
  return {
    id: e.id,
    claimType: e.claimType,
    sourceTier: e.sourceTier,
    sourceName: e.sourceName,
    summary: e.summary,
    market: e.market
  }
}

/** LLM 없이 팩트만으로 만드는 폴백 본문 */
export function renderTemplateBrief(pack: MarketBriefPack, kind: ReportKind): string {
  const lines: string[] = []
  const title =
    kind === 'market_brief_kr'
      ? '국내 시황 브리핑'
      : kind === 'market_brief_us'
        ? '미국 시황 브리핑'
        : '국내·미국 시황 브리핑'

  lines.push(`# ${title}`)
  lines.push('')
  lines.push(`> 생성 시각: ${pack.generatedAt}`)
  lines.push(`> 데이터: 토스증권 Open API 스냅샷 (R0)`)
  lines.push(`> 본 문서는 투자 권유가 아닙니다.`)
  lines.push('')

  lines.push('## 시장 지표')
  if (pack.tables.indicators.length === 0) lines.push('- (데이터 없음)')
  else {
    for (const i of pack.tables.indicators) {
      const ev = pack.evidence.find((e) => e.summary.includes(i.symbol))
      lines.push(
        `- **${i.symbol}**: ${i.lastPrice}` + (ev ? ` [e:${ev.id}]` : '')
      )
    }
  }
  lines.push('')

  lines.push('## 환율')
  if (pack.tables.fx) {
    const fxEv = pack.evidence.find((e) => e.market === 'FX')
    lines.push(
      `- ${pack.tables.fx.pair} mid **${pack.tables.fx.midRate}** (${pack.tables.fx.changeType})` +
        (fxEv ? ` [e:${fxEv.id}]` : '')
    )
  } else lines.push('- (데이터 없음)')
  lines.push('')

  lines.push('## 국내 랭킹')
  appendRankings(lines, pack.tables.rankingsKr, pack.evidence)
  lines.push('')
  lines.push('## 미국 랭킹')
  appendRankings(lines, pack.tables.rankingsUs, pack.evidence)
  lines.push('')

  if (pack.errors.length) {
    lines.push('## 데이터 공백')
    for (const e of pack.errors) lines.push(`- ${e}`)
    lines.push('')
  }

  lines.push('## 출처 목록')
  for (const e of pack.evidence) {
    const kadara = e.sourceTier === 'unknown' ? ' (카더라)' : ''
    lines.push(`- \`${e.id}\` · ${e.sourceName} · ${e.sourceTier}${kadara}`)
  }
  if (pack.evidence.length === 0) lines.push('- (없음)')

  return lines.join('\n')
}

export function buildStockBriefSystemPrompt(): string {
  return `당신은 종목 브리핑 작성자입니다.

규칙:
1. Evidence 에 있는 사실·숫자만 사용. 없는 실적·목표가·루머를 만들지 마세요.
2. 주요 문장 끝에 [e:evidence_id] 근거 표기.
3. sourceTier=unknown 또는 불명 출처는 반드시 (카더라).
4. official 은 "출처: 토스증권 Open API".
5. 매수/매도 추천 금지. 한국어 마크다운.
6. 마지막 ## 출처 목록.`
}

export function buildStockBriefUserPrompt(
  pack: import('./types.js').StockBriefPack,
  newsLines: string[]
): string {
  return `종목: ${pack.symbol} (${pack.market})
생성: ${pack.generatedAt}

## 수집 오류
${pack.errors.length ? pack.errors.map((e) => `- ${e}`).join('\n') : '(없음)'}

## 가격
${pack.tables.price ? JSON.stringify(pack.tables.price) : '(없음)'}

## 종목 정보
${pack.tables.stock ? JSON.stringify(pack.tables.stock) : '(없음)'}

## 유의사항 건수
${pack.tables.warnings.length}

## 일봉 개수
${pack.tables.candles1d.length}

## Evidence
${JSON.stringify(
  pack.evidence.map((e) => ({
    id: e.id,
    sourceTier: e.sourceTier,
    sourceName: e.sourceName,
    summary: e.summary
  })),
  null,
  2
)}

## 관련 뉴스/카더라 (참고, 불명이면 카더라)
${newsLines.length ? newsLines.join('\n') : '(없음)'}

위 자료만으로 종목 브리핑 마크다운을 작성하세요.`
}

export function renderTemplateStockBrief(
  pack: import('./types.js').StockBriefPack
): string {
  const name = pack.tables.stock?.name ?? pack.symbol
  const lines: string[] = []
  lines.push(`# ${pack.symbol} 종목 브리핑`)
  lines.push('')
  lines.push(`> ${name} · ${pack.market} · ${pack.generatedAt}`)
  lines.push('> 투자 권유가 아닙니다. 데이터: 토스증권 Open API (R1)')
  lines.push('')
  lines.push('## 가격')
  if (pack.tables.price) {
    const ev = pack.evidence.find((e) => e.id.startsWith('px_'))
    lines.push(
      `- 현재가 **${pack.tables.price.lastPrice}** ${pack.tables.price.currency ?? ''}` +
        (ev ? ` [e:${ev.id}]` : '')
    )
  } else lines.push('- (데이터 없음)')
  lines.push('')
  lines.push('## 유의사항')
  lines.push(
    pack.tables.warnings.length
      ? `- ${pack.tables.warnings.length}건 존재 (상세는 API 응답 참고)`
      : '- 등록된 유의사항 없음'
  )
  lines.push('')
  lines.push('## 최근 일봉')
  const last = pack.tables.candles1d.slice(-5)
  if (!last.length) lines.push('- (데이터 없음)')
  else {
    for (const c of last) {
      lines.push(`- ${c.timestamp}: 종가 ${c.closePrice} · 거래량 ${c.volume}`)
    }
  }
  lines.push('')
  if (pack.errors.length) {
    lines.push('## 데이터 공백')
    for (const e of pack.errors) lines.push(`- ${e}`)
    lines.push('')
  }
  lines.push('## 출처 목록')
  for (const e of pack.evidence) {
    lines.push(`- \`${e.id}\` · ${e.sourceName} · ${e.sourceTier}`)
  }
  return lines.join('\n')
}

function appendRankings(
  lines: string[],
  blocks: MarketBriefPack['tables']['rankingsKr'],
  evidence: EvidenceItem[]
): void {
  if (blocks.length === 0) {
    lines.push('- (데이터 없음)')
    return
  }
  for (const b of blocks) {
    lines.push(`### ${b.type}`)
    const ev = evidence.find((e) => e.summary.includes(b.type) || e.id.includes(b.type))
    for (const it of b.items.slice(0, 8)) {
      const cr = it.changeRate != null ? ` (${it.changeRate})` : ''
      lines.push(
        `- ${it.rank}. \`${it.symbol}\` ${it.lastPrice}${cr}` +
          (ev ? ` [e:${ev.id}]` : '')
      )
    }
  }
}
