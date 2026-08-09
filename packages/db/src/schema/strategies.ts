import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid
} from 'drizzle-orm/pg-core'
import type { StrategyState } from '@tosspilot/shared'
import { profiles } from './profiles'

export const strategies = pgTable('strategies', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  kind: text('kind').notNull().default('basic-v1'),
  state: text('state').$type<StrategyState>().notNull().default('PAUSED'),
  autoSendEnabled: boolean('auto_send_enabled').notNull().default(false),
  priority: integer('priority').notNull().default(100),
  version: integer('version').notNull().default(1),
  /** basic-v1 params, symbols ??*/
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  lastError: text('last_error'),
  lastEvaluatedAt: timestamp('last_evaluated_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
})
