import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServerEnv } from '@/lib/env'
import { TelegramClient, masterKeyFromEnv, seal } from '@tosspilot/core'
import { z } from 'zod'

const Body = z.object({
  enabled: z.boolean(),
  chatId: z.string().optional(),
  botToken: z.string().optional(),
  notifyOnReserve: z.boolean().optional(),
  notifyOnSubmit: z.boolean().optional(),
  notifyOnFill: z.boolean().optional(),
  notifyOnCancel: z.boolean().optional(),
  testMessage: z.boolean().optional()
})

/** GET — 메타만 (토큰 미노출) */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('notification_settings')
    .select(
      'telegram_enabled, telegram_chat_id, notify_on_reserve, notify_on_submit, notify_on_fill, notify_on_cancel, telegram_bot_token_enc, updated_at'
    )
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    settings: data
      ? {
          enabled: data.telegram_enabled,
          chatId: data.telegram_chat_id,
          hasToken: Boolean(data.telegram_bot_token_enc),
          notifyOnReserve: data.notify_on_reserve,
          notifyOnSubmit: data.notify_on_submit,
          notifyOnFill: data.notify_on_fill,
          notifyOnCancel: data.notify_on_cancel,
          updatedAt: data.updated_at
        }
      : {
          enabled: false,
          chatId: null,
          hasToken: false,
          notifyOnReserve: true,
          notifyOnSubmit: true,
          notifyOnFill: true,
          notifyOnCancel: true,
          updatedAt: null
        }
  })
}

/** POST — 저장 / 테스트 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const env = getServerEnv()
  if (!env.credentialsMasterKey) {
    return NextResponse.json(
      { ok: false, error: 'CREDENTIALS_MASTER_KEY 미설정' },
      { status: 500 }
    )
  }

  let body: z.infer<typeof Body>
  try {
    body = Body.parse(await req.json())
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'invalid body' },
      { status: 400 }
    )
  }

  const { data: existing } = await supabase
    .from('notification_settings')
    .select('telegram_bot_token_enc')
    .eq('user_id', user.id)
    .maybeSingle()

  let tokenEnc = existing?.telegram_bot_token_enc as string | null | undefined
  if (body.botToken?.trim()) {
    tokenEnc = seal(body.botToken.trim(), masterKeyFromEnv(env.credentialsMasterKey))
  }

  if (body.enabled && !body.chatId?.trim()) {
    return NextResponse.json({ ok: false, error: 'chatId 가 필요합니다' }, { status: 400 })
  }
  if (body.enabled && !tokenEnc) {
    return NextResponse.json({ ok: false, error: 'bot token 이 필요합니다' }, { status: 400 })
  }

  const row = {
    user_id: user.id,
    telegram_enabled: body.enabled,
    telegram_chat_id: body.chatId?.trim() || null,
    telegram_bot_token_enc: tokenEnc ?? null,
    notify_on_reserve: body.notifyOnReserve ?? true,
    notify_on_submit: body.notifyOnSubmit ?? true,
    notify_on_fill: body.notifyOnFill ?? true,
    notify_on_cancel: body.notifyOnCancel ?? true,
    updated_at: new Date().toISOString()
  }

  const { error } = await supabase.from('notification_settings').upsert(row, {
    onConflict: 'user_id'
  })

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  if (body.testMessage && body.enabled && body.chatId && tokenEnc) {
    try {
      const { open } = await import('@tosspilot/core')
      const token = open(tokenEnc, masterKeyFromEnv(env.credentialsMasterKey))
      const client = new TelegramClient(token)
      const me = await client.getMe()
      if (!me.ok) {
        return NextResponse.json({
          ok: true,
          saved: true,
          test: { ok: false, error: me.description }
        })
      }
      const send = await client.sendMessage(
        body.chatId.trim(),
        `TossAutoPilot 알림 테스트\n봇 @${me.username ?? '?'}\n연결 정상`
      )
      return NextResponse.json({
        ok: true,
        saved: true,
        test: send.ok
          ? { ok: true, username: me.username }
          : { ok: false, error: send.description }
      })
    } catch (e) {
      return NextResponse.json({
        ok: true,
        saved: true,
        test: { ok: false, error: e instanceof Error ? e.message : String(e) }
      })
    }
  }

  return NextResponse.json({ ok: true, saved: true })
}
