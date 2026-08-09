import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid
} from 'drizzle-orm/pg-core'
import type { EngineMode, EngineRunState } from '@tosspilot/shared'
import { profiles } from './profiles'

/** 사용자당 엔진 1개 (MVP). */
export const engineStatus = pgTable('engine_status', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  mode: text('mode').$type<EngineMode>().notNull().default('paper'),
  state: text('state').$type<EngineRunState>().notNull().default('stopped'),
  lastError: text('last_error'),
  activeAccountSeq: integer('active_account_seq'),
  /** Worker 가 주기적으로 갱신. UI 생존 판정용. */
  heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }),
  lastQuoteAt: timestamp('last_quote_at', { withTimezone: true }),
  meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
})

/** 관심종목. */
export const watchlistItems = pgTable('watchlist_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  symbol: text('symbol').notNull(),
  market: text('market').notNull().default('KR'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})
