import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { profiles } from './profiles'

export const marketReports = pgTable('market_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull().default('market_brief_both'),
  status: text('status').notNull().default('completed'),
  title: text('title').notNull(),
  bodyMarkdown: text('body_markdown').notNull(),
  provider: text('provider'),
  model: text('model'),
  kadaraCount: integer('kadara_count').notNull().default(0),
  /** evidence + tables + sources */
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
})
