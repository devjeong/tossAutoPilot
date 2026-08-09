import { config } from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
config({ path: resolve(root, '.env') })

const file = process.argv[2] || 'packages/db/sql/001_auth_rls.sql'
const sqlText = readFileSync(resolve(root, file), 'utf8')

const require = createRequire(import.meta.url)
const postgresPath = require.resolve('postgres', {
  paths: [resolve(root, 'packages/db')]
})
const { default: postgres } = await import(pathToFileURL(postgresPath).href)
const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  prepare: false,
  ssl: 'require'
})
try {
  await sql.unsafe(sqlText)
  console.log('applied', file)
} finally {
  await sql.end({ timeout: 2 })
}
