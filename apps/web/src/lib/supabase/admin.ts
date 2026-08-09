import { createClient } from '@supabase/supabase-js'
import { getServerEnv } from '@/lib/env'

/**
 * service_role / secret 키 클라이언트.
 * RLS 우회 — 서버 Route Handler 에서만 사용. 브라우저 금지.
 */
export function createAdminClient() {
  const { supabaseUrl, serviceRoleKey } = getServerEnv()
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL / SERVICE_ROLE|SECRET 키가 없습니다')
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}
