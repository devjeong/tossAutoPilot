'use client'

import { useEffect, useRef, useState } from 'react'
import {
  createChart,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type UTCTimestamp,
  type Time,
  ColorType,
  CrosshairMode
} from 'lightweight-charts'
/** 클라이언트 번들에 core 패키지 전체를 끌어오지 않도록 로컬 정의 */
const CHART_INTERVALS = [
  '1m',
  '5m',
  '15m',
  '30m',
  '60m',
  '240m',
  '1d',
  '1w',
  '1mo'
] as const
type ChartInterval = (typeof CHART_INTERVALS)[number]

const CHART_INTERVAL_LABELS: Record<ChartInterval, string> = {
  '1m': '1분',
  '5m': '5분',
  '15m': '15분',
  '30m': '30분',
  '60m': '60분',
  '240m': '240분',
  '1d': '일',
  '1w': '주',
  '1mo': '월'
}

type Props = {
  symbol: string | null
  name?: string | null
  market?: 'KR' | 'US' | null
}

type ApiCandle = {
  time: string
  open: string
  high: string
  low: string
  close: string
  volume: string
}

export function StockChart({ symbol, name, market }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const [interval, setInterval] = useState<ChartInterval>('1d')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [meta, setMeta] = useState<string | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const chart = createChart(el, {
      height: 320,
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: '#111111',
        fontFamily: "ui-monospace, 'Cascadia Code', Menlo, monospace",
        fontSize: 11
      },
      grid: {
        vertLines: { color: '#e4e4e0' },
        horzLines: { color: '#e4e4e0' }
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#111111' },
      timeScale: {
        borderColor: '#111111',
        timeVisible: true,
        secondsVisible: false
      }
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#0f9d58',
      downColor: '#d93025',
      borderUpColor: '#0f9d58',
      borderDownColor: '#d93025',
      wickUpColor: '#0f9d58',
      wickDownColor: '#d93025'
    })

    chartRef.current = chart
    seriesRef.current = series

    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth })
      }
    })
    ro.observe(el)
    chart.applyOptions({ width: el.clientWidth })

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!symbol || !seriesRef.current) {
      seriesRef.current?.setData([])
      setMeta(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    void (async () => {
      try {
        const res = await fetch(
          `/api/stocks/candles?symbol=${encodeURIComponent(symbol)}&interval=${interval}`
        )
        const data = (await res.json()) as {
          ok: boolean
          candles?: ApiCandle[]
          sourceCount?: number
          error?: string
        }
        if (!data.ok) throw new Error(data.error || '차트 조회 실패')
        if (cancelled) return

        const bars: CandlestickData[] = []
        let lastTime: Time | null = null
        for (const c of data.candles ?? []) {
          const t = toChartTime(c.time, interval)
          if (t == null) continue
          if (lastTime != null && !timeGreater(t, lastTime)) continue
          bars.push({
            time: t,
            open: Number(c.open),
            high: Number(c.high),
            low: Number(c.low),
            close: Number(c.close)
          })
          lastTime = t
        }

        seriesRef.current?.setData(bars)
        chartRef.current?.timeScale().fitContent()
        setMeta(
          `${bars.length}봉 · 원천 ${data.sourceCount ?? '—'} · ${CHART_INTERVAL_LABELS[interval]}`
        )
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e))
          seriesRef.current?.setData([])
          setMeta(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [symbol, interval])

  return (
    <section className="block stock-chart">
      <div className="block-h">
        <span>
          차트{name ? ` · ${name}` : ''}
          {symbol ? ` (${symbol})` : ''}
        </span>
        <span>{market === 'KR' ? '국내' : market === 'US' ? '미국' : '—'}</span>
      </div>
      <div className="block-b" style={{ paddingBottom: 8 }}>
        <div className="chart-intervals" role="tablist" aria-label="봉 단위">
          {CHART_INTERVALS.map((iv) => (
            <button
              key={iv}
              type="button"
              role="tab"
              aria-selected={interval === iv}
              className={`chart-iv${interval === iv ? ' on' : ''}`}
              disabled={!symbol || loading}
              onClick={() => setInterval(iv)}
            >
              {CHART_INTERVAL_LABELS[iv]}
            </button>
          ))}
        </div>
        {!symbol && (
          <p className="sub" style={{ margin: '8px 0 0' }}>
            종목을 선택하면 차트가 표시됩니다. (토스 API 1m/1d 기반 · 다봉은 서버 집계)
          </p>
        )}
        {loading && (
          <p className="sub" style={{ margin: '8px 0 0' }}>
            차트 불러오는 중…
          </p>
        )}
        {error && <p className="form-error">{error}</p>}
        {meta && !error && (
          <p className="sub" style={{ margin: '6px 0 0' }}>
            {meta}
          </p>
        )}
      </div>
      <div ref={containerRef} className="chart-canvas" />
    </section>
  )
}

function toChartTime(iso: string, interval: ChartInterval): Time | null {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null

  if (interval === '1d' || interval === '1w' || interval === '1mo') {
    const d = new Date(ms)
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
    const y = kst.getUTCFullYear()
    const m = String(kst.getUTCMonth() + 1).padStart(2, '0')
    const day = String(kst.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  return Math.floor(ms / 1000) as UTCTimestamp
}

function timeGreater(a: Time, b: Time): boolean {
  if (typeof a === 'number' && typeof b === 'number') return a > b
  return String(a) > String(b)
}
