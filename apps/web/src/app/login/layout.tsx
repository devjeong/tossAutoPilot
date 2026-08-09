import { Suspense } from 'react'

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div className="auth-shell">로딩…</div>}>{children}</Suspense>
}
