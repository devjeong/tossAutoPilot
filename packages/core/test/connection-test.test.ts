import { describe, expect, it, vi } from 'vitest'
import { testTossConnection } from '../src/toss/connection-test.js'

describe('testTossConnection', () => {
  it('성공 시 토큰·계좌를 반환한다', async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const u = String(url)
      if (u.includes('/oauth2/token')) {
        return new Response(
          JSON.stringify({
            access_token: 'tok_abcdefghijklmnopqrstuvwxyz',
            token_type: 'Bearer',
            expires_in: 3600
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      }
      if (u.includes('/api/v1/accounts')) {
        return new Response(
          JSON.stringify({
            result: [
              { accountNo: '123-45', accountSeq: 1, accountType: 'BROKERAGE' }
            ]
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      }
      return new Response('not found', { status: 404 })
    }) as unknown as typeof fetch

    const r = await testTossConnection({
      credentials: { clientId: 'c_test', clientSecret: 's_test' },
      fetchImpl
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.brokerageAccountSeq).toBe(1)
      expect(r.accounts).toHaveLength(1)
      expect(r.tokenHint).not.toContain('tok_abcdefghijklmnopqrstuvwxyz')
      expect(r.expiresInSec).toBe(3600)
    }
  })

  it('잘못된 키면 token 단계에서 실패', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({ error: 'invalid_client', error_description: 'bad secret' }),
        { status: 401, headers: { 'content-type': 'application/json' } }
      )
    }) as unknown as typeof fetch

    const r = await testTossConnection({
      credentials: { clientId: 'c_bad', clientSecret: 's_bad' },
      fetchImpl
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.step).toBe('token')
      expect(r.error).toMatch(/invalid_client/)
    }
  })
})
