# TossAutoPilot

토스증권 Open API 기반 **자동매매 웹 서비스**.

- 기능 명세: [`docs/FEATURE_SPEC.md`](docs/FEATURE_SPEC.md)
- 기술 스택: [`docs/TECH_STACK.md`](docs/TECH_STACK.md)

## 아키텍처

```
Browser  →  Vercel (Next.js)  →  Supabase (Auth / Postgres / Realtime)
                │
                │  ENGINE_URL
                ▼
         상시 PC 엔진 (:8787)  ──►  Toss Open API
         (공인 IP = 토스 허용 목록)
```

| 경로 | 역할 |
|---|---|
| `apps/web` | 관제 UI · 제어 API (Vercel) |
| `apps/engine` | 상주 매매 엔진 — **꺼지지 않는 PC** 권장 (토스 IP) |
| `packages/core` | decimal · 게이트 · 주문 · 차트 집계 |
| `packages/shared` | Zod 타입 · RiskConfig · EngineMode |
| `packages/db` | Drizzle 스키마 · Postgres 클라이언트 |

### 상시 PC 엔진 (권장 배포)

비용 없이 토스 IP 제한을 맞추려면 **고정으로 켜 둔 PC 1대**에서 엔진을 돌립니다.

1. 상세: [`docs/DEPLOY_HOME_ENGINE.md`](docs/DEPLOY_HOME_ENGINE.md)
2. 공인 IP 확인: `pnpm engine:ip` → 토스 콘솔에 등록
3. 엔진 실행: `pnpm engine:home` 또는 `.\scripts\home-engine\start-engine.ps1`
4. 부팅 자동 시작: `pnpm engine:autostart` (관리자 PowerShell)
5. Vercel: `ENGINE_URL` = 터널/공개 엔진 URL, `ENGINE_INTERNAL_SECRET` = PC 와 동일

## 요구 사항

- Node.js 20+
- pnpm 10+

## 시작

```bash
cd C:\DEV\TossAutoPilot
pnpm install
pnpm build:packages
pnpm test
```

### 웹 (Vercel 로컬)

```bash
pnpm dev:web
# http://localhost:3000
```

### 엔진 Worker (상시 PC)

```bash
# 개발
pnpm dev:engine

# 상시 PC 프로덕션 기동
pnpm engine:home
# GET http://127.0.0.1:8787/health

# 공인 IP (토스 등록용)
pnpm engine:ip
```

## 환경 변수

[`.env.example`](.env.example) 을 복사해 `apps/web/.env.local` 및 엔진 환경에 채웁니다.

Supabase 프로젝트 생성 후:

1. `DATABASE_URL` 설정
2. `pnpm db:push` 로 스키마 반영 (연결 가능할 때)
3. Auth · RLS 정책은 M1에서 추가

## 현재 마일스톤 — M1 Auth

- [x] monorepo (pnpm)
- [x] shared / core / db 패키지
- [x] Next.js 홈 스켈레톤
- [x] Engine health + tick 루프 스켈레톤
- [x] Supabase 스키마 push + RLS
- [x] Auth 로그인/회원가입 · middleware
- [x] profile / engine_status bootstrap
- [x] 자격증명 암호화 저장 (AES-256-GCM · `/settings`)
- [x] 실 API 연결 테스트 (OAuth 토큰 → 계좌 목록)
- [x] Engine heartbeat → DB (`engine_status.heartbeat_at`)
- [x] 시세 폴링 (watchlist → `/prices` → `quote_snapshots`)
- [x] 포트폴리오 홈 (총자산·예수금·보유 · KRW/USD 토글)
- [x] 시황 보고서 R0 (토스 데이터 · LLM/템플릿 · `/reports`)
- [x] 종목 보고서 R1 + 뉴스/카더라 화면 (`/news`)
- [x] 설정·보고서 전체 폭 레이아웃
- [ ] 게이트 10 전부 · 주문 command 경로
- [ ] basic-v1 전략
- [ ] 호가

### 보고서 · 뉴스

```bash
pnpm dev:web
# 보고서: 시황(R0) / 종목(R1) 생성
# 뉴스: 헤더 → 뉴스 → 뉴스 새로 수집 (카더라 필터)
# LLM 선택: XAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY
```



### 엔진 heartbeat

```bash
pnpm dev:engine
# GET http://127.0.0.1:8787/health  → dbEnabled, lastHeartbeatDb
```

웹 홈 헤더의 `hb Ns` 가 30초 이내면 엔진 생존으로 표시됩니다.

### DB

```bash
pnpm db:push          # drizzle push + RLS SQL
node scripts/db-sql.mjs packages/db/sql/001_auth_rls.sql
```

### 웹 Auth

```bash
pnpm env:normalize    # apps/web/.env.local 동기화
pnpm dev:web
# http://localhost:3000/login
```

Supabase Dashboard → Authentication 에서 Email 가입을 켜 두세요.
개발 중 이메일 확인이 번거로우면 **Confirm email** 을 끄면 바로 세션이 발급됩니다.

## 배포

| 대상 | 방법 |
|---|---|
| 웹 | Vercel — `apps/web` (Root Directory 또는 monorepo 설정) |
| DB | Supabase |
| 엔진 | `fly.toml` + `apps/engine/Dockerfile` |

> 자동매매 루프는 Vercel 서버리스에 두지 않습니다. 엔진은 상주 Worker가 담당합니다.
