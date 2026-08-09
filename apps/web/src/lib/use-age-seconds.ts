'use client'

import { useEffect, useState } from 'react'

/**
 * ISO 시각 기준 "몇 초 전" — 실제 1초 간격으로 갱신.
 * (useMemo(Date.now) 는 의존값이 안 바뀌면 숫자가  freeze 됨)
 */
export function useAgeSeconds(iso: string | null | undefined): number | null {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // 새 타임스탬프가 오면 즉시 다시 계산되도록 now 도 살짝 맞춤
  useEffect(() => {
    if (iso) setNow(Date.now())
  }, [iso])

  if (!iso) return null
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return null
  return Math.max(0, Math.floor((now - t) / 1000))
}
