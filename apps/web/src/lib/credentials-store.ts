import { encryptCredentials, type TossCredentials } from '@tosspilot/core'
import { createAdminClient } from '@/lib/supabase/admin'
import { getServerEnv } from '@/lib/env'
import type { CredentialStatus } from '@/lib/credentials-types'

export type { CredentialStatus }

export async function getCredentialStatus(userId: string): Promise<CredentialStatus> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('api_credentials')
    .select('client_id_hint, is_active, updated_at')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) {
    return { hasCredentials: false, clientIdHint: null, updatedAt: null, isActive: false }
  }
  return {
    hasCredentials: true,
    clientIdHint: data.client_id_hint,
    updatedAt: data.updated_at,
    isActive: data.is_active
  }
}

export async function saveCredentials(userId: string, creds: TossCredentials): Promise<CredentialStatus> {
  const master = getServerEnv().credentialsMasterKey
  if (!master) throw new Error('CREDENTIALS_MASTER_KEY 가 설정되지 않았습니다')

  const clientId = creds.clientId.trim()
  const clientSecret = creds.clientSecret.trim()
  if (!clientId || !clientSecret) {
    throw new Error('Client ID 와 Client Secret 을 모두 입력하세요')
  }

  const sealed = encryptCredentials({ clientId, clientSecret }, master)
  const admin = createAdminClient()
  const now = new Date().toISOString()

  // 기존 active 비활성 후 신규 삽입 (이력 보존)
  await admin
    .from('api_credentials')
    .update({ is_active: false, updated_at: now })
    .eq('user_id', userId)
    .eq('is_active', true)

  const { error } = await admin.from('api_credentials').insert({
    user_id: userId,
    client_id_hint: sealed.clientIdHint,
    client_id_enc: sealed.clientIdEnc,
    client_secret_enc: sealed.clientSecretEnc,
    iv: sealed.iv,
    is_active: true,
    created_at: now,
    updated_at: now
  })

  if (error) throw new Error(error.message)

  return {
    hasCredentials: true,
    clientIdHint: sealed.clientIdHint,
    updatedAt: now,
    isActive: true
  }
}

export async function clearCredentials(userId: string): Promise<void> {
  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { error } = await admin
    .from('api_credentials')
    .update({ is_active: false, updated_at: now })
    .eq('user_id', userId)
    .eq('is_active', true)
  if (error) throw new Error(error.message)
}

/** Worker 전용 — 복호화된 자격증명. 웹 UI 경로에서는 호출하지 않는다. */
export async function loadDecryptedCredentials(
  userId: string
): Promise<TossCredentials | null> {
  const master = getServerEnv().credentialsMasterKey
  if (!master) throw new Error('CREDENTIALS_MASTER_KEY 가 설정되지 않았습니다')

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('api_credentials')
    .select('client_id_enc, client_secret_enc')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null

  const { decryptCredentials } = await import('@tosspilot/core')
  return decryptCredentials(
    { clientIdEnc: data.client_id_enc, clientSecretEnc: data.client_secret_enc },
    master
  )
}
