import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { profiles } from './profiles'

export type QuoteRow = {
  symbol: string
  lastPrice: string
  currency: string
  /** ISO timestamp from API if any */
  quoteTs?: string | null
}

/**
 * 유저별 최신 시세 스냅샷 (엔진 폴링 결과).
 * 행 1개 = 해당 유저의 최신 일괄 스냅샷.
 */
export const quoteSnapshots = pgTable('quote_snapshots', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  quotes: jsonb('quotes').$type<QuoteRow[]>().notNull().default([]),
  symbolCount: integer('symbol_count').notNull().default(0),
  pollIntervalMs: integer('poll_interval_ms'),
  lastError: text('last_error'),
  polledAt: timestamp('polled_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
})
