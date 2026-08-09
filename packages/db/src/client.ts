import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema/index'

export type Db = ReturnType<typeof createDb>

export function createDb(connectionString: string) {
  const client = postgres(connectionString, {
    prepare: false,
    max: 10
  })
  return drizzle(client, { schema })
}
