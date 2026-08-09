import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid
} from 'drizzle-orm/pg-core'
import type { OrderIntent, ReservedOrderStatus } from '@tosspilot/shared'
import { profiles } from './profiles'

/**
 * 예약 매매 — DAY 주문 미체결·취소 시 다음 영업일 자동 재예약.
 * 실제 전송은 order_commands 큐를 통해 엔진이 수행.
 */
export const reservedOrders = pgTable('reserved_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  status: text('status').$type<ReservedOrderStatus>().notNull().default('armed'),
  intent: jsonb('intent').$type<OrderIntent>().notNull(),
  /** 장 마감 미체결 시 다음 영업일 재예약 */
  autoRequeue: boolean('auto_requeue').notNull().default(true),
  requeueCount: integer('requeue_count').notNull().default(0),
  /** 오늘(세션) 이미 제출한 날짜 키 YYYY-MM-DD (시장 기준) */
  lastSubmitSessionDate: text('last_submit_session_date'),
  lastCommandId: uuid('last_command_id'),
  lastExchangeOrderId: text('last_exchange_order_id'),
  lastClientOrderId: text('last_client_order_id'),
  lastError: text('last_error'),
  filledQuantity: text('filled_quantity').default('0'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
})
