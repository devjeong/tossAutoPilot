/**
 * Telegram Bot API 최소 클라이언트.
 */
export type TelegramSendResult = {
  ok: boolean
  description?: string
  messageId?: number
}

export class TelegramClient {
  private readonly base: string

  constructor(
    private readonly botToken: string,
    private readonly fetchImpl: typeof fetch = globalThis.fetch
  ) {
    if (!botToken.trim()) throw new Error('Telegram bot token 이 비어 있습니다')
    this.base = `https://api.telegram.org/bot${botToken.trim()}`
  }

  async sendMessage(
    chatId: string | number,
    text: string,
    opts?: { disableWebPagePreview?: boolean; parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2' }
  ): Promise<TelegramSendResult> {
    const res = await this.fetchImpl(`${this.base}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: opts?.disableWebPagePreview ?? true,
        ...(opts?.parseMode ? { parse_mode: opts.parseMode } : {})
      })
    })
    const body = (await res.json()) as {
      ok: boolean
      description?: string
      result?: { message_id: number }
    }
    if (!body.ok) {
      return { ok: false, description: body.description ?? `HTTP ${res.status}` }
    }
    return { ok: true, messageId: body.result?.message_id }
  }

  async getMe(): Promise<{ ok: boolean; username?: string; description?: string }> {
    const res = await this.fetchImpl(`${this.base}/getMe`)
    const body = (await res.json()) as {
      ok: boolean
      description?: string
      result?: { username?: string }
    }
    if (!body.ok) return { ok: false, description: body.description ?? `HTTP ${res.status}` }
    return { ok: true, username: body.result?.username }
  }
}
