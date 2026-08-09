/**
 * 심볼·종목 메타로 KR/US 시장 판별.
 */

export type DetectedMarket = 'KR' | 'US'

export function isKrSymbolCode(symbol: string): boolean {
  return /^\d{6}$/.test(symbol.trim())
}

export function isUsTickerLike(symbol: string): boolean {
  return /^[A-Za-z][A-Za-z0-9.\-]{0,9}$/.test(symbol.trim())
}

export function hasHangul(text: string): boolean {
  return /[가-힣]/.test(text)
}

/**
 * Toss StockInfo 또는 휴리스틱으로 시장 결정.
 * market: KOSPI/KOSDAQ → KR, NYSE/NASDAQ/AMEX → US
 * currency: KRW/USD
 */
export function detectMarketFromStockInfo(info: {
  symbol?: string
  market?: string | null
  marketCountry?: string | null
  currency?: string | null
}): DetectedMarket {
  const market = (info.market ?? '').toUpperCase()
  const country = (info.marketCountry ?? '').toUpperCase()
  const currency = (info.currency ?? '').toUpperCase()
  const symbol = (info.symbol ?? '').trim()

  if (country === 'KR' || country === 'KOR' || country === 'KOREA') return 'KR'
  if (country === 'US' || country === 'USA') return 'US'

  if (
    market.includes('KOSPI') ||
    market.includes('KOSDAQ') ||
    market.includes('KONEX') ||
    market === 'KR'
  ) {
    return 'KR'
  }
  if (
    market.includes('NASDAQ') ||
    market.includes('NYSE') ||
    market.includes('AMEX') ||
    market.includes('OTC') ||
    market === 'US'
  ) {
    return 'US'
  }

  if (currency === 'KRW') return 'KR'
  if (currency === 'USD') return 'US'

  if (isKrSymbolCode(symbol)) return 'KR'
  if (isUsTickerLike(symbol)) return 'US'

  return isKrSymbolCode(symbol) ? 'KR' : 'US'
}
