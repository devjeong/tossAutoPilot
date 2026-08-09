import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import type { OrderCommandSource, OrderCommandStatus, OrderIntent } from '@tosspilot/shared'
import { profiles } from './profiles'
import { strategies } from './strategies'

/**
 * UI/API → Worker 주문 명령 큐.
 * Worker 가 claim 후 게이트 평가 → paper/live 분기.
 */
export const orderCommands = pgTable('order_commands', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  strategyId: uuid('strategy_id').references(() => strategies.id, {
    onDelete: 'set null'
  }),
  /** reserved_orders.id 연결 (source=reserved 일 때) */
  reservedOrderId: uuid('reserved_order_id'),
  source: text('source').$type<OrderCommandSource | string>().notNull().default('manual'),
  status: text('status').$type<OrderCommandStatus>().notNull().default('pending'),
  intent: jsonb('intent').$type<OrderIntent>().notNull(),
  clientOrderId: text('client_order_id'),
  exchangeOrderId: text('exchange_order_id'),
  gateSnapshot: jsonb('gate_snapshot').$type<unknown>(),
  error: text('error'),
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})
