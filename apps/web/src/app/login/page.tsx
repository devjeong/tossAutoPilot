import { LoginForm } from '@/components/LoginForm'

export default function LoginPage() {
  return (
    <div className="auth-shell">
      <section className="block auth-card" style={{ width: 'min(420px, 100%)' }}>
        <div className="block-h">
          <span>로그인</span>
          <span>TossAutoPilot</span>
        </div>
        <div className="block-b">
          <p className="sub" style={{ marginBottom: 12 }}>
            Supabase 인증 · 기본 엔진 모드 <strong>페이퍼</strong>
          </p>
          <LoginForm mode="login" />
        </div>
      </section>
    </div>
  )
}
