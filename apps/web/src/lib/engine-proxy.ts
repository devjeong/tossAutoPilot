/**
 * 토스 시세/캔들은 Vercel egress IP 가 허용 목록에 없어 실패하는 경우가 많다.
 * ENGINE_URL 로 상주 엔진(허용 IP)에 프록시한다.
 */
import { getServerEnv } from '@/lib/env'

export type EngineProxyResult<T> =
  | { ok: true; data: T; via: 'engine' }
  | { ok: false; error: string; status: number; unreachable?: boolean }

function authHeaders(): Record<string, string> {
  const env = getServerEnv()
  const h: Record<string, string> = { 'content-type': 'application/json' }
  if (env.engineInternalSecret) {
    h['x-engine-secret'] = env.engineInternalSecret
  }
  return h
}

export function engineBaseUrl(): string {
  return getServerEnv().engineUrl.replace(/\/$/, '') || 'http://127.0.0.1:8787'
}

export async function engineFetchJson<T>(
  path: string,
  init?: RequestInit
): Promise<EngineProxyResult<T>> {
  const url = `${engineBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`
  try {
    const res = await fetch(url, {
      ...init,
      headers: { ...authHeaders(), ...(init?.headers as Record<string, string>) },
      // 캔들 다중 페이지는 수 초 걸릴 수 있음
      signal: AbortSignal.timeout(60_000)
    })
    const data = (await res.json().catch(() => ({}))) as T & {
      ok?: boolean
      error?: string
    }
    if (!res.ok || (data && typeof data === 'object' && 'ok' in data && data.ok === false)) {
      return {
        ok: false,
        error:
          (data && typeof data === 'object' && 'error' in data && data.error
            ? String(data.error)
            : `engine HTTP ${res.status}`) || `engine HTTP ${res.status}`,
        status: res.status
      }
    }
    return { ok: true, data: data as T, via: 'engine' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      error: `엔진 연결 실패 (${engineBaseUrl()}): ${msg}. 로컬/허용IP 에서 pnpm dev:engine 을 실행하고 ENGINE_URL 을 확인하세요.`,
      status: 503,
      unreachable: true
    }
  }
}

export function isIpBlockedError(msg: string): boolean {
  return /ip address not allowed|ip not allowed|not allowed.*ip/i.test(msg)
}

export function ipBlockedHelp(msg: string): string {
  return (
    `${msg}\n\n` +
    `원인: 토스 Open API 는 등록한 IP 에서만 호출됩니다. ` +
    `Vercel 서버 IP 는 보통 허용 목록에 없습니다.\n` +
    `해결: 허용 IP PC/서버에서 엔진을 실행한 뒤, 웹의 ENGINE_URL 이 그 엔진을 가리키게 하세요. ` +
    `(로컬: ENGINE_URL=http://127.0.0.1:8787 과 함께 엔진 기동)`
  )
}
