'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function SignOutButton() {
  const router = useRouter()
  return (
    <button
      type="button"
      className="btn ghost"
      onClick={async () => {
        const supabase = createClient()
        await supabase.auth.signOut()
        router.replace('/login')
        router.refresh()
      }}
    >
      로그아웃
    </button>
  )
}
