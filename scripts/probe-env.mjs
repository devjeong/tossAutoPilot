import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))

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

const env = parse(readFileSync('.env', 'utf8'))
const url = (env.get('NEXT_PUBLIC_SUPABASE_URL') || env.get('SUPABASE_URL') || '').replace(
  /\/$/,
  ''
)
const pub =
  env.get('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') ||
  env.get('SUPABASE_PUBLISHABLE_KEY') ||
  env.get('NEXT_PUBLIC_SUPABASE_ANON_KEY') ||
  ''
const secret = env.get('SUPABASE_SECRET_KEY') || env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const db = env.get('DATABASE_URL') || ''

console.log('url_set', Boolean(url))
console.log('pub_set', Boolean(pub), 'prefix', pub.slice(0, 6), 'len', pub.length)
console.log('secret_set', Boolean(secret), 'prefix', secret.slice(0, 6), 'len', secret.length)
console.log('pub_eq_secret', pub && secret ? pub === secret : null)
console.log('master_key_set', Boolean(env.get('CREDENTIALS_MASTER_KEY')))
console.log(
  'engine_secret',
  env.get('ENGINE_INTERNAL_SECRET') === 'change-me' ? 'default(change-me)' : 'custom'
)

if (url && pub) {
  try {
    const r = await fetch(`${url}/auth/v1/health`, { headers: { apikey: pub } })
    console.log('auth_health', r.status, (await r.text()).slice(0, 100))
  } catch (e) {
    console.log('auth_health_error', String(e.message || e))
  }
}

if (url && secret) {
  try {
    const r = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: secret, Authorization: `Bearer ${secret}` }
    })
    console.log('rest_secret', r.status)
  } catch (e) {
    console.log('rest_secret_error', String(e.message || e))
  }
}

if (db) {
  try {
    const postgresPath = require.resolve('postgres', {
      paths: [join(__dirname, '../packages/db')]
    })
    const { default: postgres } = await import(pathToFileURL(postgresPath).href)
    const sql = postgres(db, { max: 1, connect_timeout: 10, prepare: false })
    const rows = await sql`select current_database() as db, current_user as usr`
    console.log('db_connect', 'OK', rows[0])
    await sql.end({ timeout: 2 })
  } catch (e) {
    console.log('db_connect', 'FAIL', String(e.message || e).slice(0, 240))
  }
}
