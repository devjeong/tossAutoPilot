import type { RiskConfig } from '@tosspilot/shared'

/** F4.10 킬 스위치 — 켜져 있으면 어떤 주문도 나가면 안 된다. */
export function isKillSwitchOn(config: Pick<RiskConfig, 'killSwitch'>): boolean {
  return config.killSwitch === true
}

export function killSwitchGate(config: Pick<RiskConfig, 'killSwitch'>): {
  id: string
  name: string
  verdict: 'PASS' | 'BLOCK'
  detail: string
} {
  const id = 'F4.10'
  const name = '킬 스위치'
  return isKillSwitchOn(config)
    ? { id, name, verdict: 'BLOCK', detail: '전체 정지 상태입니다. 해제 전에는 어떤 주문도 나가지 않습니다' }
    : { id, name, verdict: 'PASS', detail: '해제됨' }
}
