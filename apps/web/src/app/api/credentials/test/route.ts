import { NextResponse } from 'next/server'
import { testTossConnection, type ConnectionTestResult } from '@tosspilot/core'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadDecryptedCredentials } from '@/lib/credentials-store'
import { getServerEnv } from '@/lib/env'

type Body = {
  /** 저장본 대신 폼에 입력한 값으로 테스트 (저장 전 검증) */
  clientId?: string
  clientSecret?: string
  /** 성공 시 engine_status.active_account_seq 갱신 (기본 true) */
  bindAccount?: boolean
}

/**
 * POST /api/credentials/test
 * 실 토스 API: OAuth 토큰 발급 → GET /accounts
 * 응답에 access_token / secret 원문 없음.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  let body: Body = {}
  try {
    body = (await request.json()) as Body
  } catch {
    body = {}
  }

  const baseUrl = process.env.TOSS_BASE_URL || 'https://openapi.tossinvest.com'

  let clientId = body.clientId?.trim() ?? ''
  let clientSecret = body.clientSecret?.trim() ?? ''

  // 폼이 비어 있으면 저장된 자격증명 복호화
  if (!clientId || !clientSecret) {
    try {
      const saved = await loadDecryptedCredentials(user.id)
      if (!saved) {
        return NextResponse.json(
          {
            ok: false,
            error: '저장된 자격증명이 없습니다. Client ID/Secret 을 입력하거나 먼저 저장하세요.'
          },
          { status: 400 }
        )
      }
      clientId = saved.clientId
      clientSecret = saved.clientSecret
    } catch (e) {
      return NextResponse.json(
        {
          ok: false,
          error: e instanceof Error ? e.message : String(e)
        },
        { status: 500 }
      )
    }
  }

  const result: ConnectionTestResult = await testTossConnection({
    credentials: { clientId, clientSecret },
    baseUrl,
    timeoutMs: 15_000
  })

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        step: result.step,
        error: result.error,
        status: result.status,
        baseUrl: result.baseUrl,
        latencyMs: result.latencyMs
      },
      { status: 200 }
    )
  }

  // 성공 시 엔진 상태에 계좌·연결 메모 반영 (service_role)
  const bind = body.bindAccount !== false
  let bound = false
  if (bind && result.brokerageAccountSeq != null) {
    try {
      const admin = createAdminClient()
      const now = new Date().toISOString()
      const { error } = await admin
        .from('engine_status')
        .update({
          active_account_seq: result.brokerageAccountSeq,
          last_error: null,
          meta: {
            lastConnectionTestAt: now,
            lastConnectionOk: true,
            tokenExpiresInSec: result.expiresInSec,
            accountCount: result.accounts.length
          },
          updated_at: now
        })
        .eq('user_id', user.id)
      if (!error) bound = true
    } catch {
      /* bind 실패는 테스트 성공과 분리 */
    }
  }

  // master key 존재 여부만 힌트 (값 노출 금지)
  const hasMaster = Boolean(getServerEnv().credentialsMasterKey)

  return NextResponse.json({
    ok: true,
    baseUrl: result.baseUrl,
    tokenHint: result.tokenHint,
    expiresInSec: result.expiresInSec,
    accounts: result.accounts.map((a) => ({
      accountNo: maskAccountNo(a.accountNo),
      accountSeq: a.accountSeq,
      accountType: a.accountType
    })),
    brokerageAccountSeq: result.brokerageAccountSeq,
    latencyMs: result.latencyMs,
    boundAccount: bound,
    hasMasterKey: hasMaster
  })
}

function maskAccountNo(no: string): string {
  const s = no.trim()
  if (s.length <= 6) return '***'
  return `${s.slice(0, 3)}…${s.slice(-3)}`
}
