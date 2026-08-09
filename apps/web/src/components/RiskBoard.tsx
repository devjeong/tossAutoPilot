import Link from 'next/link'
import type { RiskConfig } from '@tosspilot/shared'

type Props = {
  risk: RiskConfig
  killVerdict: string
  engineMode?: string | null
  engineState?: string | null
  accountSeq?: number | null
  heartbeatAgeSec?: number | null
  hasCredentials: boolean
  clientIdHint?: string | null
  engineError?: string | null
}

const STATE_KO: Record<string, string> = {
  running: '가동',
  stopped: '정지',
  degraded: '저하',
  starting: '시작중',
  error: '오류'
}

export function RiskBoard({
  risk,
  killVerdict,
  engineMode,
  engineState,
  accountSeq,
  heartbeatAgeSec,
  hasCredentials,
  clientIdHint,
  engineError
}: Props) {
  const killOff = killVerdict === 'PASS'
  const modeLabel = engineMode === 'live' ? '실거래' : '페이퍼'
  const stateLabel = STATE_KO[engineState ?? ''] ?? (engineState ?? '정지').toUpperCase()

  return (
    <>
      <div className="alert">게이트 기본: 판단 불가면 차단</div>

      <section className="block">
        <div className="block-h">
          <span>리스크 보드</span>
        </div>
        <div className="block-b">
          <div className="kv">
            <span>킬 스위치</span>
            <b className={killOff ? 'up' : 'dn'}>{killOff ? '해제' : '작동'}</b>
          </div>
          <div className="kv">
            <span>종목 비중 상한</span>
            <b>{risk.maxSymbolWeightPercent}%</b>
          </div>
          <div className="kv">
            <span>일일 손실 한도</span>
            <b>{risk.dailyLossLimitPercent}%</b>
          </div>
          <div className="kv">
            <span>고액 주문 기준</span>
            <b>₩{formatShort(risk.highValueThresholdKrw)}</b>
          </div>
          <div className="kv">
            <span>모드</span>
            <b>{modeLabel}</b>
          </div>
          <Link href="/trade" className="btn">
            트레이딩 열기
          </Link>
          <Link href="/settings" className="btn ghost">
            실거래 준비…
          </Link>
        </div>
      </section>

      <section className="block">
        <div className="block-h">
          <span>엔진</span>
        </div>
        <div className="block-b">
          <div className="kv">
            <span>상태</span>
            <b className={engineState === 'running' ? 'up' : ''}>{stateLabel}</b>
          </div>
          <div className="kv">
            <span>하트비트</span>
            <b className="mono">
              {heartbeatAgeSec == null ? '—' : `${heartbeatAgeSec}초`}
            </b>
          </div>
          <div className="kv">
            <span>계좌 번호(seq)</span>
            <b className="mono">{accountSeq ?? '—'}</b>
          </div>
          <div className="kv">
            <span>API 키</span>
            <b className="mono">{hasCredentials ? clientIdHint ?? '등록됨' : '없음'}</b>
          </div>
          {engineError && <p className="form-error">{engineError}</p>}
          {!hasCredentials && (
            <Link href="/settings" className="btn ghost">
              키 등록
            </Link>
          )}
        </div>
      </section>
    </>
  )
}

function formatShort(n: string): string {
  const v = Number(n)
  if (!Number.isFinite(v)) return n
  if (v >= 1e8) return `${Math.round(v / 1e8)}억`
  if (v >= 1e4) return `${Math.round(v / 1e4)}만`
  return n
}
