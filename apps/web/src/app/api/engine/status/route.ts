import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServerEnv } from '@/lib/env'
import {
  isLoopbackEngineUrl,
  isRunningOnVercel,
  probeEngineHealth
} from '@/lib/engine-proxy'

/**
 * GET /api/engine/status
 * Vercel ENGINE_URL 설정 진단 (로그인 필요)
 */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const env = getServerEnv()
  const probe = await probeEngineHealth()

  return NextResponse.json({
    ok: probe.reachable,
    onVercel: isRunningOnVercel(),
    engineUrl: probe.engineUrl,
    loopbackUrl: probe.loopbackUrl,
    hasInternalSecret: Boolean(env.engineInternalSecret),
    hasMasterKey: Boolean(env.credentialsMasterKey),
    reachable: probe.reachable,
    health: probe.health ?? null,
    error: probe.error ?? null,
    fix:
      isRunningOnVercel() && isLoopbackEngineUrl(probe.engineUrl)
        ? 'Vercel ENGINE_URL 을 http://(상시PC공인IP):8787 로 바꾸세요. 127.0.0.1 은 불가합니다.'
        : !probe.reachable
          ? '상시 PC 엔진 기동 · 포트포워드 · ENGINE_INTERNAL_SECRET 일치 여부를 확인하세요.'
          : null
  })
}
