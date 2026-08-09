import type { EngineMode } from './types.js'

/** 신규 연결 직후 기본값 — 실주문 금지 (FEATURE_SPEC F3.1). */
export const DEFAULT_ENGINE_MODE: EngineMode = 'paper'

export function isLiveMode(mode: EngineMode): boolean {
  return mode === 'live'
}

export function isPaperMode(mode: EngineMode): boolean {
  return mode === 'paper'
}
