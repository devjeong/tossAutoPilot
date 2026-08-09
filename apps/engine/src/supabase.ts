import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { EngineConfig } from './config.js'

export function createEngineSupabase(cfg: EngineConfig): SupabaseClient | null {
  if (!cfg.supabaseUrl || !cfg.serviceRoleKey) return null
  return createClient(cfg.supabaseUrl, cfg.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}
