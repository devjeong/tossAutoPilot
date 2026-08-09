import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { profiles } from './profiles'

/**
 * 토스 API 자격증명. 원문은 AES-256-GCM 으로 암호화해 저장.
 * 브라우저 RLS SELECT 금지 — service_role / Worker 만 복호화.
 * client_id_enc / client_secret_enc 는 self-contained seal (iv+tag+ct base64).
 */
export const apiCredentials = pgTable('api_credentials', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  /** 마스킹 표시용 (예: c_01HXYZ…abcd) */
  clientIdHint: text('client_id_hint').notNull(),
  /** base64 seal */
  clientIdEnc: text('client_id_enc').notNull(),
  clientSecretEnc: text('client_secret_enc').notNull(),
  /** 스키마 호환 필드 (seal 이 self-contained 이면 버전 표기) */
  iv: text('iv').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
})
