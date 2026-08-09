import { LoginForm } from '@/components/LoginForm'

export default function SignupPage() {
  return (
    <div className="auth-shell">
      <section className="block auth-card" style={{ width: 'min(420px, 100%)' }}>
        <div className="block-h">
          <span>회원가입</span>
          <span>TossAutoPilot</span>
        </div>
        <div className="block-b">
          <p className="sub" style={{ marginBottom: 12 }}>
            프로필·엔진 상태가 자동 생성됩니다 · 모드 페이퍼
          </p>
          <LoginForm mode="signup" />
        </div>
      </section>
    </div>
  )
}
