/**
 * root .env 를 앱이 쓰기 좋게 정규화한다.
 * - 신규 Supabase 키 → 레거시 별칭 추가
 * - apps/web/.env.local 동기화
 * - 값 내용은 로그에 남기지 않음
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const envPath = join(root, '.env')

function parseLines(text) {
  /** @type {{ raw: string, key?: string, value?: string, isKv: boolean }[]} */
  const lines = []
  for (const raw of text.split(/\r?\n/)) {
    const t = raw.trim()
    if (!t || t.startsWith('#') || !t.includes('=')) {
      lines.push({ raw, isKv: false })
      continue
    }
    const i = t.indexOf('=')
    const key = t.slice(0, i).trim()
    let value = t.slice(i + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    lines.push({ raw, key, value, isKv: true })
  }
  return lines
}

function getMap(lines) {
  const m = new Map()
  for (const l of lines) {
    if (l.isKv && l.key) m.set(l.key, l.value ?? '')
  }
  return m
}

function upsert(lines, key, value) {
  const idx = lines.findIndex((l) => l.isKv && l.key === key)
  const raw = `${key}=${value}`
  if (idx >= 0) {
    lines[idx] = { raw, key, value, isKv: true }
  } else {
    lines.push({ raw, key, value, isKv: true })
  }
}

function serialize(lines) {
  // 마지막 빈 줄 정리
  while (lines.length && lines[lines.length - 1]?.raw === '') lines.pop()
  return lines.map((l) => l.raw).join('\n') + '\n'
}

if (!existsSync(envPath)) {
  console.error('missing .env')
  process.exit(1)
}

const original = readFileSync(envPath, 'utf8')
const lines = parseLines(original)
const map = getMap(lines)
const changes = []

const url = map.get('NEXT_PUBLIC_SUPABASE_URL') || map.get('SUPABASE_URL') || ''
const pub =
  map.get('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') ||
  map.get('SUPABASE_PUBLISHABLE_KEY') ||
  map.get('NEXT_PUBLIC_SUPABASE_ANON_KEY') ||
  ''
const secret =
  map.get('SUPABASE_SECRET_KEY') || map.get('SUPABASE_SERVICE_ROLE_KEY') || ''

if (url) {
  if (map.get('NEXT_PUBLIC_SUPABASE_URL') !== url) {
    upsert(lines, 'NEXT_PUBLIC_SUPABASE_URL', url)
    changes.push('set NEXT_PUBLIC_SUPABASE_URL from SUPABASE_URL')
  }
  if (map.get('SUPABASE_URL') !== url) {
    upsert(lines, 'SUPABASE_URL', url)
    changes.push('set SUPABASE_URL alias')
  }
}

if (pub) {
  if (!map.get('NEXT_PUBLIC_SUPABASE_ANON_KEY')) {
    upsert(lines, 'NEXT_PUBLIC_SUPABASE_ANON_KEY', pub)
    changes.push('alias NEXT_PUBLIC_SUPABASE_ANON_KEY ← publishable')
  }
  if (!map.get('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')) {
    upsert(lines, 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', pub)
    changes.push('ensure NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
  }
}

if (secret) {
  if (!map.get('SUPABASE_SERVICE_ROLE_KEY')) {
    upsert(lines, 'SUPABASE_SERVICE_ROLE_KEY', secret)
    changes.push('alias SUPABASE_SERVICE_ROLE_KEY ← secret')
  }
  if (!map.get('SUPABASE_SECRET_KEY')) {
    upsert(lines, 'SUPABASE_SECRET_KEY', secret)
    changes.push('ensure SUPABASE_SECRET_KEY')
  }
}

// master / engine secret 존재만 확인
if (!map.get('CREDENTIALS_MASTER_KEY')) {
  console.error('CREDENTIALS_MASTER_KEY still missing — not inventing without confirm')
  process.exit(1)
}
if (!map.get('ENGINE_INTERNAL_SECRET') || map.get('ENGINE_INTERNAL_SECRET') === 'change-me') {
  console.error('ENGINE_INTERNAL_SECRET still weak — not auto-overwriting existing file value')
  // if empty only
}

const next = serialize(lines)
if (next !== original) {
  writeFileSync(envPath, next, 'utf8')
  console.log('updated root .env')
} else {
  console.log('root .env already normalized')
}

// apps/web/.env.local — Next 전용 공개/서버 키
const webEnvPath = join(root, 'apps/web/.env.local')
const m2 = getMap(parseLines(readFileSync(envPath, 'utf8')))
const webLines = [
  '# Auto-synced from monorepo root .env — do not edit by hand',
  `# generated ${new Date().toISOString()}`,
  `NEXT_PUBLIC_SUPABASE_URL=${m2.get('NEXT_PUBLIC_SUPABASE_URL') || m2.get('SUPABASE_URL') || ''}`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY=${m2.get('NEXT_PUBLIC_SUPABASE_ANON_KEY') || m2.get('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') || ''}`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${m2.get('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') || m2.get('NEXT_PUBLIC_SUPABASE_ANON_KEY') || ''}`,
  `SUPABASE_SERVICE_ROLE_KEY=${m2.get('SUPABASE_SERVICE_ROLE_KEY') || m2.get('SUPABASE_SECRET_KEY') || ''}`,
  `SUPABASE_SECRET_KEY=${m2.get('SUPABASE_SECRET_KEY') || m2.get('SUPABASE_SERVICE_ROLE_KEY') || ''}`,
  `DATABASE_URL=${m2.get('DATABASE_URL') || ''}`,
  `CREDENTIALS_MASTER_KEY=${m2.get('CREDENTIALS_MASTER_KEY') || ''}`,
  `ENGINE_INTERNAL_SECRET=${m2.get('ENGINE_INTERNAL_SECRET') || ''}`,
  `ENGINE_URL=${m2.get('ENGINE_URL') || 'http://127.0.0.1:8787'}`,
  `TOSS_BASE_URL=${m2.get('TOSS_BASE_URL') || 'https://openapi.tossinvest.com'}`,
  ''
]
writeFileSync(webEnvPath, webLines.join('\n'), 'utf8')
changes.push('wrote apps/web/.env.local')

console.log('changes:')
for (const c of changes) console.log(' -', c)
