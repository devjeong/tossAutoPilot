'use client'

import { useState, type FormEvent } from 'react'
import type { CredentialStatus } from '@/lib/credentials-types'

type Props = {
  initial: CredentialStatus
}

type TestOk = {
  ok: true
  baseUrl: string
  tokenHint: string
  expiresInSec: number
  accounts: { accountNo: string; accountSeq: number; accountType: string }[]
  brokerageAccountSeq: number | null
  latencyMs: { token: number; accounts: number; total: number }
  boundAccount: boolean
}

type TestFail = {
  ok: false
  error?: string
  step?: string
  status?: number
  latencyMs?: { token?: number; accounts?: number; total: number }
  baseUrl?: string
}

export function CredentialsForm({ initial }: Props) {
  const [status, setStatus] = useState(initial)
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestOk | TestFail | null>(null)

  async function onSave(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setPending(true)
    try {
      const res = await fetch('/api/credentials', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId, clientSecret })
      })
      const data = (await res.json()) as CredentialStatus & { ok: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error || '저장 실패')
      setStatus({
        hasCredentials: data.hasCredentials,
        clientIdHint: data.clientIdHint,
        updatedAt: data.updatedAt,
        isActive: data.isActive
      })
      setClientId('')
      setClientSecret('')
      setInfo('암호화하여 저장했습니다. 브라우저·응답에 Secret 은 남지 않습니다.')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPending(false)
    }
  }

  async function onClear() {
    if (!confirm('저장된 토스 API 자격증명을 삭제(비활성)할까요?')) return
    setError(null)
    setInfo(null)
    setTestResult(null)
    setPending(true)
    try {
      const res = await fetch('/api/credentials', { method: 'DELETE' })
      const data = (await res.json()) as CredentialStatus & { ok: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error || '삭제 실패')
      setStatus({
        hasCredentials: false,
        clientIdHint: null,
        updatedAt: null,
        isActive: false
      })
      setInfo('자격증명을 비활성 처리했습니다.')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPending(false)
    }
  }

  async function onTest() {
    setError(null)
    setInfo(null)
    setTestResult(null)
    setTesting(true)
    try {
      const body: { clientId?: string; clientSecret?: string } = {}
      if (clientId.trim() && clientSecret.trim()) {
        body.clientId = clientId.trim()
        body.clientSecret = clientSecret.trim()
      } else if (!status.hasCredentials) {
        throw new Error(
          '저장된 키가 없습니다. Client ID/Secret 을 입력한 뒤 테스트하거나 먼저 저장하세요.'
        )
      }

      const res = await fetch('/api/credentials/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = (await res.json()) as TestOk | TestFail
      if (!res.ok && !('ok' in data)) {
        throw new Error('연결 테스트 요청 실패')
      }
      setTestResult(data)
      if (data.ok) {
        setInfo(
          `실 API 연결 성공 · 토큰 ${data.expiresInSec}초 · 계좌 ${data.accounts.length}개` +
            (data.boundAccount && data.brokerageAccountSeq != null
              ? ` · 계좌번호(seq) ${data.brokerageAccountSeq} 반영`
              : '')
        )
      } else {
        setError(
          `연결 실패 (${data.step ?? '?'})` +
            (data.status ? ` HTTP ${data.status}` : '') +
            `: ${data.error ?? 'unknown'}`
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="cred-block">
      <div className="kv">
        <span>상태</span>
        <b>{status.hasCredentials ? '암호화 저장됨' : '없음'}</b>
      </div>
      {status.clientIdHint && (
        <div className="kv">
          <span>클라이언트 ID</span>
          <b className="mono">{status.clientIdHint}</b>
        </div>
      )}
      {status.updatedAt && (
        <div className="kv">
          <span>갱신</span>
          <b className="mono">{new Date(status.updatedAt).toLocaleString('ko-KR')}</b>
        </div>
      )}
      <p className="sub" style={{ marginBottom: 12 }}>
        Secret 은 서버 vault 에만 보관됩니다. AES-256-GCM.
      </p>

      <form className="auth-form" style={{ padding: 0 }} onSubmit={onSave}>
        <label className="field">
          <span>클라이언트 ID</span>
          <input
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder={status.hasCredentials ? '변경 시에만 입력' : 'c_…'}
            autoComplete="off"
            required
          />
        </label>
        <label className="field">
          <span>클라이언트 시크릿</span>
          <input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder={status.hasCredentials ? '변경 시에만 입력' : 's_…'}
            autoComplete="new-password"
            required
          />
        </label>

        {error && <p className="form-error">{error}</p>}
        {info && <p className="form-info">{info}</p>}

        <div className="btn-row" style={{ marginTop: 12 }}>
          <button type="submit" className="btn" disabled={pending || testing}>
            {pending ? '처리 중…' : status.hasCredentials ? '다시 저장' : '암호화 저장'}
          </button>
          <button
            type="button"
            className="btn ghost"
            disabled={pending || testing}
            onClick={() => void onTest()}
          >
            {testing ? '연결 중…' : '실 API 연결 테스트'}
          </button>
        </div>
        {status.hasCredentials && (
          <button
            type="button"
            className="btn ghost"
            disabled={pending || testing}
            onClick={() => void onClear()}
          >
            삭제
          </button>
        )}
      </form>

      {testResult && (
        <div className={`test-result ${testResult.ok ? 'ok' : 'fail'}`}>
          <div className="kv">
            <span>테스트</span>
            <b>{testResult.ok ? '성공' : '실패'}</b>
          </div>
          {testResult.ok ? (
            <>
              <div className="kv">
                <span>토큰</span>
                <b className="mono">{testResult.tokenHint}</b>
              </div>
              <div className="kv">
                <span>계좌번호(seq)</span>
                <b className="mono">{testResult.brokerageAccountSeq ?? '—'}</b>
              </div>
              <div className="kv">
                <span>지연</span>
                <b className="mono">{testResult.latencyMs.total}ms</b>
              </div>
            </>
          ) : (
            <p className="form-error">
              {testResult.step}: {testResult.error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
