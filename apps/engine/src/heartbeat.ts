import type { SupabaseClient } from '@supabase/supabase-js'
import type { EngineConfig } from './config.js'

export type HeartbeatResult = {
  ok: boolean
  updated: number
  error?: string
  at: string
}

/**
 * engine_status.heartbeat_at 을 갱신하고 state 를 running 으로 둔다.
 * meta 는 덮어쓰지 않는다 (연결 테스트 결과 보존).
 */
export async function pulseHeartbeat(
  supabase: SupabaseClient,
  cfg: EngineConfig,
  opts?: { state?: 'running' | 'degraded' | 'stopped'; lastError?: string | null }
): Promise<HeartbeatResult> {
  const at = new Date().toISOString()
  const state = opts?.state ?? 'running'
  const patch: Record<string, unknown> = {
    heartbeat_at: at,
    state,
    updated_at: at
  }
  if (opts?.lastError !== undefined) {
    patch.last_error = opts.lastError
  } else if (state === 'running' || state === 'stopped') {
    patch.last_error = null
  }

  // 대상 user_id 목록 (PostgREST 는 무필터 update 를 거부하는 경우가 있음)
  let userIds: string[] = []
  if (cfg.userId) {
    userIds = [cfg.userId]
  } else {
    const { data, error } = await supabase.from('engine_status').select('user_id')
    if (error) {
      return { ok: false, updated: 0, error: error.message, at }
    }
    userIds = (data ?? []).map((r) => r.user_id as string)
  }

  if (userIds.length === 0) {
    return {
      ok: true,
      updated: 0,
      error: 'no engine_status rows (signup a user first)',
      at
    }
  }

  const { data, error } = await supabase
    .from('engine_status')
    .update(patch)
    .in('user_id', userIds)
    .select('user_id')

  if (error) {
    return { ok: false, updated: 0, error: error.message, at }
  }
  return { ok: true, updated: data?.length ?? 0, at }
}

export async function markStopped(
  supabase: SupabaseClient,
  cfg: EngineConfig
): Promise<HeartbeatResult> {
  return pulseHeartbeat(supabase, cfg, { state: 'stopped', lastError: null })
}
