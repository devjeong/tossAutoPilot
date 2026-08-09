import { readFileSync } from 'node:fs'

const envPath = process.argv[2] ?? '.env'
const examplePath = '.env.example'
const raw = readFileSync(envPath, 'utf8')
const example = readFileSync(examplePath, 'utf8')

function parse(text) {
  const map = new Map()
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 0) continue
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

function mask(v) {
  if (!v) return '(empty)'
  if (v.length <= 8) return '***'
  return `${v.slice(0, 4)}…${v.slice(-4)} (len=${v.length})`
}

function isJwtLike(v) {
  return typeof v === 'string' && v.startsWith('eyJ') && v.split('.').length >= 3
}

function isHex(v, minLen) {
  return typeof v === 'string' && /^[0-9a-fA-F]+$/.test(v) && v.length >= minLen
}

function isPublishableKey(v) {
  return isJwtLike(v) || v.startsWith('sb_publishable_') || v.startsWith('sb_p')
}

function isSecretKey(v) {
  return isJwtLike(v) || v.startsWith('sb_secret_') || v.startsWith('sb_s')
}

const env = parse(raw)
const ex = parse(example)

function firstValue(aliases) {
  for (const a of aliases) {
    const v = env.get(a)
    if (v) return { key: a, value: v }
  }
  return { key: aliases[0] ?? '', value: '' }
}

/** @type {{ key: string, status: string, note: string, sample: string }[]} */
const rows = []
function add(key, status, note, sample = '') {
  rows.push({ key, status, note, sample })
}

// URL
{
  const { key, value: v } = firstValue(['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'])
  if (!v) add('NEXT_PUBLIC_SUPABASE_URL', 'FAIL', 'required missing or empty')
  else if (v.includes('xxxx') || v.includes('your-project')) {
    add(key, 'FAIL', 'placeholder not replaced', mask(v))
  } else if (!v.startsWith('https://')) add(key, 'FAIL', 'must be https URL', mask(v))
  else if (!v.includes('supabase')) add(key, 'WARN', 'URL does not look like supabase', v)
  else add(key, 'OK', 'supabase URL shape', v.replace(/\/$/, ''))
}

// public / publishable / anon
{
  const { key, value: v } = firstValue([
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY'
  ])
  if (!v) {
    add(
      'NEXT_PUBLIC_SUPABASE_ANON_KEY | PUBLISHABLE_KEY',
      'FAIL',
      'public key missing (anon JWT or sb_publishable_*)'
    )
  } else if (!isPublishableKey(v)) {
    add(key, 'WARN', 'unexpected public key format', mask(v))
  } else {
    const kind = isJwtLike(v) ? 'legacy anon JWT' : 'publishable key'
    add(key, 'OK', kind, mask(v))
  }
}

// secret / service_role
{
  const { key, value: v } = firstValue([
    'SUPABASE_SECRET_KEY',
    'SUPABASE_SERVICE_ROLE_KEY'
  ])
  const pub = firstValue([
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY'
  ]).value
  if (!v) {
    add(
      'SUPABASE_SERVICE_ROLE_KEY | SECRET_KEY',
      'FAIL',
      'secret key missing (service_role JWT or sb_secret_*)'
    )
  } else if (pub && v === pub) {
    add(key, 'FAIL', 'secret equals public key', mask(v))
  } else if (!isSecretKey(v)) {
    add(key, 'WARN', 'unexpected secret key format', mask(v))
  } else {
    const kind = isJwtLike(v) ? 'legacy service_role JWT' : 'secret key'
    add(key, 'OK', kind, mask(v))
  }
}

