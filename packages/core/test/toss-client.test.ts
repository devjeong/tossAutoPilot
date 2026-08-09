import { describe, expect, it, vi } from 'vitest'
import { TossClient } from '../src/toss/client.js'

describe('TossClient.prices', () => {
  it('parses result envelope and returns prices', async () => {
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url)
      if (u.includes('/oauth2/token')) {
        return new Response(
          JSON.stringify({
            access_token: 'tok_abcdefghijklmnop',
            token_type: 'Bearer',
            expires_in: 3600
          }),
          { status: 200 }
        )
      }
      if (u.includes('/api/v1/prices')) {
        expect(init?.headers).toBeTruthy()
        return new Response(
          JSON.stringify({
            result: [
              {
                symbol: '005930',
                lastPrice: '72000',
                currency: 'KRW',
                timestamp: '2026-08-09T01:00:00+09:00'
              }
            ]
          }),
          {
            status: 200,
            headers: {
              'x-ratelimit-limit': '10',
              'x-ratelimit-remaining': '9'
            }
          }
        )
      }
      return new Response('no', { status: 404 })
    }) as unknown as typeof fetch

    const client = new TossClient({
      credentials: { clientId: 'c', clientSecret: 's' },
      fetchImpl
    })
    const prices = await client.prices(['005930'])
    expect(prices).toHaveLength(1)
    expect(prices[0]?.lastPrice).toBe('72000')
  })
})
