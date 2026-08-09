'use client'

import { useState, type FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type Mode = 'login' | 'signup'

export function LoginForm({ mode }: { mode: Mode }) {
  const router = useRouter()
  const search = useSearchParams()
  const next = search.get('next') || '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setPending(true)
    try {
      const supabase = createClient()
      if (mode === 'signup') {
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName || undefined }
          }
        })
        if (err) throw err
        if (data.session) {
          router.replace(next)
          router.refresh()
          return
        }
        setInfo('가입 요청이 접수되었습니다. 이메일 확인이 켜져 있으면 메일함에서 인증하세요.')
        return
      }

      const { error: err } = await supabase.auth.signInWithPassword({ email, password })
      if (err) throw err
      router.replace(next)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="auth-form" style={{ padding: 0 }} onSubmit={onSubmit}>
      {mode === 'signup' && (
        <label className="field">
          <span>표시 이름</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="선택"
            autoComplete="nickname"
          />
        </label>
      )}
      <label className="field">
        <span>이메일</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </label>
      <label className="field">
        <span>비밀번호</span>
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
        />
      </label>

      {error && <p className="form-error">{error}</p>}
      {info && <p className="form-info">{info}</p>}

      <button type="submit" className="btn" disabled={pending}>
        {pending ? '처리 중…' : mode === 'signup' ? '가입' : '로그인'}
      </button>

      <p className="auth-switch label">
        {mode === 'login' ? (
          <>
            계정이 없으면 <Link href="/signup">회원가입</Link>
          </>
        ) : (
          <>
            이미 있으면 <Link href="/login">로그인</Link>
          </>
        )}
      </p>
    </form>
  )
}
