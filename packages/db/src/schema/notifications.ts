import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { profiles } from './profiles'

/**
 * 텔레그램 등 알림 설정.
 * bot token 은 암호문 보관 (service_role / 엔진만 복호화).
 */
export const notificationSettings = pgTable('notification_settings', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  telegramEnabled: boolean('telegram_enabled').notNull().default(false),
  telegramChatId: text('telegram_chat_id'),
  telegramBotTokenEnc: text('telegram_bot_token_enc'),
  notifyOnReserve: boolean('notify_on_reserve').notNull().default(true),
  notifyOnSubmit: boolean('notify_on_submit').notNull().default(true),
  notifyOnFill: boolean('notify_on_fill').notNull().default(true),
  notifyOnCancel: boolean('notify_on_cancel').notNull().default(true),
  /** 체결 추적: orderId → 마지막 알림 체결 수량 */
  fillTrackJson: text('fill_track_json'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
})
