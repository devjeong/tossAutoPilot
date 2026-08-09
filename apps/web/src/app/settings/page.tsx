import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getCredentialStatus } from '@/lib/credentials-store'
import { AppHeader } from '@/components/AppHeader'
import { CredentialsForm } from '@/components/CredentialsForm'

export default async function SettingsPage() {
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

  let credStatus = {
    hasCredentials: false,
    clientIdHint: null as string | null,
    updatedAt: null as string | null,
    isActive: false
  }
  let credError: string | null = null
  try {
    credStatus = await getCredentialStatus(user.id)
  } catch (e) {
    credError = e instanceof Error ? e.message : String(e)
  }

  const modeLabel = engine?.mode === 'live' ? '실거래' : '페이퍼'
  const stateLabel =
    engine?.state === 'running'
      ? '가동'
      : engine?.state === 'degraded'
        ? '저하'
        : engine?.state === 'error'
          ? '오류'
          : '정지'

  return (
    <div className="shell">
      <AppHeader
        email={user.email}
        engineState={engine?.state ?? 'stopped'}
        engineMode={engine?.mode ?? 'paper'}
        heartbeatAgeSec={heartbeatAgeSec}
        activePath="settings"
      />
      <main className="content page-wide">
        <div className="page-wide-inner">
          <div className="wide-grid-2">
            <section className="block">
              <div className="block-h">
                <span>계정</span>
                <span>인증</span>
              </div>
              <div className="block-b">
                <div className="kv">
                  <span>이메일</span>
                  <b className="mono">{user.email}</b>
                </div>
                <div className="kv">
                  <span>엔진</span>
                  <b className="mono">
                    {modeLabel} · {stateLabel}
                  </b>
                </div>
                <div className="kv">
                  <span>하트비트</span>
                  <b className="mono">
                    {heartbeatAgeSec == null ? '—' : `${heartbeatAgeSec}초`}
                  </b>
                </div>
                <Link href="/" className="btn ghost">
                  ← 홈
                </Link>
              </div>
            </section>

            <section className="block">
              <div className="block-h">
                <span>토스 API 자격증명</span>
              </div>
              <div className="block-b">
                {credError ? (
                  <p className="form-error">
                    조회 실패: {credError}
                    <br />
                    서비스 역할 키 · 마스터 키를 확인하세요.
                  </p>
                ) : (
                  <CredentialsForm initial={credStatus} />
                )}
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  )
}
