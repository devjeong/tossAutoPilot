import { redirect } from 'next/navigation'
import { DEFAULT_RISK_CONFIG } from '@tosspilot/shared'
import { killSwitchGate } from '@tosspilot/core'
import { createClient } from '@/lib/supabase/server'
import { ensureUserBootstrap } from '@/lib/bootstrap'
import { AppHeader } from '@/components/AppHeader'
import { RiskBoard } from '@/components/RiskBoard'
import { WatchlistQuotesCard } from '@/components/WatchlistQuotesCard'
import { PortfolioHero } from '@/components/PortfolioHero'
import type { PortfolioSnapshotDto } from '@tosspilot/core'
import { getCredentialStatus } from '@/lib/credentials-store'

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  await ensureUserBootstrap(
    supabase,
    user.id,
    (user.user_metadata?.display_name as string | undefined) ?? user.email ?? null
  )

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, risk_config')
    .eq('id', user.id)
    .maybeSingle()

  const { data: engine } = await supabase
    .from('engine_status')
    .select('mode, state, heartbeat_at, last_error, active_account_seq')
    .eq('user_id', user.id)
    .maybeSingle()

  const risk = (profile?.risk_config as typeof DEFAULT_RISK_CONFIG | null) ?? DEFAULT_RISK_CONFIG
  const kill = killSwitchGate(risk)

  let heartbeatAgeSec: number | null = null
  if (engine?.heartbeat_at) {
    heartbeatAgeSec = Math.max(
      0,
      Math.round((Date.now() - new Date(engine.heartbeat_at).getTime()) / 1000)
    )
  }

  let hasCredentials = false
  let clientIdHint: string | null = null
  try {
    const cred = await getCredentialStatus(user.id)
    hasCredentials = cred.hasCredentials
    clientIdHint = cred.clientIdHint
  } catch {
    /* ignore */
  }

  const { data: watchItems } = await supabase
    .from('watchlist_items')
    .select('id, symbol, market')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  const { data: quoteSnap } = await supabase
    .from('quote_snapshots')
    .select('quotes, symbol_count, poll_interval_ms, last_error, polled_at')
    .eq('user_id', user.id)
    .maybeSingle()

  const { data: portfolioRow } = await supabase
    .from('portfolio_snapshots')
    .select('snapshot, last_error, polled_at')
    .eq('user_id', user.id)
    .maybeSingle()

  const portfolioSnap =
    portfolioRow?.snapshot &&
    typeof portfolioRow.snapshot === 'object' &&
    'totals' in (portfolioRow.snapshot as object)
      ? (portfolioRow.snapshot as PortfolioSnapshotDto)
      : null

  return (
    <div className="shell">
      <AppHeader
        email={user.email}
        engineState={engine?.state ?? 'stopped'}
        engineMode={engine?.mode ?? 'paper'}
        heartbeatAgeSec={heartbeatAgeSec}
        activePath="home"
      />
      <main className="content">
        <div className="ops-layout">
          <aside className="ops-col">
            <RiskBoard
              risk={risk}
              killVerdict={kill.verdict}
              engineMode={engine?.mode}
              engineState={engine?.state}
              accountSeq={engine?.active_account_seq}
              heartbeatAgeSec={heartbeatAgeSec}
              hasCredentials={hasCredentials}
              clientIdHint={clientIdHint}
              engineError={engine?.last_error}
            />
          </aside>

          <section className="ops-col">
            <PortfolioHero
              initial={portfolioSnap}
              initialError={portfolioRow?.last_error ?? null}
              initialPolledAt={portfolioRow?.polled_at ?? null}
            />
          </section>

          <aside className="ops-col">
            <WatchlistQuotesCard
              initialItems={(watchItems ?? []).map((w) => ({
                id: w.id as string,
                symbol: w.symbol as string,
                market: w.market as string
              }))}
              initialSnapshot={
                quoteSnap
                  ? {
                      quotes:
                        (quoteSnap.quotes as {
                          symbol: string
                          lastPrice: string
                          currency: string
                          quoteTs?: string | null
                        }[]) ?? [],
                      symbol_count: quoteSnap.symbol_count as number,
                      poll_interval_ms: quoteSnap.poll_interval_ms as number | null,
                      last_error: quoteSnap.last_error as string | null,
                      polled_at: quoteSnap.polled_at as string | null
                    }
                  : null
              }
            />
          </aside>
        </div>
      </main>
    </div>
  )
}
