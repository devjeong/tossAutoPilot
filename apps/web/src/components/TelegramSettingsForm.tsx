'use client'

import { useEffect, useState, type FormEvent } from 'react'

type Settings = {
  enabled: boolean
  chatId: string | null
  hasToken: boolean
  notifyOnReserve: boolean
  notifyOnSubmit: boolean
  notifyOnFill: boolean
  notifyOnCancel: boolean
}

export function TelegramSettingsForm() {
  const [s, setS] = useState<Settings | null>(null)
  const [chatId, setChatId] = useState('')
  const [botToken, setBotToken] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [notifyOnReserve, setNotifyOnReserve] = useState(true)
  const [notifyOnSubmit, setNotifyOnSubmit] = useState(true)
  const [notifyOnFill, setNotifyOnFill] = useState(true)
  const [notifyOnCancel, setNotifyOnCancel] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/notifications/telegram')
      const data = await res.json()
      if (data.ok && data.settings) {
        const st = data.settings as Settings
        setS(st)
        setEnabled(st.enabled)
        setChatId(st.chatId ?? '')
        setNotifyOnReserve(st.notifyOnReserve)
        setNotifyOnSubmit(st.notifyOnSubmit)
        setNotifyOnFill(st.notifyOnFill)
        setNotifyOnCancel(st.notifyOnCancel)
      }
    })()
  }, [])

  async function onSave(e: FormEvent, test = false) {
    e.preventDefault()
    setPending(true)
    setError(null)
    setInfo(null)
    try {
      const res = await fetch('/api/notifications/telegram', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          enabled,
          chatId,
          botToken: botToken.trim() || undefined,
          notifyOnReserve,
          notifyOnSubmit,
          notifyOnFill,
          notifyOnCancel,
          testMessage: test
        })
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || '저장 실패')
      setBotToken('')
      setS((prev) =>
        prev
          ? {
              ...prev,
              enabled,
              chatId,
              hasToken: prev.hasToken || Boolean(botToken.trim()),
              notifyOnReserve,
              notifyOnSubmit,
              notifyOnFill,
              notifyOnCancel
            }
          : prev
      )
      if (data.test) {
        if (data.test.ok) setInfo(`테스트 전송 성공 (@${data.test.username ?? '?'})`)
        else setError(`저장됨 · 테스트 실패: ${data.test.error}`)
      } else {
        setInfo('저장되었습니다')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="auth-form" style={{ padding: 0 }} onSubmit={(e) => void onSave(e, false)}>
      <p className="sub" style={{ marginTop: 0 }}>
        BotFather 로 봇 토큰을 만들고, 본인 채팅에서 봇을 시작한 뒤 chat id 를 넣으세요. 토큰은
        암호화 저장됩니다.
      </p>

      <label className="field" style={{ textTransform: 'none', letterSpacing: 'normal' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          텔레그램 알림 사용
        </span>
      </label>

      <label className="field">
        Chat ID
        <input value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="-100… 또는 숫자" />
      </label>

      <label className="field">
        Bot Token {s?.hasToken ? '(등록됨 · 변경 시에만 입력)' : ''}
        <input
          type="password"
          value={botToken}
          onChange={(e) => setBotToken(e.target.value)}
          placeholder={s?.hasToken ? '••••••••' : '123456:ABC…'}
          autoComplete="off"
        />
      </label>

      <label className="field" style={{ textTransform: 'none', letterSpacing: 'normal' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={notifyOnReserve}
            onChange={(e) => setNotifyOnReserve(e.target.checked)}
          />
          예약 등록·재예약
        </span>
      </label>
      <label className="field" style={{ textTransform: 'none', letterSpacing: 'normal' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={notifyOnSubmit}
            onChange={(e) => setNotifyOnSubmit(e.target.checked)}
          />
          주문 접수
        </span>
      </label>
      <label className="field" style={{ textTransform: 'none', letterSpacing: 'normal' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={notifyOnFill}
            onChange={(e) => setNotifyOnFill(e.target.checked)}
          />
          체결
        </span>
      </label>
      <label className="field" style={{ textTransform: 'none', letterSpacing: 'normal' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={notifyOnCancel}
            onChange={(e) => setNotifyOnCancel(e.target.checked)}
          />
          취소·종료
        </span>
      </label>

      <div className="btn-row">
        <button type="submit" className="btn" disabled={pending}>
          저장
        </button>
        <button
          type="button"
          className="btn ghost"
          disabled={pending}
          onClick={(e) => void onSave(e as unknown as FormEvent, true)}
        >
          저장 + 테스트
        </button>
      </div>

      {error && <p className="form-error">{error}</p>}
      {info && <p className="form-info">{info}</p>}
    </form>
  )
}
