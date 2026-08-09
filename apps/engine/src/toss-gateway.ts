/**
 * 웹 → 엔진 토스 전용 게이트웨이.
 * 모든 토스 HTTP 는 이 프로세스(허용 IP)에서만 나간다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  testTossConnection,
  writeMarketBrief,
  writeStockBrief,
  type ReportKind
} from '@tosspilot/core'
import type { EngineConfig } from './config.js'
import { loadActiveCredentials } from './credentials.js'

function maskAccountNo(no: string): string {
  const s = no.trim()
  if (s.length <= 6) return '***'
  return `${s.slice(0, 3)}…${s.slice(-3)}`
}

/** 연결 테스트 + (옵션) active_account_seq 바인딩 */
export async function handleConnectionTest(opts: {
  supabase: SupabaseClient
  config: EngineConfig
  masterKey: string
  userId: string
  clientId?: string
  clientSecret?: string
  bindAccount?: boolean
}): Promise<{ status: number; body: unknown }> {
  let clientId = opts.clientId?.trim() ?? ''
  let clientSecret = opts.clientSecret?.trim() ?? ''

  if (!clientId || !clientSecret) {
    if (!opts.masterKey) {
      return {
        status: 500,
        body: { ok: false, error: 'CREDENTIALS_MASTER_KEY missing on engine' }
      }
    }
    try {
      const saved = await loadActiveCredentials(
        opts.supabase,
        opts.userId,
        opts.masterKey
      )
      if (!saved) {
        return {
          status: 400,
          body: {
            ok: false,
            error: '저장된 자격증명이 없습니다. Client ID/Secret 을 입력하거나 먼저 저장하세요.'
          }
        }
      }
      clientId = saved.clientId
      clientSecret = saved.clientSecret
    } catch (e) {
      return {
        status: 500,
        body: { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    }
  }

  const result = await testTossConnection({
    credentials: { clientId, clientSecret },
    baseUrl: opts.config.tossBaseUrl,
    timeoutMs: 15_000
  })

  if (!result.ok) {
    return {
      status: 200,
      body: {
        ok: false,
        step: result.step,
        error: result.error,
        status: result.status,
        baseUrl: result.baseUrl,
        latencyMs: result.latencyMs,
        via: 'engine'
      }
    }
  }

  const bind = opts.bindAccount !== false
  let bound = false
  if (bind && result.brokerageAccountSeq != null) {
    const now = new Date().toISOString()
    const { error } = await opts.supabase
      .from('engine_status')
      .update({
        active_account_seq: result.brokerageAccountSeq,
        last_error: null,
        meta: {
          lastConnectionTestAt: now,
          lastConnectionOk: true,
          tokenExpiresInSec: result.expiresInSec,
          accountCount: result.accounts.length,
          via: 'engine'
        },
        updated_at: now
      })
      .eq('user_id', opts.userId)
    if (!error) bound = true
  }

  return {
    status: 200,
    body: {
      ok: true,
      via: 'engine',
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
      hasMasterKey: Boolean(opts.masterKey)
    }
  }
}

/** 시황/종목 보고서 생성 (토스 수집은 엔진에서) */
export async function handleReportGenerate(opts: {
  supabase: SupabaseClient
  config: EngineConfig
  masterKey: string
  userId: string
  kind: string
  symbol?: string
}): Promise<{ status: number; body: unknown }> {
  if (!opts.masterKey) {
    return {
      status: 500,
      body: { ok: false, error: 'CREDENTIALS_MASTER_KEY missing on engine' }
    }
  }

  const creds = await loadActiveCredentials(
    opts.supabase,
    opts.userId,
    opts.masterKey
  )
  if (!creds) {
    return {
      status: 400,
      body: { ok: false, error: '활성 API 키 없음 — 설정에서 등록하세요' }
    }
  }

  const { TossClient } = await import('@tosspilot/core')
  const client = new TossClient({
    baseUrl: opts.config.tossBaseUrl,
    credentials: creds
  })

  // 계좌 컨텍스트가 필요한 수집이 있으면 accountSeq 설정
  const { data: engine } = await opts.supabase
    .from('engine_status')
    .select('active_account_seq')
    .eq('user_id', opts.userId)
    .maybeSingle()
  if (engine?.active_account_seq != null) {
    client.setAccountSeq(engine.active_account_seq as number)
  }

  try {
    const kind = opts.kind as ReportKind
    let result
    if (kind === 'stock_brief') {
      const symbol = opts.symbol?.trim()
      if (!symbol) {
        return { status: 400, body: { ok: false, error: 'symbol required for stock_brief' } }
      }
      result = await writeStockBrief({
        client,
        symbol,
        includeNewsFetch: true,
        env: process.env as Record<string, string | undefined>
      })
    } else {
      result = await writeMarketBrief({
        client,
        kind: kind === 'market_brief_kr' || kind === 'market_brief_us' || kind === 'market_brief_both'
          ? kind
          : 'market_brief_both',
        env: process.env as Record<string, string | undefined>
      })
    }

    const now = new Date().toISOString()
    const { data, error } = await opts.supabase
      .from('market_reports')
      .insert({
        user_id: opts.userId,
        kind: result.kind,
        status: 'completed',
        title: result.title,
        body_markdown: result.bodyMarkdown,
        provider: result.provider,
        model: result.model,
        kadara_count: result.kadaraCount,
        payload: {
          sources: result.sources,
          evidence: result.evidence,
          tables: result.tables,
          symbol: result.symbol
        },
        created_at: now,
        updated_at: now
      })
      .select('id')
      .single()

    if (error) {
      return { status: 500, body: { ok: false, error: error.message, via: 'engine' } }
    }

    return {
      status: 200,
      body: {
        ok: true,
        via: 'engine',
        id: data?.id,
        title: result.title,
        provider: result.provider,
        kind: result.kind
      }
    }
  } catch (e) {
    return {
      status: 502,
      body: {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        via: 'engine'
      }
    }
  }
}
