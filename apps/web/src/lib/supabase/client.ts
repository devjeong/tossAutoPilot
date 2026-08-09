import { createBrowserClient } from '@supabase/ssr'
import { getPublicEnv } from '@/lib/env'

export function createClient() {
  const { supabaseUrl, supabaseAnonKey } = getPublicEnv()
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase 공개 환경 변수가 없습니다 (URL / ANON|PUBLISHABLE KEY)')
  }
  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}
