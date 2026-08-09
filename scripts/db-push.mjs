import { config } from 'dotenv'
import { spawnSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { readFileSync } from 'node:fs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
config({ path: resolve(root, '.env') })

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL missing in .env')
  process.exit(1)
}

console.log('1) drizzle-kit push …')
const push = spawnSync(
  'pnpm',
  ['--filter', '@tosspilot/db', 'exec', 'drizzle-kit', 'push', '--force'],
  {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
    shell: true
  }
)
if (push.status !== 0) process.exit(push.status ?? 1)

console.log('2) apply RLS / auth trigger SQL …')
const require = createRequire(import.meta.url)
const postgresPath = require.resolve('postgres', {
  paths: [resolve(root, 'packages/db')]
})
const { default: postgres } = await import(pathToFileURL(postgresPath).href)
const sqlText = readFileSync(resolve(root, 'packages/db/sql/001_auth_rls.sql'), 'utf8')
const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  prepare: false,
  ssl: 'require'
})
try {
  await sql.unsafe(sqlText)
  console.log('SQL applied OK')
} catch (e) {
  console.error('SQL apply failed:', e.message || e)
  process.exit(1)
} finally {
  await sql.end({ timeout: 2 })
}

console.log('db-push complete')
