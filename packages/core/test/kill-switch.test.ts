import { describe, expect, it } from 'vitest'
import { DEFAULT_RISK_CONFIG } from '@tosspilot/shared'
import { isKillSwitchOn, killSwitchGate } from '../src/risk/kill-switch.js'

describe('kill switch', () => {
  it('기본은 해제', () => {
    expect(isKillSwitchOn(DEFAULT_RISK_CONFIG)).toBe(false)
    expect(killSwitchGate(DEFAULT_RISK_CONFIG).verdict).toBe('PASS')
  })

  it('켜면 BLOCK', () => {
    const g = killSwitchGate({ ...DEFAULT_RISK_CONFIG, killSwitch: true })
    expect(g.verdict).toBe('BLOCK')
    expect(g.id).toBe('F4.10')
  })
})
