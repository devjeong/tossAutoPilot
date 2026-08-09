import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_RISK_CONFIG } from '@tosspilot/shared'

/**
 * 로그인 직후 profile / engine_status 가 없으면 만든다.
 * (Auth trigger 가 있어도 기존 유저·실패 대비 멱등)
 */
export async function ensureUserBootstrap(
  supabase: SupabaseClient,
  userId: string,
  displayName?: string | null
) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle()

  if (!profile) {
    await supabase.from('profiles').insert({
      id: userId,
      display_name: displayName ?? null,
      risk_config: DEFAULT_RISK_CONFIG
    })
  }

  const { data: engine } = await supabase
    .from('engine_status')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (!engine) {
    await supabase.from('engine_status').insert({
      user_id: userId,
      mode: 'paper',
      state: 'stopped'
    })
  }
}
