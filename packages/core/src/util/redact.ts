/**
 * 로그·저널에 자격증명이 흘러 들어가는 것을 막는다 (SPEC F1.4).
 */

const SENSITIVE_KEYS = [
  'client_secret',
  'clientsecret',
  'access_token',
  'accesstoken',
  'authorization',
  'secret',
  'password',
  'token'
]

export function maskToken(value: string): string {
  if (value.length <= 8) return '***'
  return `${value.slice(0, 4)}…${value.slice(-4)} (len=${value.length})`
}

function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase().replace(/[-_]/g, '')
  return SENSITIVE_KEYS.some((s) => k.includes(s.replace(/[-_]/g, '')))
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[deep]'
  if (value === null || value === undefined) return value
  if (typeof value === 'string') {
    return value.replace(/Bearer\s+[\w.\-]+/gi, (m) => `Bearer ${maskToken(m.slice(7))}`)
  }
  if (typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1))

  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = isSensitiveKey(k) ? (typeof v === 'string' ? maskToken(v) : '***') : redact(v, depth + 1)
  }
  return out
}
