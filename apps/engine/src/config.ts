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

  return {
    monorepoRoot,
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
    /** Vercel 웹 → 엔진 내부 API 인증 (비어 있으면 로컬 개발 허용) */
    internalSecret: process.env.ENGINE_INTERNAL_SECRET?.trim() || '',
    hasDb: Boolean(supabaseUrl && serviceRoleKey)
  }
}

export type EngineConfig = ReturnType<typeof getEngineConfig>
