import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { AppHeader } from '@/components/AppHeader'
import { ReportBody } from '@/components/ReportBody'

type Props = { params: Promise<{ id: string }> }

export default async function ReportDetailPage({ params }: Props) {
  const { id } = await params
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

  let heartbeatAgeSec: number | null = null
  if (engine?.heartbeat_at) {
    heartbeatAgeSec = Math.max(
      0,
      Math.round((Date.now() - new Date(engine.heartbeat_at).getTime()) / 1000)
    )
  }

  const { data: report } = await supabase
    .from('market_reports')
    .select(
      'id, kind, status, title, body_markdown, provider, model, kadara_count, payload, error, created_at'
    )
    .eq('user_id', user.id)
    .eq('id', id)
    .maybeSingle()

  if (!report) notFound()

  const payload = (report.payload ?? {}) as {
    sources?: { id: string; label: string; tier: string }[]
    symbol?: string
  }

  return (
    <div className="shell">
      <AppHeader
        email={user.email}
        engineState={engine?.state ?? 'stopped'}
        engineMode={engine?.mode ?? 'paper'}
        heartbeatAgeSec={heartbeatAgeSec}
        activePath="reports"
      />
      <main className="content page-wide">
        <div className="page-wide-inner">
          <div className="wide-grid-2">
            <section className="block">
              <div className="block-h">
                <span>{report.title as string}</span>
                <span className="mono">
                  {new Date(report.created_at as string).toLocaleString('ko-KR')}
                </span>
              </div>
              <div className="block-b">
                <div className="kv">
                  <span>상태</span>
                  <b>
                    {report.status === 'completed'
                      ? '완료'
                      : report.status === 'failed'
                        ? '실패'
                        : String(report.status)}
                  </b>
                </div>
                <div className="kv">
                  <span>종류</span>
                  <b>
                    {report.kind === 'stock_brief'
                      ? `종목 ${payload.symbol ?? ''}`
                      : '시황'}
                  </b>
                </div>
                <div className="kv">
                  <span>작성 엔진</span>
                  <b className="mono">
                    {(report.provider as string) ?? '—'} / {(report.model as string) ?? '—'}
                  </b>
                </div>
                <div className="kv">
                  <span>카더라 표기</span>
                  <b>{(report.kadara_count as number) ?? 0}회</b>
                </div>
                {report.error ? (
                  <p className="form-error">{report.error as string}</p>
                ) : null}
              </div>
              <div className="block-b" style={{ borderTop: '2px solid #111' }}>
                <ReportBody markdown={(report.body_markdown as string) || '(본문 없음)'} />
              </div>
            </section>

            <section className="block">
              <div className="block-h">
                <span>출처</span>
                <span>{payload.sources?.length ?? 0}</span>
              </div>
              <div className="block-b">
                {!payload.sources?.length ? (
                  <p className="sub" style={{ margin: 0 }}>
                    출처 메타 없음
                  </p>
                ) : (
                  payload.sources.map((s) => (
                    <div className="kv" key={s.id}>
                      <span className="mono">{s.id}</span>
                      <b style={{ fontWeight: 600, maxWidth: '62%', textAlign: 'right' }}>
                        {s.label}
                        {s.tier === 'unknown' ? ' · 카더라' : ''}
                      </b>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <Link href="/reports" className="btn ghost" style={{ width: 'auto' }}>
              ← 목록
            </Link>
            <Link href="/news" className="btn ghost" style={{ width: 'auto' }}>
              뉴스
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
