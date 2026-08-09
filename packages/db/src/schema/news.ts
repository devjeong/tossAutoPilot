import {
  boolean,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid
} from 'drizzle-orm/pg-core'
import { profiles } from './profiles'

export const newsItems = pgTable('news_items', {
  id: text('id').primaryKey(),
  userId: uuid('user_id').references(() => profiles.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  summary: text('summary'),
  url: text('url'),
  sourceName: text('source_name').notNull(),
  sourceTier: text('source_tier').notNull().default('unknown'),
  isKadara: boolean('is_kadara').notNull().default(true),
  market: text('market').default('ALL'),
  symbols: jsonb('symbols').$type<string[]>().notNull().default([]),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  collectedAt: timestamp('collected_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})
