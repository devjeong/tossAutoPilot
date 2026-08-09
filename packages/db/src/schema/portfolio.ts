import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { profiles } from './profiles'

export type PortfolioSnapshotJson = Record<string, unknown>

export const portfolioSnapshots = pgTable('portfolio_snapshots', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  snapshot: jsonb('snapshot').$type<PortfolioSnapshotJson>().notNull().default({}),
  lastError: text('last_error'),
  polledAt: timestamp('polled_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
})