// DATABASE_URL
{
  const v = env.get('DATABASE_URL') ?? ''
  if (!v) add('DATABASE_URL', 'FAIL', 'required missing or empty')
  else if (!v.startsWith('postgresql://') && !v.startsWith('postgres://')) {
    add('DATABASE_URL', 'FAIL', 'must start with postgresql://', mask(v))
  } else if (/\[YOUR-PASSWORD\]|YOUR_PASSWORD|password@db\.xxxx/i.test(v)) {
    add('DATABASE_URL', 'FAIL', 'placeholder password/host', mask(v))
  } else {
    try {
      const u = new URL(v.replace(/^postgres(ql)?:/, 'http:'))
      const host = u.hostname
      const db = (u.pathname || '').replace(/^\//, '') || '(none)'
      const hasPass = Boolean(u.password)
      let note = `host=${host}; db=${db}; password=${hasPass ? 'set' : 'MISSING'}`
      if (host.includes('pooler') || u.port === '6543') note += '; pooler'
      add('DATABASE_URL', hasPass ? 'OK' : 'FAIL', note, mask(v))
    } catch {
      add('DATABASE_URL', 'FAIL', 'unparseable URL', mask(v))
    }
  }
}

// CREDENTIALS_MASTER_KEY
{
  const v = env.get('CREDENTIALS_MASTER_KEY') ?? ''
  if (!v) {
    add(
      'CREDENTIALS_MASTER_KEY',
      'FAIL',
      'missing — generate: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    )
  } else if (v.length < 32) {
    add('CREDENTIALS_MASTER_KEY', 'WARN', `short (len=${v.length}); prefer 64 hex`, mask(v))
  } else if (isHex(v, 64)) {
    add('CREDENTIALS_MASTER_KEY', 'OK', '64+ hex (32-byte key)', mask(v))
  } else {
    add('CREDENTIALS_MASTER_KEY', 'OK', `set (len=${v.length})`, mask(v))
  }
}

// ENGINE_INTERNAL_SECRET
{
  const v = env.get('ENGINE_INTERNAL_SECRET') ?? ''
  if (!v) add('ENGINE_INTERNAL_SECRET', 'FAIL', 'required missing')
  else if (v === 'change-me' || v.length < 16) {
    add('ENGINE_INTERNAL_SECRET', 'WARN', 'still default/weak — change before deploy', mask(v))
  } else add('ENGINE_INTERNAL_SECRET', 'OK', `set (len=${v.length})`, mask(v))
}

// TOSS
{
  const v = env.get('TOSS_BASE_URL') ?? ''
  if (!v) add('TOSS_BASE_URL', 'FAIL', 'required missing')
  else if (v === 'https://openapi.tossinvest.com') {
    add('TOSS_BASE_URL', 'OK', 'production Toss Open API', v)
  } else add('TOSS_BASE_URL', 'WARN', 'non-default base URL', v)
}

for (const k of ['ENGINE_URL', 'ENGINE_PORT', 'ENGINE_TICK_MS', 'ENGINE_HEARTBEAT_MS']) {
  const v = env.get(k) ?? ''
  if (!v) add(k, 'WARN', 'recommended missing')
  else add(k, 'OK', 'set', v)
}

function maskMaybeUrl(v) {
  if (!v) return '(empty)'
  if (/postgres(ql)?:\/\//i.test(v) || v.includes('://')) {
    try {
      const u = new URL(v.replace(/^postgres(ql)?:/i, 'http:'))
      if (u.password) u.password = '***'
      return u.toString().replace(/^http:/, v.startsWith('postgres://') ? 'postgres:' : 'postgresql:')
    } catch {
      return mask(v)
    }
  }
  return mask(v)
}

// extras
const known = new Set([
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SECRET_KEY',
  'DATABASE_URL',
  'DATABASE_URL_DIRECT',
  'DATABASE_SSL',
  'CREDENTIALS_MASTER_KEY',
  'ENGINE_INTERNAL_SECRET',
  'TOSS_BASE_URL',
  'ENGINE_URL',
  'ENGINE_PORT',
  'ENGINE_TICK_MS',
  'ENGINE_HEARTBEAT_MS',
  'SUPABASE_JWKS_URL'
])
for (const k of env.keys()) {
  if (known.has(k) && k !== 'DATABASE_URL_DIRECT' && k !== 'DATABASE_SSL') continue
  if (k === 'DATABASE_URL_DIRECT') {
    add(k, 'OK', 'direct (IPv6) backup kept', maskMaybeUrl(env.get(k) ?? ''))
    continue
  }
  if (k === 'DATABASE_SSL') {
    add(k, 'OK', 'set', env.get(k) ?? '')
    continue
  }
  if (known.has(k)) continue
  const v = env.get(k) ?? ''
  const sensitive = /SECRET|KEY|PASSWORD|TOKEN|DATABASE_URL|DATABASE/i.test(k)
  add(k, 'INFO', 'extra key', sensitive ? maskMaybeUrl(v) : v)
}

// JWKS info
if (env.get('SUPABASE_JWKS_URL')) {
  add('SUPABASE_JWKS_URL', 'OK', 'set (for JWT signing keys)', env.get('SUPABASE_JWKS_URL') ?? '')
}

const fails = rows.filter((r) => r.status === 'FAIL')
const warns = rows.filter((r) => r.status === 'WARN')

console.log('=== TossAutoPilot .env check ===')
console.log(`file: ${envPath}`)
console.log(`keys: ${env.size}`)
console.log('')
for (const r of rows) {
  const sample = r.sample ? `  |  ${r.sample}` : ''
  console.log(`[${r.status.padEnd(4)}] ${r.key}: ${r.note}${sample}`)
}

const missingFromExample = [...ex.keys()].filter((k) => {
  // example legacy names are satisfied by new aliases
  if (k === 'NEXT_PUBLIC_SUPABASE_ANON_KEY') {
    return !(
      env.get('NEXT_PUBLIC_SUPABASE_ANON_KEY') ||
      env.get('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') ||
      env.get('SUPABASE_PUBLISHABLE_KEY')
    )
  }
  if (k === 'SUPABASE_SERVICE_ROLE_KEY') {
    return !(env.get('SUPABASE_SERVICE_ROLE_KEY') || env.get('SUPABASE_SECRET_KEY'))
  }
  return !env.has(k)
})
if (missingFromExample.length) {
  console.log('')
  console.log('Still missing vs .env.example logical keys:', missingFromExample.join(', '))
}

console.log('')
console.log(
  fails.length === 0
    ? 'RESULT: PASS (no required failures)'
    : `RESULT: FAIL (${fails.length} required issue(s))`
)
if (warns.length) console.log(`WARN count: ${warns.length}`)

console.log('')
console.log('Load path notes:')
console.log('- Next.js: apps/web/.env.local (synced) + root .env via next.config dotenv')
console.log('- Engine: loads ../../.env via dotenv at startup')
process.exit(fails.length ? 1 : 0)
