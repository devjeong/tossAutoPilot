'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
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

const NAV: { href: string; label: string; path: Props['activePath'] | null; disabled?: boolean }[] = [
  { href: '/', label: '홈', path: 'home' },
  { href: '#', label: '트레이딩', path: null, disabled: true },
  { href: '#', label: '전략', path: null, disabled: true },
  { href: '/reports', label: '보고서', path: 'reports' },
  { href: '/news', label: '뉴스', path: 'news' },
  { href: '/settings', label: '설정', path: 'settings' }
]

export function AppHeader({
  email,
  engineState,
  engineMode,
  heartbeatAgeSec,
  activePath = 'home'
}: Props) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)

  const alive =
    heartbeatAgeSec !== null &&
    heartbeatAgeSec !== undefined &&
    heartbeatAgeSec < 30

  const engineOk = alive && (engineState === 'running' || engineState === 'degraded')
  const modeLabel = engineMode === 'live' ? '실거래' : '페이퍼'
  const stateLabel = STATE_KO[engineState ?? ''] ?? engineState ?? '오프라인'

  // Close drawer on route change
  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  // Lock body scroll when menu open
  useEffect(() => {
    if (!menuOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [menuOpen])

  const navItems = (
    <>
      {NAV.map((item) => {
        if (item.disabled) {
          return (
            <span key={item.label} className="nav-item muted">
              {item.label}
            </span>
          )
        }
        const active = activePath === item.path
        return (
          <Link
            key={item.href}
            className={`nav-item${active ? ' active' : ''}`}
            href={item.href}
            onClick={() => setMenuOpen(false)}
          >
            {item.label}
          </Link>
        )
      })}
    </>
  )

  const statusCluster = (
    <>
      <span className={`badge${engineOk ? '' : ' idle'}`}>
        {engineOk ? '엔진 정상' : '엔진 —'}
      </span>
      <span className="badge warn">{modeLabel}</span>
      <span className="state-pill mono" title={stateLabel}>
        <span className={`dot ${alive ? 'ok' : engineState === 'running' ? 'warn' : 'idle'}`} />
        하트비트 {heartbeatAgeSec != null ? `${heartbeatAgeSec}초` : '—'}
      </span>
    </>
  )

  return (
    <header className={`titlebar${menuOpen ? ' menu-open' : ''}`}>
      <div className="titlebar-top">
        <div className="brand">
          <Link href="/" className="brand-link" onClick={() => setMenuOpen(false)}>
            TossAutoPilot
          </Link>
          <span className="brand-sub">컨트롤 덱</span>
        </div>

        <div className="titlebar-compact-status" aria-hidden={menuOpen}>
          <span className={`badge${engineOk ? '' : ' idle'}`}>
            {engineOk ? '정상' : '—'}
          </span>
          <span className="badge warn">{modeLabel}</span>
        </div>

        <button
          type="button"
          className="menu-toggle"
          aria-label={menuOpen ? '메뉴 닫기' : '메뉴 열기'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span className="menu-toggle-bar" />
          <span className="menu-toggle-bar" />
          <span className="menu-toggle-bar" />
        </button>
      </div>

      <nav className="mode-rail mode-rail-desktop" aria-label="주 메뉴">
        {navItems}
      </nav>

      <div className="titlebar-right titlebar-right-desktop">
        {statusCluster}
        {email && (
          <span className="user-email mono" title={email}>
            {email}
          </span>
        )}
        {email && <SignOutButton />}
      </div>

      {/* Mobile drawer */}
      <div
        className={`mobile-drawer${menuOpen ? ' open' : ''}`}
        id="mobile-nav"
        hidden={!menuOpen}
      >
        <nav className="mode-rail mode-rail-mobile" aria-label="주 메뉴">
          {navItems}
        </nav>
        <div className="titlebar-right titlebar-right-mobile">
          {statusCluster}
          {email && (
            <span className="user-email mono" title={email}>
              {email}
            </span>
          )}
          {email && <SignOutButton />}
        </div>
      </div>

      {menuOpen && (
        <button
          type="button"
          className="mobile-backdrop"
          aria-label="메뉴 닫기"
          onClick={() => setMenuOpen(false)}
        />
      )}
    </header>
  )
}
