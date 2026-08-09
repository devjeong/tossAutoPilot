import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { DEFAULT_RISK_CONFIG, type RiskConfig } from '@tosspilot/shared'

/**
 * auth.users 와 1:1. Supabase Auth 사용 시 id = auth.uid().
 * 로컬 개발에서는 임의 uuid 로 시드 가능.
 */
export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  displayName: text('display_name'),
  riskConfig: jsonb('risk_config').$type<RiskConfig>().notNull().default(DEFAULT_RISK_CONFIG),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
})
