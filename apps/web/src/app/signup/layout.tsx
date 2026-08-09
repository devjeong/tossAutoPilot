import { Suspense } from 'react'

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div className="auth-shell">로딩…</div>}>{children}</Suspense>
}
