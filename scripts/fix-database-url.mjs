/**
 * Supabase Direct DB 가 IPv6-only 인 환경에서 pooler(IPv4) URL 로 교체한다.
 * 성공한 URI 만 .env 에 반영.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const envPath = join(root, '.env')
const require = createRequire(import.meta.url)

function parseEnv(text) {
  const map = new Map()
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#') || !t.includes('=')) continue
    const i = t.indexOf('=')
    const k = t.slice(0, i).trim()
    let v = t.slice(i + 1).trim()
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    map.set(k, v)
  }
  return map
}

function setEnvKey(text, key, value) {
  const lines = text.split(/\r?\n/)
  let found = false
  const out = lines.map((line) => {
    const t = line.trim()
    if (!t || t.startsWith('#') || !t.includes('=')) return line
    const i = t.indexOf('=')
    const k = t.slice(0, i).trim()
    if (k !== key) return line
    found = true
    return `${key}=${value}`
  })
  if (!found) out.push(`${key}=${value}`)
  while (out.length && out[out.length - 1] === '') out.pop()
  return out.join('\n') + '\n'
}

const raw = readFileSync(envPath, 'utf8')
const env = parseEnv(raw)
const dbUrl = env.get('DATABASE_URL')
if (!dbUrl) {
  console.error('DATABASE_URL missing')
  process.exit(1)
}

let password = ''
let projectRef = ''
try {
  const u = new URL(dbUrl.replace(/^postgres(ql)?:/, 'http:'))
  password = decodeURIComponent(u.password || '')
  const host = u.hostname
  const m = host.match(/^db\.([a-z0-9]+)\.supabase\.co$/i)
  if (m) projectRef = m[1]
  // also accept already-pooler user postgres.ref
  const user = decodeURIComponent(u.username || '')
  if (!projectRef && user.startsWith('postgres.')) {
    projectRef = user.slice('postgres.'.length)
  }
} catch (e) {
  console.error('parse DATABASE_URL failed', e.message)
  process.exit(1)
}

if (!password || !projectRef) {
  console.error('could not extract password/projectRef from DATABASE_URL')
  process.exit(1)
}

const postgresPath = require.resolve('postgres', {
  paths: [join(root, 'packages/db')]
})
const { default: postgres } = await import(pathToFileURL(postgresPath).href)

const regions = [
  'ap-northeast-2',
  'ap-northeast-1',
  'ap-southeast-1',
  'ap-southeast-2',
  'us-east-1',
  'us-west-1',
  'eu-west-1',
  'eu-central-1'
]

const candidates = []
// keep original first
candidates.push({ label: 'direct', url: dbUrl })

for (const region of regions) {
  const host = `aws-0-${region}.pooler.supabase.com`
  // Session mode (5432) and Transaction mode (6543)
  for (const port of [5432, 6543]) {
    const user = encodeURIComponent(`postgres.${projectRef}`)
    const pass = encodeURIComponent(password)
    const url = `postgresql://${user}:${pass}@${host}:${port}/postgres?sslmode=require`
    candidates.push({ label: `${region}:${port}`, url })
  }
}

async function tryConnect(url) {
  const sql = postgres(url, {
    max: 1,
    connect_timeout: 8,
    prepare: false,
    ssl: 'require'
  })
  try {
    const rows = await sql`select current_database() as db, current_user as usr`
    await sql.end({ timeout: 2 })
    return { ok: true, rows: rows[0] }
  } catch (e) {
    try {
      await sql.end({ timeout: 1 })
    } catch {
      /* ignore */
    }
    return { ok: false, error: String(e.message || e).slice(0, 160) }
  }
}

console.log(`project_ref=${projectRef}`)
console.log(`candidates=${candidates.length}`)

let winner = null
for (const c of candidates) {
  process.stdout.write(`try ${c.label} ... `)
  const r = await tryConnect(c.url)
  if (r.ok) {
    console.log('OK', r.rows)
    winner = c
    break
  }
  console.log('FAIL', r.error)
}

if (!winner) {
  console.error('no working DATABASE_URL candidate')
  process.exit(2)
}

if (winner.label === 'direct') {
  console.log('direct connection works — no change')
  process.exit(0)
}

// also store original for reference
let next = raw
if (!env.get('DATABASE_URL_DIRECT')) {
  next = setEnvKey(next, 'DATABASE_URL_DIRECT', dbUrl)
}
next = setEnvKey(next, 'DATABASE_URL', winner.url)
// drizzle/supabase often want this for pooler
if (!env.get('DATABASE_SSL')) {
  next = setEnvKey(next, 'DATABASE_SSL', 'require')
}

writeFileSync(envPath, next, 'utf8')
console.log(`updated DATABASE_URL → pooler ${winner.label}`)
console.log('previous direct URL saved as DATABASE_URL_DIRECT')
