/**
 * 토스 Open API 실연결 검증 (자격증명 → 토큰 → 계좌 목록).
 * 주문·시세 폴링 없이 읽기 전용 왕복만 수행한다.
 */

import { z } from 'zod'
import { maskToken } from '../util/redact.js'
import type { TossCredentials } from '../crypto/credentials-payload.js'

export const DEFAULT_TOSS_BASE_URL = 'https://openapi.tossinvest.com'

const TokenResponse = z.object({
  access_token: z.string().min(1),
  token_type: z.string(),
  expires_in: z.number().int().positive()
})

const OAuthError = z.object({
  error: z.string(),
  error_description: z.string().optional()
})

const Account = z.object({
  accountNo: z.string(),
  accountSeq: z.number().int(),
  accountType: z.string()
})

/** 공통 envelope 또는 배열 직접 응답 모두 허용 */
const AccountsEnvelope = z.union([
  z.array(Account),
  z.object({ result: z.array(Account) }),
  z.object({ result: z.object({ accounts: z.array(Account) }).passthrough() }),
  z.object({ accounts: z.array(Account) })
])

export type ConnectionTestAccount = z.infer<typeof Account>

export type ConnectionTestResult =
  | {
      ok: true
      baseUrl: string
      tokenHint: string
      expiresInSec: number
      accounts: ConnectionTestAccount[]
      brokerageAccountSeq: number | null
      latencyMs: { token: number; accounts: number; total: number }
    }
  | {
      ok: false
      baseUrl: string
      step: 'token' | 'accounts' | 'config'
      error: string
      status?: number
      latencyMs: { token?: number; accounts?: number; total: number }
    }

export interface ConnectionTestOptions {
  credentials: TossCredentials
  baseUrl?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

function extractAccounts(json: unknown): ConnectionTestAccount[] {
  const parsed = AccountsEnvelope.safeParse(json)
  if (!parsed.success) {
    // envelope 변형 시도
    if (json && typeof json === 'object') {
      const o = json as Record<string, unknown>
      if (Array.isArray(o.result)) {
        return z.array(Account).parse(o.result)
      }
      if (o.result && typeof o.result === 'object') {
        const r = o.result as Record<string, unknown>
        if (Array.isArray(r.accounts)) return z.array(Account).parse(r.accounts)
      }
    }
    throw new Error('계좌 응답 형식을 해석할 수 없습니다')
  }
  const v = parsed.data
  if (Array.isArray(v)) return v
  if ('accounts' in v && Array.isArray(v.accounts)) return v.accounts
  if ('result' in v) {
    const r = v.result
    if (Array.isArray(r)) return r
    if (r && typeof r === 'object' && 'accounts' in r) {
      return (r as { accounts: ConnectionTestAccount[] }).accounts
    }
  }
  return []
}

export async function testTossConnection(
  opts: ConnectionTestOptions
): Promise<ConnectionTestResult> {
  const baseUrl = (opts.baseUrl || DEFAULT_TOSS_BASE_URL).replace(/\/$/, '')
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch
  const timeoutMs = opts.timeoutMs ?? 15_000
  const t0 = Date.now()

  const clientId = opts.credentials.clientId.trim()
  const clientSecret = opts.credentials.clientSecret.trim()
  if (!clientId || !clientSecret) {
    return {
      ok: false,
      baseUrl,
      step: 'config',
      error: 'Client ID / Secret 이 비어 있습니다',
      latencyMs: { total: 0 }
    }
  }

  // ── 1) OAuth token ─────────────────────────────────────────────
  let tokenMs = 0
  let accessToken = ''
  let expiresInSec = 0
  try {
    const tToken = Date.now()
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), timeoutMs)
    let res: Response
    try {
      res = await fetchImpl(`${baseUrl}/oauth2/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json'
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret
        }).toString(),
        signal: ac.signal
      })
    } finally {
      clearTimeout(timer)
    }
    tokenMs = Date.now() - tToken
    const json: unknown = await res.json().catch(() => ({}))

    if (!res.ok) {
      const oe = OAuthError.safeParse(json)
      const msg = oe.success
        ? `${oe.data.error}${oe.data.error_description ? `: ${oe.data.error_description}` : ''}`
        : `HTTP ${res.status}`
      return {
        ok: false,
        baseUrl,
        step: 'token',
        error: msg,
        status: res.status,
        latencyMs: { token: tokenMs, total: Date.now() - t0 }
      }
    }

    const parsed = TokenResponse.safeParse(json)
    if (!parsed.success) {
      return {
        ok: false,
        baseUrl,
        step: 'token',
        error: '토큰 응답 형식이 올바르지 않습니다',
        status: res.status,
        latencyMs: { token: tokenMs, total: Date.now() - t0 }
      }
    }
    accessToken = parsed.data.access_token
    expiresInSec = parsed.data.expires_in
  } catch (e) {
    const msg =
      e instanceof Error && e.name === 'AbortError'
        ? `토큰 요청 타임아웃 (${timeoutMs}ms)`
        : e instanceof Error
          ? e.message
          : String(e)
    return {
      ok: false,
      baseUrl,
      step: 'token',
      error: msg,
      latencyMs: { token: tokenMs || Date.now() - t0, total: Date.now() - t0 }
    }
  }

  // ── 2) GET /api/v1/accounts ────────────────────────────────────
  let accountsMs = 0
  try {
    const tAcc = Date.now()
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), timeoutMs)
    let res: Response
    try {
      res = await fetchImpl(`${baseUrl}/api/v1/accounts`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        signal: ac.signal
      })
    } finally {
      clearTimeout(timer)
    }
    accountsMs = Date.now() - tAcc
    const json: unknown = await res.json().catch(() => ({}))

    if (!res.ok) {
      const errBody =
        json && typeof json === 'object'
          ? JSON.stringify(json).slice(0, 200)
          : `HTTP ${res.status}`
      return {
        ok: false,
        baseUrl,
        step: 'accounts',
        error: errBody,
        status: res.status,
        latencyMs: {
          token: tokenMs,
          accounts: accountsMs,
          total: Date.now() - t0
        }
      }
    }

    const accounts = extractAccounts(json)
    const brokerage = accounts.find((a) => a.accountType === 'BROKERAGE')

    return {
      ok: true,
      baseUrl,
      tokenHint: maskToken(accessToken),
      expiresInSec,
      accounts,
      brokerageAccountSeq: brokerage?.accountSeq ?? accounts[0]?.accountSeq ?? null,
      latencyMs: {
        token: tokenMs,
        accounts: accountsMs,
        total: Date.now() - t0
      }
    }
  } catch (e) {
    const msg =
      e instanceof Error && e.name === 'AbortError'
        ? `계좌 요청 타임아웃 (${timeoutMs}ms)`
        : e instanceof Error
          ? e.message
          : String(e)
    return {
      ok: false,
      baseUrl,
      step: 'accounts',
      error: msg,
      latencyMs: {
        token: tokenMs,
        accounts: accountsMs || Date.now() - t0 - tokenMs,
        total: Date.now() - t0
      }
    }
  }
}
