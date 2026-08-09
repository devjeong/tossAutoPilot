import { config as loadEnv } from 'dotenv'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
// apps/engine/src → monorepo root
const monorepoRoot = resolve(here, '../../..')

/** 루트·패키지 로컬 .env 로드 (cwd 무관) */
export function loadEngineEnv(): void {
  loadEnv({ path: resolve(monorepoRoot, '.env') })
  loadEnv({ path: resolve(process.cwd(), '.env') })
  loadEnv({ path: resolve(process.cwd(), '../../.env') })
  loadEnv()
}

export function getEngineConfig() {
  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || ''

  const internalSecret = process.env.ENGINE_INTERNAL_SECRET?.trim() || ''
  /** 상시 PC: 0.0.0.0 으로 LAN/포트포워드 수신. 로컬만이면 127.0.0.1 */
  const host = (process.env.ENGINE_HOST || '0.0.0.0').trim() || '0.0.0.0'
  const requireSecret =
    process.env.ENGINE_REQUIRE_SECRET === '1' ||
    process.env.ENGINE_REQUIRE_SECRET === 'true' ||
    // 외부 바인딩이면 기본 시크릿 강제 권장
    (host !== '127.0.0.1' && host !== 'localhost')

  return {
    monorepoRoot,
    host,
    port: Number(process.env.ENGINE_PORT ?? 8787),
    tickMs: Number(process.env.ENGINE_TICK_MS ?? 5000),
    heartbeatMs: Number(process.env.ENGINE_HEARTBEAT_MS ?? 10_000),
    quotesIntervalMs: Number(process.env.ENGINE_QUOTES_INTERVAL_MS ?? 5000),
    portfolioIntervalMs: Number(process.env.ENGINE_PORTFOLIO_INTERVAL_MS ?? 8000),
    supabaseUrl,
    serviceRoleKey,
    credentialsMasterKey: process.env.CREDENTIALS_MASTER_KEY?.trim() || '',
    /** 지정 시 해당 유저만 heartbeat/quotes (미지정 시 관련 전원) */
    userId: process.env.ENGINE_USER_ID?.trim() || null,
    tossBaseUrl: process.env.TOSS_BASE_URL || 'https://openapi.tossinvest.com',
    /** Vercel 웹 → 엔진 내부 API 인증 */
    internalSecret,
    /** 외부 바인딩 시 true — 시크릿 없으면 기동 거부 */
    requireSecret,
    /** 배포 모드 표기 (home-pc | local | cloud) */
    deployMode: (process.env.ENGINE_DEPLOY_MODE || 'home-pc').trim(),
    hasDb: Boolean(supabaseUrl && serviceRoleKey)
  }
}

export type EngineConfig = ReturnType<typeof getEngineConfig>
