'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'

export type StockPick = {
  symbol: string
  name: string
  market: 'KR' | 'US'
  exchange?: string
  currency?: string
}

type Hit = StockPick

type Props = {
  value: StockPick | null
  onChange: (pick: StockPick | null) => void
  disabled?: boolean
}

export function StockSearch({ value, onChange, disabled }: Props) {
  const listId = useId()
  const [query, setQuery] = useState(value ? `${value.name} (${value.symbol})` : '')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [hits, setHits] = useState<Hit[]>([])
  const [err, setErr] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const picking = useRef(false)

  // sync display when external value cleared
  useEffect(() => {
    if (!value) {
      if (!picking.current) setQuery('')
    } else {
      setQuery(`${value.name} (${value.symbol})`)
    }
  }, [value])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 1) {
      setHits([])
      return
    }
    setLoading(true)
    setErr(null)
    try {
      const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(q.trim())}`)
      const data = (await res.json()) as { ok: boolean; items?: Hit[]; error?: string }
      if (!data.ok) throw new Error(data.error || '검색 실패')
      setHits(data.items ?? [])
      setOpen(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setHits([])
    } finally {
      setLoading(false)
    }
  }, [])

  function onInput(v: string) {
    setQuery(v)
    onChange(null)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void search(v), 280)
  }

  function pick(h: Hit) {
    picking.current = true
    onChange(h)
    setQuery(`${h.name} (${h.symbol})`)
    setOpen(false)
    setHits([])
    setTimeout(() => {
      picking.current = false
    }, 0)
  }

  return (
    <div className="stock-search" ref={wrapRef}>
      <label className="field">
        종목 검색
        <input
          value={query}
          onChange={(e) => onInput(e.target.value)}
          onFocus={() => {
            if (hits.length) setOpen(true)
          }}
          placeholder="종목명 (삼성전자) · 코드 (005930) · 티커 (AAPL)"
          disabled={disabled}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
        />
      </label>

      {value && (
        <div className="stock-pick-meta">
          <span className="badge">{value.market === 'KR' ? '국내' : '미국'}</span>
          <span className="mono">{value.symbol}</span>
          {value.exchange && <span className="muted">{value.exchange}</span>}
          {value.currency && <span className="muted">{value.currency}</span>}
        </div>
      )}

      {loading && <p className="sub" style={{ margin: '4px 0 0' }}>검색 중…</p>}
      {err && <p className="form-error">{err}</p>}

      {open && hits.length > 0 && (
        <ul className="stock-search-list" id={listId} role="listbox">
          {hits.map((h) => (
            <li key={`${h.market}-${h.symbol}`}>
              <button type="button" role="option" onClick={() => pick(h)}>
                <strong>{h.name}</strong>
                <span className="mono">{h.symbol}</span>
                <span className="badge">{h.market === 'KR' ? '국내' : '미국'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
