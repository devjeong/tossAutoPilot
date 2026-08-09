import { redirect } from 'next/navigation'
import { DEFAULT_RISK_CONFIG, type RiskConfig } from '@tosspilot/shared'
import { createClient } from '@/lib/supabase/server'
import { ensureUserBootstrap } from '@/lib/bootstrap'
import { AppHeader } from '@/components/AppHeader'
import { TradePanel } from '@/components/TradePanel'

export default async function TradePage() {
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

  const { data: engine } = await supabase
    .from('engine_status')
    .select('mode, state, heartbeat_at')
    .eq('user_id', user.id)
    .maybeSingle()

  const { data: profile } = await supabase
    .from('profiles')
    .select('risk_config')
    .eq('id', user.id)
    .maybeSingle()

  const heartbeatAt = (engine?.heartbeat_at as string | null | undefined) ?? null

  const risk = {
    ...DEFAULT_RISK_CONFIG,
    ...((profile?.risk_config as RiskConfig | null) ?? {})
  }

  return (
    <div className="shell">
      <AppHeader
        email={user.email}
        engineState={engine?.state ?? 'stopped'}
        engineMode={engine?.mode ?? 'paper'}
        heartbeatAt={heartbeatAt}
        activePath="trade"
      />
      <main className="content page-wide">
        <div className="page-wide-inner">
          <TradePanel
            engineMode={(engine?.mode as string) ?? 'paper'}
            killSwitch={Boolean(risk.killSwitch)}
          />
        </div>
      </main>
    </div>
  )
}
