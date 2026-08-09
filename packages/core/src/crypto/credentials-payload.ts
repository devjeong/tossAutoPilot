import { maskToken } from '../util/redact.js'
import { masterKeyFromEnv, openJson, sealJson } from './seal.js'

export interface TossCredentials {
  clientId: string
  clientSecret: string
}

/** UI 표시용 힌트 (평문 저장 가능) */
export function clientIdHint(clientId: string): string {
  const s = clientId.trim()
  if (s.length <= 12) return maskToken(s)
  return `${s.slice(0, 8)}…${s.slice(-4)}`
}

export function encryptCredentials(
  creds: TossCredentials,
  masterKeyEnv: string
): { clientIdEnc: string; clientSecretEnc: string; iv: string; clientIdHint: string } {
  const key = masterKeyFromEnv(masterKeyEnv)
  // clientId / secret 각각 독립 봉인 (동일 IV 재사용 금지)
  const clientIdEnc = sealJson({ v: 1, clientId: creds.clientId.trim() }, key)
  const clientSecretEnc = sealJson({ v: 1, clientSecret: creds.clientSecret.trim() }, key)
  return {
    clientIdEnc,
    clientSecretEnc,
    // 스키마 호환: 봉인 포맷이 self-contained 이므로 버전 표기만
    iv: 'aes-256-gcm-v1',
    clientIdHint: clientIdHint(creds.clientId)
  }
}

export function decryptCredentials(
  row: { clientIdEnc: string; clientSecretEnc: string },
  masterKeyEnv: string
): TossCredentials {
  const key = masterKeyFromEnv(masterKeyEnv)
  const idPart = openJson<{ clientId?: string }>(row.clientIdEnc, key)
  const secretPart = openJson<{ clientSecret?: string }>(row.clientSecretEnc, key)
  if (!idPart.clientId || !secretPart.clientSecret) {
    throw new Error('자격증명 페이로드가 손상되었습니다')
  }
  return { clientId: idPart.clientId, clientSecret: secretPart.clientSecret }
}
