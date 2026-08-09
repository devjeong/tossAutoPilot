'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Kind = 'market_brief_both' | 'market_brief_kr' | 'market_brief_us' | 'stock_brief'

export function ReportGeneratePanel({ watchSymbols = [] }: { watchSymbols?: string[] }) {
  const router = useRouter()
  const [kind, setKind] = useState<Kind>('market_brief_both')
  const [symbol, setSymbol] = useState(watchSymbols[0] ?? '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function onGenerate() {
    setPending(true)
    setError(null)
    setInfo(null)
    try {
      const body: { kind: Kind; symbol?: string } = { kind }
      if (kind === 'stock_brief') {
        if (!symbol.trim()) throw new Error('종목 심볼을 입력하세요')
        body.symbol = symbol.trim().toUpperCase()
      }
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = (await res.json()) as {
        ok: boolean
        id?: string
        title?: string
        provider?: string
        error?: string
      }
      if (!res.ok || !data.ok || !data.id) {
        throw new Error(data.error || '생성 실패')
      }
      setInfo(`생성 완료 (${data.provider})`)
      router.push(`/reports/${data.id}`)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="block">
      <div className="block-h">
        <span>보고서 생성</span>
        <span>R0 · R1</span>
      </div>
      <div className="block-b">
        <p className="sub" style={{ marginTop: 0 }}>
          시황(R0)은 토스 지수·랭킹·환율을, 종목(R1)은 가격·일봉·유의 + 뉴스/카더라를 수집합니다.
        </p>
        <div className="seg" style={{ marginTop: 12 }}>
          {(
            [
              ['market_brief_both', '시황 통합'],
              ['market_brief_kr', '시황 국내'],
              ['market_brief_us', '시황 미국'],
              ['stock_brief', '종목']
            ] as const
          ).map(([k, label]) => (
            <b
              key={k}
              className={kind === k ? 'on' : ''}
              role="button"
              tabIndex={0}
              onClick={() => setKind(k)}
            >
              {label}
            </b>
          ))}
        </div>

        {kind === 'stock_brief' && (
          <div style={{ marginTop: 12 }}>
            <label className="field">
              <span>종목 심볼</span>
              <input
                className="watch-input"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                placeholder="005930 또는 AAPL"
                list="watch-symbols"
              />
            </label>
            {watchSymbols.length > 0 && (
              <datalist id="watch-symbols">
                {watchSymbols.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            )}
          </div>
        )}

        {error && <p className="form-error">{error}</p>}
        {info && <p className="form-info">{info}</p>}
        <button type="button" className="btn" disabled={pending} onClick={() => void onGenerate()}>
          {pending ? '수집·작성 중…' : '보고서 생성'}
        </button>
      </div>
    </section>
  )
}
