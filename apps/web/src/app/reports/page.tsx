import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { AppHeader } from '@/components/AppHeader'
import { ReportGeneratePanel } from '@/components/ReportGeneratePanel'

export default async function ReportsPage() {
  const supabase = await createClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: engine } = await supabase
    .from('engine_status')
    .select('mode, state, heartbeat_at')
    .eq('user_id', user.id)
    .maybeSingle()

  const heartbeatAt = (engine?.heartbeat_at as string | null | undefined) ?? null

  const { data: watch } = await supabase
    .from('watchlist_items')
    .select('symbol')
    .eq('user_id', user.id)
    .limit(30)

  const watchSymbols = (watch ?? []).map((w) => String(w.symbol))

  const { data: items } = await supabase
    .from('market_reports')
    .select('id, kind, status, title, provider, model, kadara_count, created_at, error, payload')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <div className="shell">
      <AppHeader
        email={user.email}
        engineState={engine?.state ?? 'stopped'}
        engineMode={engine?.mode ?? 'paper'}
        heartbeatAt={heartbeatAt}
        activePath="reports"
      />
      <main className="content page-wide">
        <div className="page-wide-inner">
          <div className="alert">
            보고서 — 시황(R0) · 종목(R1) · 투자 권유 아님
          </div>

          <div className="wide-grid-2">
            <ReportGeneratePanel watchSymbols={watchSymbols} />

            <section className="block">
              <div className="block-h">
                <span>보고서 목록</span>
                <span>{items?.length ?? 0}건</span>
              </div>
              {!items?.length ? (
                <div className="block-b">
                  <p className="sub" style={{ margin: 0 }}>
                    아직 보고서가 없습니다. 왼쪽에서 생성하세요.
                  </p>
                </div>
              ) : (
                <div className="table-scroll">
                <table className="data">
                  <thead>
                    <tr>
                      <th>제목</th>
                      <th>종류</th>
                      <th>상태</th>
                      <th>작성</th>
                      <th>시각</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((r) => {
                      const payload = (r.payload ?? {}) as { symbol?: string }
                      return (
                        <tr key={r.id as string}>
                          <td>
                            <Link href={`/reports/${r.id as string}`}>
                              <strong>{r.title as string}</strong>
                            </Link>
                            {r.status === 'failed' && r.error ? (
                              <div className="form-error" style={{ marginTop: 4 }}>
                                {r.error as string}
                              </div>
                            ) : null}
                          </td>
                          <td className="mono">{kindKo(r.kind as string, payload.symbol)}</td>
                          <td className="mono">{statusKo(r.status as string)}</td>
                          <td className="mono">
                            {(r.provider as string) ?? '—'}
                            {r.kadara_count ? ` · 카더라 ${r.kadara_count}` : ''}
                          </td>
                          <td className="mono">
                            {new Date(r.created_at as string).toLocaleString('ko-KR')}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                </div>
              )}
            </section>
          </div>

          <div className="page-actions">
            <Link href="/news" className="btn ghost">
              뉴스·카더라
            </Link>
            <Link href="/" className="btn ghost">
              홈
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}

function statusKo(s: string): string {
  if (s === 'completed') return '완료'
  if (s === 'failed') return '실패'
  if (s === 'running') return '작성중'
  return s
}

function kindKo(k: string, symbol?: string): string {
  if (k === 'stock_brief') return symbol ? `종목 ${symbol}` : '종목'
  if (k === 'market_brief_kr') return '시황 국내'
  if (k === 'market_brief_us') return '시황 미국'
  if (k === 'market_brief_both') return '시황 통합'
  return k
}
