import { describe, expect, it } from 'vitest'
import { renderTemplateBrief } from '../src/report/prompts.js'
import type { MarketBriefPack } from '../src/report/types.js'

describe('renderTemplateBrief', () => {
  it('includes official sources and no fabricated numbers', () => {
    const pack: MarketBriefPack = {
      generatedAt: '2026-08-09T00:00:00.000Z',
      errors: [],
      evidence: [
        {
          id: 'ind_0',
          collectedAt: '2026-08-09T00:00:00.000Z',
          claimType: 'fact_number',
          sourceTier: 'official',
          sourceName: '토스증권 Open API · market-indicators/prices',
          summary: 'KOSPI 지표 가격 2650.12',
          market: 'KR'
        }
      ],
      tables: {
        indicators: [{ symbol: 'KOSPI', lastPrice: '2650.12' }],
        fx: {
          midRate: '1384.20',
          rate: '1385.00',
          pair: 'USD/KRW',
          changeType: 'UP'
        },
        calendarKr: null,
        calendarUs: null,
        rankingsKr: [],
        rankingsUs: []
      }
    }
    const md = renderTemplateBrief(pack, 'market_brief_both')
    expect(md).toContain('KOSPI')
    expect(md).toContain('2650.12')
    expect(md).toContain('토스증권 Open API')
    expect(md).toContain('투자 권유가 아닙니다')
  })
})
