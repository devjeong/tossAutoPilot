'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'

export type NewsRow = {
  id: string
  title: string
  summary: string | null
  url: string | null
  source_name: string
  source_tier: string
  is_kadara: boolean
  market: string | null
  symbols: string[] | null
  published_at: string | null
  collected_at: string
}

type Props = {
  initialItems: NewsRow[]
}

export function NewsFeedPanel({ initialItems }: Props) {
  const router = useRouter()
  const [items, setItems] = useState(initialItems)
  const [filter, setFilter] = useState<'all' | 'kadara' | 'sourced'>('all')
  const [market, setMarket] = useState<'ALL' | 'KR' | 'US'>('ALL')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const load = useCallback(
    async (f = filter, m = market) => {
      const qs = new URLSearchParams()
      if (f !== 'all') qs.set('filter', f)
      if (m !== 'ALL') qs.set('market', m)
      const res = await fetch(`/api/news?${qs}`)
      const data = (await res.json()) as { ok: boolean; items?: NewsRow[]; error?: string }
      if (!data.ok) throw new Error(data.error || '조회 실패')
      setItems(data.items ?? [])
    },
    [filter, market]
  )

  async function onRefresh() {
    setPending(true)
    setError(null)
    setInfo(null)
    try {
      const res = await fetch('/api/news', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ market })
      })
      const data = (await res.json()) as {
        ok: boolean
        saved?: number
        kadaraCount?: number
        errors?: string[]
        error?: string
      }
      if (!res.ok || !data.ok) throw new Error(data.error || '수집 실패')
      setInfo(
        `수집 ${data.saved ?? 0}건 · 카더라 ${data.kadaraCount ?? 0}건` +
          (data.errors?.length ? ` · 경고 ${data.errors.length}` : '')
      )
      await load()
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  async function onFilter(f: 'all' | 'kadara' | 'sourced') {
    setFilter(f)
    try {
      await load(f, market)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function onMarket(m: 'ALL' | 'KR' | 'US') {
    setMarket(m)
    try {
      await load(filter, m)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const shown = items

  return (
    <>
      <section className="block">
        <div className="block-h">
          <span>뉴스 · 카더라</span>
          <span>{shown.length}건</span>
        </div>
        <div className="block-b">
          <p className="sub" style={{ marginTop: 0 }}>
            공개 RSS(Google News 등)로 헤드라인을 모읍니다. 출처가 불명확하면{' '}
            <mark className="kadara">(카더라)</mark> 로 표시합니다.
          </p>
          <div className="seg" style={{ marginTop: 12 }}>
            <b className={filter === 'all' ? 'on' : ''} role="button" tabIndex={0} onClick={() => void onFilter('all')}>
              전체
            </b>
            <b
              className={filter === 'kadara' ? 'on' : ''}
              role="button"
              tabIndex={0}
              onClick={() => void onFilter('kadara')}
            >
              카더라만
            </b>
            <b
              className={filter === 'sourced' ? 'on' : ''}
              role="button"
              tabIndex={0}
              onClick={() => void onFilter('sourced')}
            >
              출처 있음
            </b>
          </div>
          <div className="seg" style={{ marginTop: 8 }}>
            <b className={market === 'ALL' ? 'on' : ''} role="button" tabIndex={0} onClick={() => void onMarket('ALL')}>
              전체 시장
            </b>
            <b className={market === 'KR' ? 'on' : ''} role="button" tabIndex={0} onClick={() => void onMarket('KR')}>
              국내
            </b>
            <b className={market === 'US' ? 'on' : ''} role="button" tabIndex={0} onClick={() => void onMarket('US')}>
              미국
            </b>
          </div>
          {error && <p className="form-error">{error}</p>}
          {info && <p className="form-info">{info}</p>}
          <button type="button" className="btn" disabled={pending} onClick={() => void onRefresh()}>
            {pending ? '수집 중…' : '뉴스 새로 수집'}
          </button>
        </div>
      </section>

      <section className="block">
        <div className="block-h">
          <span>목록</span>
        </div>
        {!shown.length ? (
          <div className="block-b">
            <p className="sub" style={{ margin: 0 }}>
              아직 항목이 없습니다. 「뉴스 새로 수집」을 눌러 주세요.
            </p>
          </div>
        ) : (
          <div className="news-list">
            {shown.map((n) => (
              <article key={n.id} className={`news-item${n.is_kadara ? ' kadara-row' : ''}`}>
                <div className="news-meta">
                  {n.is_kadara ? (
                    <mark className="kadara">(카더라)</mark>
                  ) : (
                    <span className="badge" style={{ background: '#e8f8ef' }}>
                      출처
                    </span>
                  )}
                  <span className="mono">{n.source_name}</span>
                  <span className="muted">
                    {n.published_at
                      ? new Date(n.published_at).toLocaleString('ko-KR')
                      : new Date(n.collected_at).toLocaleString('ko-KR')}
                  </span>
                  {n.market && n.market !== 'ALL' && (
                    <span className="badge idle">{n.market}</span>
                  )}
                </div>
                <h3 className="news-title">
                  {n.url ? (
                    <a href={n.url} target="_blank" rel="noreferrer noopener">
                      {n.title}
                    </a>
                  ) : (
                    n.title
                  )}
                </h3>
                {n.summary && <p className="news-summary">{n.summary}</p>}
                {n.symbols && n.symbols.length > 0 && (
                  <div className="news-symbols mono">
                    {n.symbols.map((s) => (
                      <span key={s} className="badge idle">
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  )
}
