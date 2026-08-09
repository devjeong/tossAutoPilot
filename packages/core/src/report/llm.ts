/**
 * LLM provider 어댑터 — Grok(xAI) / Claude / Gemini / 템플릿 폴백
 */

export type LlmProviderId = 'grok' | 'claude' | 'gemini' | 'template'

export interface LlmChatResult {
  text: string
  provider: string
  model: string
}

export interface LlmChatOptions {
  system: string
  user: string
  provider?: LlmProviderId
  /** 환경변수 대신 주입 (테스트) */
  env?: Record<string, string | undefined>
  fetchImpl?: typeof fetch
  temperature?: number
}

function envOf(opts: LlmChatOptions, key: string): string | undefined {
  return (opts.env ?? process.env)[key]
}

export function resolveProvider(opts: LlmChatOptions): LlmProviderId {
  const raw = (opts.provider || envOf(opts, 'REPORT_LLM_PROVIDER') || 'auto').toLowerCase()
  if (raw === 'grok' || raw === 'claude' || raw === 'gemini' || raw === 'template') {
    return raw
  }
  // auto
  if (envOf(opts, 'XAI_API_KEY') || envOf(opts, 'GROK_API_KEY')) return 'grok'
  if (envOf(opts, 'ANTHROPIC_API_KEY')) return 'claude'
  if (envOf(opts, 'GEMINI_API_KEY') || envOf(opts, 'GOOGLE_API_KEY')) return 'gemini'
  return 'template'
}

export async function chatCompletion(opts: LlmChatOptions): Promise<LlmChatResult> {
  const provider = resolveProvider(opts)
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch
  const temperature = opts.temperature ?? 0.3

  if (provider === 'template') {
    return { text: '', provider: 'template', model: 'none' }
  }

  if (provider === 'grok') {
    const key = envOf(opts, 'XAI_API_KEY') || envOf(opts, 'GROK_API_KEY')
    if (!key) throw new Error('XAI_API_KEY / GROK_API_KEY 없음')
    const model = envOf(opts, 'XAI_MODEL') || envOf(opts, 'GROK_MODEL') || 'grok-3-mini'
    const base = (envOf(opts, 'XAI_BASE_URL') || 'https://api.x.ai/v1').replace(/\/$/, '')
    const res = await fetchImpl(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        temperature,
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user', content: opts.user }
        ]
      })
    })
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      throw new Error(`Grok API ${res.status}: ${t.slice(0, 300)}`)
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const text = json.choices?.[0]?.message?.content ?? ''
    return { text, provider: 'grok', model }
  }

  if (provider === 'claude') {
    const key = envOf(opts, 'ANTHROPIC_API_KEY')
    if (!key) throw new Error('ANTHROPIC_API_KEY 없음')
    const model = envOf(opts, 'ANTHROPIC_MODEL') || 'claude-sonnet-4-20250514'
    const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        temperature,
        system: opts.system,
        messages: [{ role: 'user', content: opts.user }]
      })
    })
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      throw new Error(`Claude API ${res.status}: ${t.slice(0, 300)}`)
    }
    const json = (await res.json()) as {
      content?: { type: string; text?: string }[]
    }
    const text = json.content?.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n') ?? ''
    return { text, provider: 'claude', model }
  }

  // gemini
  const key = envOf(opts, 'GEMINI_API_KEY') || envOf(opts, 'GOOGLE_API_KEY')
  if (!key) throw new Error('GEMINI_API_KEY / GOOGLE_API_KEY 없음')
  const model = envOf(opts, 'GEMINI_MODEL') || 'gemini-2.0-flash'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: [{ role: 'user', parts: [{ text: opts.user }] }],
      generationConfig: { temperature }
    })
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`Gemini API ${res.status}: ${t.slice(0, 300)}`)
  }
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  const text =
    json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('\n') ?? ''
  return { text, provider: 'gemini', model }
}
