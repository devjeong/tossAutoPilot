/**
 * 토스 시세/캔들은 Vercel egress IP 가 허용 목록에 없어 실패하는 경우가 많다.
 * ENGINE_URL 로 상주 엔진(허용 IP)에 프록시한다.
 */
import { getServerEnv } from '@/lib/env'

export type EngineProxyResult<T> =
  | { ok: true; data: T; via: 'engine' }
  | { ok: false; error: string; status: number; unreachable?: boolean; misconfigured?: boolean }

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

export function isRunningOnVercel(): boolean {
  return process.env.VERCEL === '1' || process.env.VERCEL === 'true'
}

/** Vercel 등 원격 서버에서 127.0.0.1 엔진 URL 은 항상 실패 */
export function isLoopbackEngineUrl(url: string): boolean {
  try {
    const u = new URL(url)
    const h = u.hostname.toLowerCase()
    return h === '127.0.0.1' || h === 'localhost' || h === '::1' || h === '0.0.0.0'
  } catch {
    return /127\.0\.0\.1|localhost/i.test(url)
  }
}

/**
 * 로컬 Next(개발)에서만 엔진 실패 시 웹→토스 직접 호출 허용.
 * Vercel 에서는 직접 호출이 IP 차단되므로 금지.
 */
export function allowWebDirectToss(): boolean {
  if (isRunningOnVercel()) return false
  if (process.env.ENGINE_ALLOW_WEB_DIRECT === '0') return false
  if (process.env.ENGINE_ALLOW_WEB_DIRECT === '1') return true
  // 로컬 개발 기본 허용
  return process.env.NODE_ENV !== 'production' || !isRunningOnVercel()
}

export function engineMisconfigHelp(base: string): string {
  const onVercel = isRunningOnVercel()
  if (onVercel && isLoopbackEngineUrl(base)) {
    return [
      `ENGINE_URL 이 ${base} 입니다. Vercel 에서는 이 주소가 "Vercel 자신의 localhost" 를 가리키므로 집 PC 엔진에 절대 연결되지 않습니다.`,
      '',
      '해야 할 일:',
      '1) 상시 PC 에서 엔진 실행 (pnpm engine:home)',
      '2) 공인 IP 확인: pnpm engine:ip  → 토스 허용 IP 등록',
      '3) 공유기에서 외부 8787 → PC 8787 포트포워드 (인바운드 방화벽은 이미 하셨다면 OK)',
      '4) Vercel 환경변수 ENGINE_URL = http://(공인IP):8787   ← 127.0.0.1 금지',
      '5) ENGINE_INTERNAL_SECRET = 상시 PC .env 와 동일',
      '6) Vercel Redeploy 후 다시 차트 로드',
      '',
      '더 안전: Cloudflare Tunnel 공개 URL 을 ENGINE_URL 로 사용 (docs/DEPLOY_HOME_ENGINE.md)'
    ].join('\n')
  }
  return [
    `엔진 연결 실패: ${base}`,
    '',
    '확인:',
    '1) 상시 PC 엔진 실행 중인가? → http://127.0.0.1:8787/health (PC 로컬)',
    '2) Vercel ENGINE_URL 이 그 PC 의 공인IP:8787 또는 터널 URL 인가?',
    '3) ENGINE_INTERNAL_SECRET 이 PC 와 Vercel 에서 동일한가?',
    '4) 공유기 포트포워드 / PC 방화벽 8787 인바운드',
    '5) 토스 허용 IP = 상시 PC 공인 IP (pnpm engine:ip)'
  ].join('\n')
}

export async function engineFetchJson<T>(
  path: string,
  init?: RequestInit
): Promise<EngineProxyResult<T>> {
  const base = engineBaseUrl()

  if (isRunningOnVercel() && isLoopbackEngineUrl(base)) {
    return {
      ok: false,
      error: engineMisconfigHelp(base),
      status: 503,
      unreachable: true,
      misconfigured: true
    }
  }

  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`
  try {
    const res = await fetch(url, {
      ...init,
      headers: { ...authHeaders(), ...(init?.headers as Record<string, string>) },
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
      error: `${engineMisconfigHelp(base)}\n\n(상세: ${msg})`,
      status: 503,
      unreachable: true
    }
  }
}

export async function probeEngineHealth(): Promise<{
  engineUrl: string
  onVercel: boolean
  loopbackUrl: boolean
  reachable: boolean
  health?: unknown
  error?: string
}> {
  const engineUrl = engineBaseUrl()
  const onVercel = isRunningOnVercel()
  const loopbackUrl = isLoopbackEngineUrl(engineUrl)

  if (onVercel && loopbackUrl) {
    return {
      engineUrl,
      onVercel,
      loopbackUrl,
      reachable: false,
      error: engineMisconfigHelp(engineUrl)
    }
  }

  try {
    const res = await fetch(`${engineUrl}/health`, {
      signal: AbortSignal.timeout(8_000)
    })
    const health = await res.json().catch(() => null)
    return {
      engineUrl,
      onVercel,
      loopbackUrl,
      reachable: res.ok,
      health,
      error: res.ok ? undefined : `health HTTP ${res.status}`
    }
  } catch (e) {
    return {
      engineUrl,
      onVercel,
      loopbackUrl,
      reachable: false,
      error: e instanceof Error ? e.message : String(e)
    }
  }
}

export function isIpBlockedError(msg: string): boolean {
  return /ip address not allowed|ip not allowed|not allowed.*ip/i.test(msg)
}

export function ipBlockedHelp(msg: string): string {
  return (
    `${msg}\n\n` +
    `원인: 토스 호출이 허용 IP 가 아닌 곳(예: Vercel)에서 나갔습니다.\n` +
    `해결: 차트/시세는 반드시 상시 PC 엔진 경유.\n` +
    `Vercel ENGINE_URL = http://(공인IP):8787  (127.0.0.1 사용 금지)`
  )
}
