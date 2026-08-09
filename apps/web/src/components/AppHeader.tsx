import Link from 'next/link'
import { SignOutButton } from './SignOutButton'

type Props = {
  email?: string | null
  engineState?: string | null
  engineMode?: string | null
  heartbeatAgeSec?: number | null
  activePath?: 'home' | 'settings' | 'reports' | 'news'
}

const STATE_KO: Record<string, string> = {
  running: '가동',
  stopped: '정지',
  degraded: '저하',
  starting: '시작중',
  error: '오류'
}

export function AppHeader({
  email,
  engineState,
  engineMode,
  heartbeatAgeSec,
  activePath = 'home'
}: Props) {
  const alive =
    heartbeatAgeSec !== null &&
    heartbeatAgeSec !== undefined &&
    heartbeatAgeSec < 30

  const engineOk = alive && (engineState === 'running' || engineState === 'degraded')
  const modeLabel = engineMode === 'live' ? '실거래' : '페이퍼'
  const stateLabel = STATE_KO[engineState ?? ''] ?? engineState ?? '오프라인'

  return (
    <header className="titlebar">
      <div className="brand">
        TossAutoPilot
        <span className="brand-sub">컨트롤 덱</span>
      </div>

      <nav className="mode-rail" aria-label="주 메뉴">
        <Link className={`nav-item${activePath === 'home' ? ' active' : ''}`} href="/">
          홈
        </Link>
        <span className="nav-item muted">트레이딩</span>
        <span className="nav-item muted">전략</span>
        <Link
          className={`nav-item${activePath === 'reports' ? ' active' : ''}`}
          href="/reports"
        >
          보고서
        </Link>
        <Link
          className={`nav-item${activePath === 'news' ? ' active' : ''}`}
          href="/news"
        >
          뉴스
        </Link>
        <Link
          className={`nav-item${activePath === 'settings' ? ' active' : ''}`}
          href="/settings"
        >
          설정
        </Link>
      </nav>

      <div className="titlebar-right">
        <span className={`badge${engineOk ? '' : ' idle'}`}>
          {engineOk ? '엔진 정상' : '엔진 —'}
        </span>
        <span className="badge warn">{modeLabel}</span>
        <span className="state-pill mono" title={stateLabel}>
          <span className={`dot ${alive ? 'ok' : engineState === 'running' ? 'warn' : 'idle'}`} />
          하트비트 {heartbeatAgeSec != null ? `${heartbeatAgeSec}초` : '—'}
        </span>
        {email && (
          <span className="user-email mono" title={email}>
            {email}
          </span>
        )}
        {email && <SignOutButton />}
      </div>
    </header>
  )
}
