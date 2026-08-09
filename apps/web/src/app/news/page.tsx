import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { AppHeader } from '@/components/AppHeader'
import { NewsFeedPanel, type NewsRow } from '@/components/NewsFeedPanel'

export default async function NewsPage() {
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

  const { data: items } = await supabase
    .from('news_items')
    .select(
      'id, title, summary, url, source_name, source_tier, is_kadara, market, symbols, published_at, collected_at'
    )
    .eq('user_id', user.id)
    .order('collected_at', { ascending: false })
    .limit(100)

  return (
    <div className="shell">
      <AppHeader
        email={user.email}
        engineState={engine?.state ?? 'stopped'}
        engineMode={engine?.mode ?? 'paper'}
        heartbeatAgeSec={heartbeatAgeSec}
        activePath="news"
      />
      <main className="content page-wide">
        <div className="page-wide-inner">
          <div className="alert">
            뉴스·카더라 피드 — 출처 불명은 (카더라) · 투자 판단 참고용 아님
          </div>
          <div className="wide-grid">
            <NewsFeedPanel initialItems={(items ?? []) as NewsRow[]} />
          </div>
          <div style={{ marginTop: 12 }}>
            <Link href="/reports" className="btn ghost" style={{ width: 'auto', display: 'inline-block' }}>
              보고서
            </Link>{' '}
            <Link href="/" className="btn ghost" style={{ width: 'auto', display: 'inline-block' }}>
              홈
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
