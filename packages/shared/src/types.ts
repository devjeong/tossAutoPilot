import { z } from 'zod'

export const MarketSchema = z.enum(['KR', 'US'])
export type Market = z.infer<typeof MarketSchema>

export const SideSchema = z.enum(['BUY', 'SELL'])
export type Side = z.infer<typeof SideSchema>

export const OrderTypeSchema = z.enum(['LIMIT', 'MARKET'])
export type OrderType = z.infer<typeof OrderTypeSchema>

export const TimeInForceSchema = z.enum(['DAY', 'CLS'])
export type TimeInForce = z.infer<typeof TimeInForceSchema>

export const EngineModeSchema = z.enum(['paper', 'live'])
export type EngineMode = z.infer<typeof EngineModeSchema>

export const EngineRunStateSchema = z.enum([
  'stopped',
  'starting',
  'running',
  'degraded',
  'error'
])
export type EngineRunState = z.infer<typeof EngineRunStateSchema>

export const StrategyStateSchema = z.enum([
  'PAUSED',
  'RUNNING',
  'HOLD',
  'ERROR'
])
export type StrategyState = z.infer<typeof StrategyStateSchema>

/** 사용자·전략이 "이렇게 주문하고 싶다"고 말한 것. 아직 주문이 아니다. */
export const OrderIntentSchema = z.object({
  symbol: z.string().min(1),
  market: MarketSchema,
  side: SideSchema,
  orderType: OrderTypeSchema,
  timeInForce: TimeInForceSchema.default('DAY'),
  quantity: z.string().min(1),
  price: z.string().optional(),
  strategyId: z.string().optional(),
  highValueApproved: z.boolean().optional()
})
export type OrderIntent = z.infer<typeof OrderIntentSchema>

export const GateVerdictSchema = z.enum(['PASS', 'BLOCK', 'WARN'])
export type GateVerdict = z.infer<typeof GateVerdictSchema>

export const GateResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  verdict: GateVerdictSchema,
  detail: z.string(),
  adjustment: z
    .object({
      quantity: z.string(),
      reason: z.string()
    })
    .optional()
})
export type GateResult = z.infer<typeof GateResultSchema>

export const OrderCommandStatusSchema = z.enum([
  'pending',
  'claimed',
  'submitted',
  'blocked',
  'failed',
  'would_submit'
])
export type OrderCommandStatus = z.infer<typeof OrderCommandStatusSchema>
