import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  clearCredentials,
  getCredentialStatus,
  saveCredentials
} from '@/lib/credentials-store'

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
    error
  } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

/** GET — 상태만 (시크릿 없음) */
export async function GET() {
  const user = await requireUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  try {
    const status = await getCredentialStatus(user.id)
    return NextResponse.json({ ok: true, ...status })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}

/** POST — 저장 (본문은 서버에서만 처리, 응답에 secret 없음) */
export async function POST(request: Request) {
  const user = await requireUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  let body: { clientId?: string; clientSecret?: string }
  try {
    body = (await request.json()) as { clientId?: string; clientSecret?: string }
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 })
  }

  try {
    const status = await saveCredentials(user.id, {
      clientId: body.clientId ?? '',
      clientSecret: body.clientSecret ?? ''
    })
    return NextResponse.json({ ok: true, ...status })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 400 }
    )
  }
}

/** DELETE — active 자격증명 비활성 */
export async function DELETE() {
  const user = await requireUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  try {
    await clearCredentials(user.id)
    return NextResponse.json({
      ok: true,
      hasCredentials: false,
      clientIdHint: null,
      updatedAt: null,
      isActive: false
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}
