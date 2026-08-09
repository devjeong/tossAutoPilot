import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptCredentials, type TossCredentials } from '@tosspilot/core'

export async function loadActiveCredentials(
  supabase: SupabaseClient,
  userId: string,
  masterKeyEnv: string
): Promise<TossCredentials | null> {
  const { data, error } = await supabase
    .from('api_credentials')
    .select('client_id_enc, client_secret_enc')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null
  return decryptCredentials(
    {
      clientIdEnc: data.client_id_enc,
      clientSecretEnc: data.client_secret_enc
    },
    masterKeyEnv
  )
}

/** 활성 자격증명이 있는 유저 목록 */
export async function listUsersWithCredentials(
  supabase: SupabaseClient
): Promise<string[]> {
  const { data, error } = await supabase
    .from('api_credentials')
    .select('user_id')
    .eq('is_active', true)

  if (error) throw new Error(error.message)
  const set = new Set((data ?? []).map((r) => r.user_id as string))
  return [...set]
}
