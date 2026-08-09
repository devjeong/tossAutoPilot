import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { DEFAULT_ENGINE_MODE, DEFAULT_RISK_CONFIG } from '@tosspilot/shared'
import { killSwitchGate, makeClientOrderId, redact } from '@tosspilot/core'
import { getEngineConfig, loadEngineEnv } from './config.js'
import { createEngineSupabase } from './supabase.js'
import { EngineLoop } from './loop.js'
import { handleMarketCandles, handleMarketSearch } from './market-api.js'

loadEngineEnv()
const cfg = getEngineConfig()

if (cfg.requireSecret && !cfg.internalSecret) {
  console.error(
    JSON.stringify({
      msg: 'ENGINE_INTERNAL_SECRET required',
      detail:
        '상시 PC(ENGINE_HOST=0.0.0.0) 에서는 시크릿이 필수입니다. .env 에 ENGINE_INTERNAL_SECRET 을 넣고 Vercel 에도 동일 값을 설정하세요.',
      hint: 'node -e "console.log(require(\'crypto\').randomBytes(24).toString(\'hex\'))"'
    })
  )
  process.exit(1)
}

const supabase = createEngineSupabase(cfg)

const loop = new EngineLoop({
  tickMs: cfg.tickMs,
  heartbeatMs: cfg.heartbeatMs,
  config: cfg,
  supabase,
  masterKey: cfg.credentialsMasterKey,
  quotesIntervalMs: cfg.quotesIntervalMs,
  portfolioIntervalMs: cfg.portfolioIntervalMs
})

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

function checkInternalAuth(req: IncomingMessage): boolean {
  // 시크릿 미설정 + requireSecret=false: 로컬 전용 개발
  if (!cfg.internalSecret) return !cfg.requireSecret
  const h = req.headers['x-engine-secret']
  const auth = req.headers.authorization
  if (h === cfg.internalSecret) return true
  if (typeof auth === 'string' && auth === `Bearer ${cfg.internalSecret}`) return true
  return false
}

const server = createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${cfg.port}`)

    if (req.method === 'GET' && url.pathname === '/health') {
      json(res, 200, {
        ok: true,
        service: 'tosspilot-engine',
        deployMode: cfg.deployMode,
        host: cfg.host,
        port: cfg.port,
        modeDefault: DEFAULT_ENGINE_MODE,
        killSwitch: killSwitchGate(DEFAULT_RISK_CONFIG),
        dbEnabled: cfg.hasDb,
        hasMasterKey: Boolean(cfg.credentialsMasterKey),
        hasInternalSecret: Boolean(cfg.internalSecret),
        userId: cfg.userId,
        status: loop.status(),
        sampleClientOrderId: makeClientOrderId('health'),
        tossNote: '토스 API 호출은 이 머신의 공인 IP 로 나갑니다. 토스 콘솔에 그 IP 를 등록하세요.'
      })
      return
    }

    if (req.method === 'POST' && url.pathname === '/internal/start') {
      if (!checkInternalAuth(req)) {
        json(res, 401, { ok: false, error: 'unauthorized' })
        return
      }
      loop.start()
      json(res, 200, { ok: true, status: loop.status() })
      return
    }

    if (req.method === 'POST' && url.pathname === '/internal/stop') {
      if (!checkInternalAuth(req)) {
        json(res, 401, { ok: false, error: 'unauthorized' })
        return
      }
      await loop.stop()
      json(res, 200, { ok: true, status: loop.status() })
      return
    }

    // ── Market proxy (Toss IP 허용 호스트에서만 성공) ──────────────
    if (req.method === 'POST' && url.pathname === '/internal/market/candles') {
      if (!checkInternalAuth(req)) {
        json(res, 401, { ok: false, error: 'unauthorized' })
        return
      }
      if (!supabase) {
        json(res, 503, { ok: false, error: 'engine supabase not configured' })
        return
      }
      let body: { userId?: string; symbol?: string; interval?: string }
      try {
        body = JSON.parse(await readBody(req)) as typeof body
      } catch {
        json(res, 400, { ok: false, error: 'invalid json' })
        return
      }
      if (!body.userId || !body.symbol) {
        json(res, 400, { ok: false, error: 'userId and symbol required' })
        return
      }
      const result = await handleMarketCandles({
        supabase,
        config: cfg,
        masterKey: cfg.credentialsMasterKey,
        userId: body.userId,
        symbol: body.symbol,
        interval: body.interval || '1d'
      })
      json(res, result.status, result.body)
      return
    }

    if (req.method === 'POST' && url.pathname === '/internal/market/search') {
      if (!checkInternalAuth(req)) {
        json(res, 401, { ok: false, error: 'unauthorized' })
        return
      }
      if (!supabase) {
        json(res, 503, { ok: false, error: 'engine supabase not configured' })
        return
      }
      let body: { userId?: string; q?: string }
      try {
        body = JSON.parse(await readBody(req)) as typeof body
      } catch {
        json(res, 400, { ok: false, error: 'invalid json' })
        return
      }
      if (!body.userId) {
        json(res, 400, { ok: false, error: 'userId required' })
        return
      }
      const result = await handleMarketSearch({
        supabase,
        config: cfg,
        masterKey: cfg.credentialsMasterKey,
        userId: body.userId,
        q: body.q ?? ''
      })
      json(res, result.status, result.body)
      return
    }

    json(res, 404, { ok: false, error: 'not found' })
  })().catch((e) => {
    console.error(JSON.stringify({ msg: 'request error', error: String(e) }))
    try {
      json(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) })
    } catch {
      /* ignore */
    }
  })
})

server.listen(cfg.port, cfg.host, () => {
  console.log(
    JSON.stringify(
      redact({
        msg: 'TossAutoPilot engine listening',
        deployMode: cfg.deployMode,
        host: cfg.host,
        port: cfg.port,
        health: `http://127.0.0.1:${cfg.port}/health`,
        tickMs: cfg.tickMs,
        heartbeatMs: cfg.heartbeatMs,
        quotesIntervalMs: cfg.quotesIntervalMs,
        dbEnabled: cfg.hasDb,
        hasMasterKey: Boolean(cfg.credentialsMasterKey),
        hasInternalSecret: Boolean(cfg.internalSecret),
        userId: cfg.userId,
        modeDefault: DEFAULT_ENGINE_MODE,
        marketProxy: ['/internal/market/candles', '/internal/market/search'],
        homePc:
          '1) 공인 IP → 토스 허용목록  2) Vercel ENGINE_URL → 이 PC 공개 URL  3) ENGINE_INTERNAL_SECRET 동일'
      })
    )
  )
  if (!cfg.hasDb) {
    console.warn(
      JSON.stringify({
        msg: 'warning: Supabase not configured',
        need: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY']
      })
    )
  }
  if (!cfg.credentialsMasterKey) {
    console.warn(
      JSON.stringify({
        msg: 'warning: CREDENTIALS_MASTER_KEY missing — quotes/market proxy limited'
      })
    )
  }
  if (cfg.host === '0.0.0.0' && !cfg.internalSecret) {
    console.warn(
      JSON.stringify({
        msg: 'warning: listening on all interfaces without ENGINE_INTERNAL_SECRET'
      })
    )
  }
  loop.start()
})

function shutdown() {
  void loop.stop().then(() => {
    server.close(() => process.exit(0))
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
