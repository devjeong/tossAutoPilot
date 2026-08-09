import { createServer } from 'node:http'
import { DEFAULT_ENGINE_MODE, DEFAULT_RISK_CONFIG } from '@tosspilot/shared'
import { killSwitchGate, makeClientOrderId, redact } from '@tosspilot/core'
import { getEngineConfig, loadEngineEnv } from './config.js'
import { createEngineSupabase } from './supabase.js'
import { EngineLoop } from './loop.js'

loadEngineEnv()
const cfg = getEngineConfig()
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

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${cfg.port}`)

  if (req.method === 'GET' && url.pathname === '/health') {
    const body = JSON.stringify({
      ok: true,
      service: 'tosspilot-engine',
      modeDefault: DEFAULT_ENGINE_MODE,
      killSwitch: killSwitchGate(DEFAULT_RISK_CONFIG),
      dbEnabled: cfg.hasDb,
      hasMasterKey: Boolean(cfg.credentialsMasterKey),
      userId: cfg.userId,
      status: loop.status(),
      sampleClientOrderId: makeClientOrderId('health')
    })
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    res.end(body)
    return
  }

  if (req.method === 'POST' && url.pathname === '/internal/start') {
    loop.start()
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, status: loop.status() }))
    return
  }

  if (req.method === 'POST' && url.pathname === '/internal/stop') {
    void loop.stop().then(() => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, status: loop.status() }))
    })
    return
  }

  res.writeHead(404, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ ok: false, error: 'not found' }))
})

server.listen(cfg.port, () => {
  console.log(
    JSON.stringify(
      redact({
        msg: 'TossAutoPilot engine listening',
        port: cfg.port,
        tickMs: cfg.tickMs,
        heartbeatMs: cfg.heartbeatMs,
        quotesIntervalMs: cfg.quotesIntervalMs,
        dbEnabled: cfg.hasDb,
        hasMasterKey: Boolean(cfg.credentialsMasterKey),
        userId: cfg.userId,
        modeDefault: DEFAULT_ENGINE_MODE
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
        msg: 'warning: CREDENTIALS_MASTER_KEY missing — quotes poller disabled'
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
