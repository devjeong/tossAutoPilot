/**
 * AES-256-GCM 봉인 (at-rest 자격증명).
 * 포맷: base64( iv[12] || tag[16] || ciphertext )
 * 키: 32바이트 (CREDENTIALS_MASTER_KEY hex 64자 또는 raw 32바이트)
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto'

const IV_LEN = 12
const TAG_LEN = 16
const KEY_LEN = 32

export function masterKeyFromEnv(raw: string): Buffer {
  const s = raw.trim()
  if (!s) throw new Error('CREDENTIALS_MASTER_KEY 가 비어 있습니다')

  // 64 hex → 32 bytes
  if (/^[0-9a-fA-F]{64}$/.test(s)) {
    return Buffer.from(s, 'hex')
  }
  // base64 32 bytes
  try {
    const b = Buffer.from(s, 'base64')
    if (b.length === KEY_LEN) return b
  } catch {
    /* fall through */
  }
  // 그 외: SHA-256 으로 32바이트 유도 (로컬 개발 편의 — 프로덕션은 hex 권장)
  return createHash('sha256').update(s, 'utf8').digest()
}

/** 평문 → 봉인 문자열 */
export function seal(plaintext: string, masterKey: Buffer): string {
  if (masterKey.length !== KEY_LEN) {
    throw new Error(`master key must be ${KEY_LEN} bytes`)
  }
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv('aes-256-gcm', masterKey, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

/** 봉인 문자열 → 평문 */
export function open(sealed: string, masterKey: Buffer): string {
  if (masterKey.length !== KEY_LEN) {
    throw new Error(`master key must be ${KEY_LEN} bytes`)
  }
  const buf = Buffer.from(sealed, 'base64')
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new Error('invalid sealed payload')
  }
  const iv = buf.subarray(0, IV_LEN)
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN)
  const data = buf.subarray(IV_LEN + TAG_LEN)
  const decipher = createDecipheriv('aes-256-gcm', masterKey, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

export function sealJson(value: unknown, masterKey: Buffer): string {
  return seal(JSON.stringify(value), masterKey)
}

export function openJson<T>(sealed: string, masterKey: Buffer): T {
  return JSON.parse(open(sealed, masterKey)) as T
}
