'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'

type WatchItem = {
  id: string
  symbol: string
  market: string
}

type Quote = {
  symbol: string
  lastPrice: string
  currency: string
  quoteTs?: string | null
}

type Snapshot = {
  quotes: Quote[]
  symbol_count: number
  poll_interval_ms: number | null
  last_error: string | null
  polled_at: string | null
}

type Props = {
  initialItems: WatchItem[]
  initialSnapshot: Snapshot | null
}

export function WatchlistQuotesCard({ initialItems, initialSnapshot }: Props) {
  const [items, setItems] = useState(initialItems)
  const [snapshot, setSnapshot] = useState(initialSnapshot)
  const [symbol, setSymbol] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const refreshQuotes = useCallback(async () => {
    try {
      const res = await fetch('/api/quotes?live=1')
      const data = (await res.json()) as {
        ok: boolean
        snapshot?: Snapshot | null
      }
      if (data.snapshot) setSnapshot(data.snapshot)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    void refreshQuotes()
    const t = setInterval(() => void refreshQuotes(), 5000)
    return () => clearInterval(t)
  }, [refreshQuotes])

  async function onAdd(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ symbol })
      })
      const data = (await res.json()) as {
        ok: boolean
        item?: WatchItem
        error?: string
      }
      if (!res.ok || !data.ok || !data.item) throw new Error(data.error || '추가 실패')
      setItems((prev) => [...prev, data.item!])
      setSymbol('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPending(false)
    }
  }

  async function onRemove(item: WatchItem) {
    setError(null)
    try {
      const res = await fetch(`/api/watchlist?id=${encodeURIComponent(item.id)}`, {
        method: 'DELETE'
      })
      const data = (await res.json()) as { ok: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error || '삭제 실패')
      setItems((prev) => prev.filter((x) => x.id !== item.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const priceBySymbol = new Map((snapshot?.quotes ?? []).map((q) => [q.symbol, q]))
  const polledAgeSec =
    snapshot?.polled_at != null
      ? Math.max(0, Math.round((Date.now() - new Date(snapshot.polled_at).getTime()) / 1000))
      : null

  return (
    <>
      <section className="block">
        <div className="block-h">
          <span>관심 시세</span>
          <span>
            {polledAgeSec == null
              ? '—'
              : snapshot?.poll_interval_ms != null
                ? `${(snapshot.poll_interval_ms / 1000).toFixed(1)}초`
                : `${polledAgeSec}초 전`}
          </span>
        </div>
        <div className="block-b">
          <form className="watch-form" onSubmit={onAdd}>
            <input
              className="watch-input"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="005930 또는 AAPL"
              disabled={pending}
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
            />
            <button type="submit" className="btn" disabled={pending || !symbol.trim()}>
              추가
            </button>
          </form>
          {error && <p className="form-error">{error}</p>}
          {snapshot?.last_error && (
            <p className="form-error">폴링: {snapshot.last_error}</p>
          )}
        </div>
        {items.length === 0 ? (
          <div className="block-b" style={{ paddingTop: 0 }}>
            <p className="sub" style={{ margin: 0 }}>
              종목을 추가하면 엔진이 시세를 폴링합니다.
            </p>
          </div>
        ) : (
          <div className="table-scroll table-scroll-sm">
            <table className="data">
              <thead>
                <tr>
                  <th>심볼</th>
                  <th className="num">현재가</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const q = priceBySymbol.get(item.symbol)
                  return (
                    <tr key={item.id}>
                      <td className="mono">{item.symbol}</td>
                      <td className="num">{q?.lastPrice ?? '—'}</td>
                      <td className="num">
                        <button
                          type="button"
                          className="btn ghost"
                          style={{ width: 'auto', padding: '8px 12px', margin: 0, fontSize: 11 }}
                          onClick={() => void onRemove(item)}
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="block">
        <div className="block-h">
          <span>다음 할 일</span>
        </div>
        <div className="block-b">
          <div className="kv">
            <span>1</span>
            <b>게이트 점검</b>
          </div>
          <div className="kv">
            <span>2</span>
            <b>전략 대기열</b>
          </div>
          <div className="kv">
            <span>3</span>
            <b>페이퍼 주문 테스트</b>
          </div>
          <a href="/trade" className="btn">
            트레이딩 열기
          </a>
        </div>
      </section>
    </>
  )
}
