'use client'

import { useCallback, useEffect, useState } from 'react'
import type { PortfolioSnapshotDto } from '@tosspilot/core'
import { useAgeSeconds } from '@/lib/use-age-seconds'

type DisplayCurrency = 'KRW' | 'USD'

type Props = {
  initial: PortfolioSnapshotDto | null
  initialError?: string | null
  initialPolledAt?: string | null
}

const signed = (v: string): string =>
  v.startsWith('-') || v === '0' || v === '0.00' || v === '0.0' ? v : `+${v}`

const signClass = (v: string): string =>
  v.startsWith('-') ? 'dn' : v === '0' || v === '0.00' || v === '0.0' ? 'muted' : 'up'

export function PortfolioHero({ initial, initialError, initialPolledAt }: Props) {
  const [snap, setSnap] = useState(initial)
  const [error, setError] = useState(initialError ?? null)
  const [polledAt, setPolledAt] = useState(initialPolledAt ?? null)
  const [ccy, setCcy] = useState<DisplayCurrency>('KRW')

  const refresh = useCallback(async () => {
    try {
      // live: 엔진 → 토스 즉시 조회
      const res = await fetch('/api/portfolio?live=1')
      const data = (await res.json()) as {
        ok: boolean
        snapshot?: PortfolioSnapshotDto | null
        lastError?: string | null
        polledAt?: string | null
        via?: string
        engineError?: string
      }
      if (data.snapshot) {
        setSnap(data.snapshot)
        setPolledAt(data.polledAt ?? new Date().toISOString())
      }
      setError(data.lastError || data.engineError || null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void refresh()
    const t = setInterval(() => void refresh(), 5000)
    return () => clearInterval(t)
  }, [refresh])

  const t = snap?.totals
  const ageSec = useAgeSeconds(polledAt)

  const pick = (krw: string | undefined, usd: string | undefined) =>
    ccy === 'KRW' ? (krw ?? '—') : (usd ?? '—')

  if (!snap || !t) {
    return (
      <section className="block">
        <div className="block-h">
          <span>총자산</span>
          <span>대기</span>
        </div>
        <div className="block-b">
          <div className="seg">
            <b className={ccy === 'KRW' ? 'on' : ''} onClick={() => setCcy('KRW')}>
              원화
            </b>
            <b className={ccy === 'USD' ? 'on' : ''} onClick={() => setCcy('USD')}>
              달러
            </b>
          </div>
          <div className="big muted">—</div>
          <p className="sub">
            엔진이 포트폴리오를 불러오면 표시됩니다. 설정에서 실 API 연결로 계좌(seq)를 먼저
            확보하세요.
            <br />
            <code className="mono">pnpm dev:engine</code>
          </p>
          {error && <p className="form-error">{error}</p>}
        </div>
      </section>
    )
  }

  const total = pick(t.valueKrw, t.valueUsd)
  const daily = pick(t.dailyProfitLossKrw, t.dailyProfitLossUsd)
  const pl = pick(t.profitLossKrw, t.profitLossUsd)

  return (
    <>
      <section className="block">
        <div className="block-h">
          <span>총자산</span>
          <span>
            {ageSec == null ? '—' : `${ageSec}초 전`}
            {snap.fx ? ` · 환율 ${snap.fx.midRate}` : ''}
          </span>
        </div>
        <div className="block-b">
          <div className="seg" role="group" aria-label="표시 통화">
            <b
              className={ccy === 'KRW' ? 'on' : ''}
              onClick={() => setCcy('KRW')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setCcy('KRW')}
            >
              원화
            </b>
            <b
              className={ccy === 'USD' ? 'on' : ''}
              onClick={() => setCcy('USD')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setCcy('USD')}
            >
              달러
            </b>
          </div>
          <div className="big">
            {ccy === 'USD' ? '$' : ''}
            {total}
            {ccy === 'KRW' ? '' : ''}
          </div>
          <div className={`sub ${signClass(daily)}`}>
            오늘 {signed(daily)}
            {ccy === 'KRW' ? '원' : ''} · {signed(t.dailyProfitLossPercent)}% · 누적{' '}
            {signed(pl)}
            {ccy === 'KRW' ? '원' : ''} ({signed(t.profitLossPercent)}%)
          </div>

          {t.fxMissing && (
            <p className="form-error">환율을 못 받아 일부 통화가 총액에서 빠질 수 있습니다.</p>
          )}
          {error && <p className="form-error">{error}</p>}

          <div className="metrics">
            <div className="metric">
              <div className="k">주식 평가</div>
              <div className="v">{pick(t.stocksValueKrw, t.stocksValueUsd)}</div>
            </div>
            <div className="metric">
              <div className="k">예수금</div>
              <div className="v">{pick(t.cashValueKrw, t.cashValueUsd)}</div>
            </div>
            <div className="metric">
              <div className="k">주식 원화</div>
              <div className="v">{t.stocksKrw}</div>
            </div>
            <div className="metric">
              <div className="k">주식 달러</div>
              <div className="v">${t.stocksUsd}</div>
            </div>
          </div>
        </div>
      </section>

      {snap.items.length > 0 && (
        <section className="block">
          <div className="block-h">
            <span>보유 종목</span>
            <span>{snap.items.length}종목</span>
          </div>
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>종목</th>
                  <th className="num">수량</th>
                  <th className="num">평가</th>
                  <th className="num">손익</th>
                  <th className="num">비중</th>
                </tr>
              </thead>
              <tbody>
                {snap.items.map((it) => (
                  <tr key={it.symbol}>
                    <td className="mono">{it.symbol}</td>
                    <td className="num">{it.quantity}</td>
                    <td className="num">
                      {ccy === 'KRW' ? it.marketValueKrw : `$${it.marketValueUsd}`}
                    </td>
                    <td className={`num ${signClass(it.profitLossPercent)}`}>
                      {signed(it.profitLossPercent)}%
                    </td>
                    <td className="num">{it.weightPercent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  )
}
