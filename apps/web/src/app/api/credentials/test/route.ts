import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { engineFetchJson } from '@/lib/engine-proxy'

type Body = {
  clientId?: string
  clientSecret?: string
  bindAccount?: boolean
}

/**
 * POST /api/credentials/test
 * 토스 연결 테스트는 엔진(허용 IP)에서만 수행.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  let body: Body = {}
  try {
    body = (await request.json()) as Body
  } catch {
    body = {}
  }

  const proxied = await engineFetchJson<Record<string, unknown>>(
    '/internal/toss/connection-test',
    {
      method: 'POST',
      body: JSON.stringify({
        userId: user.id,
        clientId: body.clientId?.trim() || undefined,
        clientSecret: body.clientSecret?.trim() || undefined,
        bindAccount: body.bindAccount !== false
      })
    }
  )

  if (!proxied.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: proxied.error,
        step: 'engine',
        via: 'engine-proxy'
      },
      { status: 200 }
    )
  }

  return NextResponse.json(proxied.data)
}
