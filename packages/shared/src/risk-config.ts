import { z } from 'zod'

export const RiskConfigSchema = z.object({
  maxSymbolWeightPercent: z.number().positive().max(100),
  /** 일일 손실 한도 (%, 음수). */
  dailyLossLimitPercent: z.number().max(0),
  highValueThresholdKrw: z.string(),
  maxOrderAmountKrw: z.string(),
  autoApproveHighValue: z.boolean(),
  killSwitch: z.boolean()
})
export type RiskConfig = z.infer<typeof RiskConfigSchema>

/** 스펙 기본 한도. */
export const DEFAULT_RISK_CONFIG: RiskConfig = {
  maxSymbolWeightPercent: 12,
  dailyLossLimitPercent: -2,
  highValueThresholdKrw: '100000000',
  maxOrderAmountKrw: '3000000000',
  autoApproveHighValue: false,
  killSwitch: false
}

/**
 * 첫 실주문 테스트용 안전 설정.
 * 최대 주문 10만원 · 종목 비중 1% · 일일 손실 -0.5%.
 */
export const TEST_SAFE_RISK_CONFIG: RiskConfig = {
  maxSymbolWeightPercent: 1,
  dailyLossLimitPercent: -0.5,
  highValueThresholdKrw: '100000000',
  maxOrderAmountKrw: '100000',
  autoApproveHighValue: false,
  killSwitch: false
}
