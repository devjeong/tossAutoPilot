'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { StockSearch, type StockPick } from './StockSearch'
import { StockChart } from './StockChart'

type CommandItem = {
  id: string
  source: string
  status: string
  intent: {
    symbol: string
    market: string
    side: string
    orderType: string
    quantity: string
    price?: string
  }
  client_order_id: string | null
  exchange_order_id: string | null
  error: string | null
  created_at: string
  finished_at: string | null
}

type ReservedItem = {
  id: string
  status: string
  intent: CommandItem['intent']
  auto_requeue: boolean
  requeue_count: number
  last_exchange_order_id: string | null
  last_error: string | null
  filled_quantity: string | null
  created_at: string
}

type Props = {
  engineMode: string
  killSwitch: boolean
}

export function TradePanel({ engineMode: initialMode, killSwitch: initialKill }: Props) {
  const [mode, setMode] = useState(initialMode)
  const [kill, setKill] = useState(initialKill)
  const [tab, setTab] = useState<'manual' | 'reserve'>('manual')

  const [pick, setPick] = useState<StockPick | null>(null)
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY')
  const [orderType, setOrderType] = useState<'LIMIT' | 'MARKET'>('LIMIT')
  const [quantity, setQuantity] = useState('')
  const [price, setPrice] = useState('')
  const [highValue, setHighValue] = useState(false)
  const [confirmLive, setConfirmLive] = useState(false)
  const [autoRequeue, setAutoRequeue] = useState(true)

  const market = pick?.market ?? 'KR'
  const symbol = pick?.symbol ?? ''

  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const [commands, setCommands] = useState<CommandItem[]>([])
  const [reserved, setReserved] = useState<ReservedItem[]>([])

  const refresh = useCallback(async () => {
    try {
      const [o, r] = await Promise.all([
        fetch('/api/orders?limit=30').then((x) => x.json()),
        fetch('/api/reserved').then((x) => x.json())
      ])
      if (o.ok) setCommands(o.items ?? [])
      if (r.ok) setReserved(r.items ?? [])
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    void refresh()
    const t = setInterval(() => void refresh(), 4000)
    return () => clearInterval(t)
  }, [refresh])

  async function onMode(next: 'paper' | 'live') {
    setError(null)
    if (next === 'live' && !window.confirm('실거래(Live) 모드로 전환합니다. 실제 주문이 나갑니다. 계속할까요?')) {
      return
    }
    const res = await fetch('/api/engine/mode', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: next, confirmLive: next === 'live' })
    })
    const data = await res.json()
    if (!data.ok) {
      setError(data.error || '모드 변경 실패')
      return
    }
    setMode(next)
    setInfo(next === 'live' ? '실거래 모드' : '페이퍼 모드')
  }

  async function onKill(next: boolean) {
    setError(null)
    const res = await fetch('/api/risk/kill-switch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ killSwitch: next })
    })
    const data = await res.json()
    if (!data.ok) {
      setError(data.error || '킬 스위치 실패')
      return
    }
    setKill(next)
    setInfo(next ? '킬 스위치 작동 — 모든 주문 차단' : '킬 스위치 해제')
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    if (!pick?.symbol) {
      setError('종목을 검색해 선택하세요')
      return
    }
    setPending(true)
    try {
      const intent = {
        symbol: pick.symbol.trim().toUpperCase(),
        market: pick.market,
        side,
        orderType,
        timeInForce: 'DAY' as const,
        quantity: quantity.trim(),
        ...(orderType === 'LIMIT' ? { price: price.trim() } : {}),
        highValueApproved: highValue
      }

      if (tab === 'manual') {
        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            intent,
            confirmLive: mode === 'live' ? confirmLive : undefined,
            highValueApproved: highValue
          })
        })
        const data = await res.json()
        if (!res.ok || !data.ok) throw new Error(data.error || '주문 실패')
        setInfo(`주문 큐 등록 · ${data.command.id.slice(0, 8)}… (엔진 처리 대기)`)
      } else {
        const res = await fetch('/api/reserved', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ intent, autoRequeue })
        })
        const data = await res.json()
        if (!res.ok || !data.ok) throw new Error(data.error || '예약 실패')
        setInfo(
          autoRequeue
            ? '예약 등록 — 미체결 시 다음 영업일 자동 재예약'
            : '예약 등록 — 재예약 없음'
        )
      }
      setQuantity('')
      setPrice('')
      void refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPending(false)
    }
  }

  async function cancelReserved(id: string) {
    if (!window.confirm('이 예약을 취소할까요?')) return
    const res = await fetch(`/api/reserved?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    const data = await res.json()
    if (!data.ok) setError(data.error || '취소 실패')
    else void refresh()
  }

  async function cancelExchange(orderId: string, intent: CommandItem['intent']) {
    if (!window.confirm(`거래소 주문 ${orderId} 을 취소할까요?`)) return
    const res = await fetch('/api/orders/cancel', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        orderId,
        symbol: intent.symbol,
        market: intent.market,
        side: intent.side,
        quantity: intent.quantity
      })
    })
    const data = await res.json()
    if (!data.ok) setError(data.error || '취소 실패')
    else {
      setInfo('취소 명령 등록')
      void refresh()
    }
  }

  return (
    <div className="wide-grid">
      <div className="alert">
        트레이딩 — 종목명 검색(국내) · 시장 자동 판별 · 차트(1분~월봉) · 수동/예약 매매.
        토스 캔들은 1m·1d 원천이며 그 외 봉은 서버 집계입니다.
      </div>

      <StockChart
        symbol={pick?.symbol ?? null}
        name={pick?.name}
        market={pick?.market}
      />

      <div className="wide-grid-2">
        <section className="block">
          <div className="block-h">
            <span>모드 · 안전</span>
            <span className="mono">{mode === 'live' ? '실거래' : '페이퍼'}</span>
          </div>
          <div className="block-b">
            <div className="seg">
              <b className={mode === 'paper' ? 'on' : ''} role="button" tabIndex={0} onClick={() => void onMode('paper')}>
                페이퍼
              </b>
              <b className={mode === 'live' ? 'on' : ''} role="button" tabIndex={0} onClick={() => void onMode('live')}>
                실거래
              </b>
            </div>
            <div className="kv">
              <span>킬 스위치</span>
              <b className={kill ? 'dn' : 'up'}>{kill ? '작동' : '해제'}</b>
            </div>
            <button type="button" className={`btn ${kill ? 'ghost' : ''}`} onClick={() => void onKill(!kill)}>
              {kill ? '킬 스위치 해제' : '전체 정지 (킬 스위치)'}
            </button>
            <p className="sub">
              페이퍼: 게이트·주문 본문만 기록 (실전송 없음). 실거래: 엔진이 토스 API로 전송. 엔진 상주
              필요.
            </p>
          </div>
        </section>

        <section className="block">
          <div className="block-h">
            <span>{tab === 'manual' ? '수동 주문' : '예약 매매'}</span>
            <span>DAY</span>
          </div>
          <div className="block-b">
            <div className="seg" style={{ marginTop: 0 }}>
              <b className={tab === 'manual' ? 'on' : ''} role="button" tabIndex={0} onClick={() => setTab('manual')}>
                수동
              </b>
              <b className={tab === 'reserve' ? 'on' : ''} role="button" tabIndex={0} onClick={() => setTab('reserve')}>
                예약
              </b>
            </div>

            <form className="auth-form" style={{ padding: 0 }} onSubmit={(e) => void onSubmit(e)}>
              <StockSearch value={pick} onChange={setPick} disabled={pending} />

              <div className="seg">
                <b className={side === 'BUY' ? 'on' : ''} role="button" tabIndex={0} onClick={() => setSide('BUY')}>
                  매수
                </b>
                <b className={side === 'SELL' ? 'on' : ''} role="button" tabIndex={0} onClick={() => setSide('SELL')}>
                  매도
                </b>
              </div>

              <div className="seg">
                <b
                  className={orderType === 'LIMIT' ? 'on' : ''}
                  role="button"
                  tabIndex={0}
                  onClick={() => setOrderType('LIMIT')}
                >
                  지정가
                </b>
                <b
                  className={orderType === 'MARKET' ? 'on' : ''}
                  role="button"
                  tabIndex={0}
                  onClick={() => setOrderType('MARKET')}
                >
                  시장가
                </b>
              </div>

              <label className="field">
                수량
                <input
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  inputMode="numeric"
                  placeholder="1"
                  required
                />
              </label>

              {orderType === 'LIMIT' && (
                <label className="field">
                  가격
                  <input
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    inputMode="decimal"
                    placeholder={market === 'KR' ? '72000' : '180.50'}
                    required
                  />
                </label>
              )}

              <label className="field" style={{ textTransform: 'none', letterSpacing: 'normal' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={highValue}
                    onChange={(e) => setHighValue(e.target.checked)}
                  />
                  고액 주문 확인 (한도 이상 시 필요)
                </span>
              </label>

              {tab === 'manual' && mode === 'live' && (
                <label className="field" style={{ textTransform: 'none', letterSpacing: 'normal' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={confirmLive}
                      onChange={(e) => setConfirmLive(e.target.checked)}
                    />
                    실거래 전송을 확인합니다
                  </span>
                </label>
              )}

              {tab === 'reserve' && (
                <label className="field" style={{ textTransform: 'none', letterSpacing: 'normal' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={autoRequeue}
                      onChange={(e) => setAutoRequeue(e.target.checked)}
                    />
                    미체결·취소 시 다음 영업일 자동 재예약
                  </span>
                </label>
              )}

              <button type="submit" className="btn" disabled={pending || kill || !pick}>
                {pending ? '처리 중…' : tab === 'manual' ? '주문 전송' : '예약 등록'}
              </button>
            </form>

            {error && <p className="form-error">{error}</p>}
            {info && <p className="form-info">{info}</p>}
          </div>
        </section>
      </div>

      <div className="wide-grid-2">
        <section className="block">
          <div className="block-h">
            <span>예약 목록</span>
            <span>{reserved.length}건</span>
          </div>
          {!reserved.length ? (
            <div className="block-b">
              <p className="sub" style={{ margin: 0 }}>
                등록된 예약이 없습니다.
              </p>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>상태</th>
                    <th>종목</th>
                    <th className="num">수량</th>
                    <th className="num">가격</th>
                    <th>재예약</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {reserved.map((r) => (
                    <tr key={r.id}>
                      <td className="mono">{statusKo(r.status)}</td>
                      <td className="mono">
                        {r.intent.side === 'BUY' ? '매수' : '매도'} {r.intent.symbol}
                      </td>
                      <td className="num">{r.intent.quantity}</td>
                      <td className="num">
                        {r.intent.orderType === 'MARKET' ? '시장가' : r.intent.price}
                      </td>
                      <td className="mono">
                        {r.auto_requeue ? `ON · ${r.requeue_count}` : 'OFF'}
                      </td>
                      <td className="num">
                        {['armed', 'working', 'error', 'paused'].includes(r.status) && (
                          <button
                            type="button"
                            className="btn ghost"
                            style={{ width: 'auto', padding: '6px 10px', margin: 0, fontSize: 11 }}
                            onClick={() => void cancelReserved(r.id)}
                          >
                            취소
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="block">
          <div className="block-h">
            <span>주문 명령</span>
            <span>{commands.length}건</span>
          </div>
          {!commands.length ? (
            <div className="block-b">
              <p className="sub" style={{ margin: 0 }}>
                최근 명령이 없습니다. 엔진이 큐를 처리합니다.
              </p>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>상태</th>
                    <th>출처</th>
                    <th>종목</th>
                    <th className="num">수량</th>
                    <th>orderId</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {commands.map((c) => (
                    <tr key={c.id}>
                      <td className="mono" title={c.error ?? undefined}>
                        {cmdStatusKo(c.status)}
                      </td>
                      <td className="mono">{sourceKo(c.source)}</td>
                      <td className="mono">
                        {c.intent.side === 'BUY' ? '매수' : '매도'} {c.intent.symbol}
                      </td>
                      <td className="num">{c.intent.quantity}</td>
                      <td className="mono" style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {c.exchange_order_id ?? c.client_order_id ?? '—'}
                      </td>
                      <td className="num">
                        {c.exchange_order_id && c.status === 'submitted' && (
                          <button
                            type="button"
                            className="btn ghost"
                            style={{ width: 'auto', padding: '6px 10px', margin: 0, fontSize: 11 }}
                            onClick={() => void cancelExchange(c.exchange_order_id!, c.intent)}
                          >
                            취소
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {commands.some((c) => c.error) && (
            <div className="block-b">
              <p className="form-error" style={{ margin: 0 }}>
                최근 오류: {commands.find((c) => c.error)?.error}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function statusKo(s: string): string {
  const m: Record<string, string> = {
    armed: '대기',
    working: '진행',
    filled: '체결',
    cancelled: '취소',
    paused: '일시정지',
    error: '오류'
  }
  return m[s] ?? s
}

function cmdStatusKo(s: string): string {
  const m: Record<string, string> = {
    pending: '대기',
    claimed: '처리중',
    submitted: '접수',
    blocked: '차단',
    failed: '실패',
    would_submit: '페이퍼',
    cancelled: '취소'
  }
  return m[s] ?? s
}

function sourceKo(s: string): string {
  if (s === 'reserved') return '예약'
  if (s === 'cancel') return '취소'
  if (s === 'strategy') return '전략'
  return '수동'
}
