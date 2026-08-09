# TossAutoPilot — 기술 스택 (Vercel + Supabase)

| 항목 | 내용 |
|---|---|
| 문서 버전 | 0.1 (2026-08-09) |
| 배포 전제 | **Vercel** (웹·API) + **Supabase** (Auth·DB·Realtime) |
| 선행 문서 | [`FEATURE_SPEC.md`](./FEATURE_SPEC.md) |
| 결정 상태 | **채택** (MVP 기준) |

---

## 0. 한 줄 결론

| 계층 | 선택 |
|---|---|
| 앱 프레임워크 | **Next.js 15 (App Router) + TypeScript + React 19** |
| UI | **Tailwind CSS 4** + 기존 Instrument Grammar 토큰 (CSS 변수) |
| 검증 | **Zod** (API·DB 경계 공유) |
| 인증 | **Supabase Auth** (이메일 매직링크 또는 비밀번호) |
| DB | **Supabase Postgres** + **Drizzle ORM** + SQL 마이그레이션 |
| 실시간 UI | **Supabase Realtime** (postgres_changes) |
| 시크릿 | Vercel/Worker env + DB **암호화 컬럼** (앱 레벨 AES-GCM) |
| 토스 API 클라이언트·게이트·전략 | 모노레포 공유 패키지 `@tosspilot/core` (기존 Electron core 포팅) |
| **매매 엔진 (상주)** | **별도 상주 Worker** (Fly.io 권장) — 동일 monorepo, Supabase 접속 |
| 백테스트·장작업 | **Inngest** (Vercel 연동) 또는 Worker 내부 큐 |
| 단위 테스트 | **Vitest** |
| 패키지 매니저 | **pnpm** workspaces |

> **핵심 제약:** 자동매매 루프(시세 폴링·전략 tick·토큰 선제 갱신)는 Vercel 서버리스만으로는 안전하지 않다.  
> Vercel+Supabase를 **관제·데이터 평면**으로 쓰고, **실행 평면(엔진)** 만 상주 프로세스로 분리하는 구성이 이 전제에서 최적이다.

---

## 1. 왜 이 조합인가

### 1.1 Vercel + Supabase가 잘하는 것

| 역할 | 적합성 |
|---|---|
| 브라우저 UI 배포, CDN, 프리뷰 | Vercel 최적 |
| 로그인·세션·RLS | Supabase Auth + Postgres RLS |
| 주문/설정 등 **짧은** API (초~수십 초) | Vercel Functions (최대 수 분) |
| UI 실시간 갱신 | Supabase Realtime (별도 WS 서버 불필요) |
| 영속 데이터·저널·전략 | Postgres |

### 1.2 Vercel + Supabase만으로 하면 안 되는 것

| 요구 (기능 명세) | 서버리스 한계 |
|---|---|
| 5초 전략 tick, 적응형 시세 폴링 | 함수는 **호출 단위로 끝남**. 상주 루프 불가 |
| Rate limit 버킷 메모리 상태 | 인스턴스 간 공유 불가 → 한도 난사 위험 |
| 토큰 만료 5분 전 선제 갱신 | 크론 간격·콜드스타트에 흔들림 |
| “탭을 닫아도 매매 계속” | 브라우저·수명 짧은 함수와 무관해야 함 |
| 네트워크 단절 30초 HOLD | 연속 관측이 필요 |

Supabase Cron + Edge Function / Vercel Cron으로 **1분 단위 tick**은 가능하지만:

- 기존 제품 대비 신호 지연이 커지고
- 동시 실행·중복 tick·한도 관리가 어려우며
- 장애 시 “엔진이 돌고 있는지” 헬스 모델이 애매하다.

→ **MVP부터 상주 Worker를 스택에 포함한다.**  
배포 주체는 여전히 “웹은 Vercel, 데이터는 Supabase”이며, Worker는 Supabase만 바라보는 얇은 실행기이다.

```
┌─────────────┐     HTTPS      ┌──────────────────────┐
│  Browser    │ ─────────────▶ │  Vercel · Next.js    │
│  (관제 UI)  │ ◀── Realtime ─ │  (제어 평면 API)     │
└─────────────┘         │      └──────────┬───────────┘
                        │                 │ service role / user JWT
                        ▼                 ▼
               ┌────────────────────────────────────┐
               │  Supabase                          │
               │  Auth · Postgres · Realtime · Storage│
               └──────────────────▲─────────────────┘
                                  │ service role
                                  │ (토스 키 복호화·주문·폴링)
               ┌──────────────────┴─────────────────┐
               │  Engine Worker (Fly.io 권장)         │
               │  @tosspilot/engine · 상주 프로세스   │
               │  → Toss Open API                     │
               └────────────────────────────────────┘
```

---

## 2. 확정 스택 상세

### 2.1 프론트엔드 (Vercel)

| 항목 | 선택 | 이유 |
|---|---|---|
| 프레임워크 | **Next.js App Router** | Vercel 1급 지원, RSC, Route Handlers, 미들웨어 |
| 언어 | **TypeScript** strict | 기존 core·스키마 재사용 |
| UI | **React** + **Tailwind** | 빠른 레이아웃, 디자인 토큰은 CSS 변수로 유지 |
| 차트 | **lightweight-charts** (TradingView) | 트레이딩 뷰에 적합, 번들 가벼움 |
| 상태 | **서버 상태 = React Query(TanStack Query)** + Supabase Realtime 무효화 | 전역 스토어 최소화 |
| 폼 | **React Hook Form + Zod** | 주문·전략 파라미터 |
| 컴포넌트 라이브러리 | **없음 (헤드리스)** | Instrument Grammar에 맞춘 자체 UI; shadcn은 필요 시 최소 도입 |

**금지:** 브라우저에서 토스 API 직접 호출, Client Secret 노출, `NEXT_PUBLIC_` 에 시크릿.

### 2.2 백엔드 제어 평면 (Vercel Route Handlers)

Next.js `app/api/**` 또는 Server Actions (짧은 명령 위주):

| API 종류 | 예 | 실행 위치 |
|---|---|---|
| 인증 콜백·세션 | 로그인 | Supabase SSR |
| CRUD | 전략·설정·관심종목 | Vercel + Postgres |
| 명령 | 킬 스위치, Paper/Live, 전략 start/pause, 수동 주문 **요청** | Vercel이 DB에 **command/intent** 기록 또는 Worker HTTP 내부 API |
| 조회 | 포트폴리오 스냅샷, 저널 페이지 | Postgres 읽기 |

**수동 주문 권장 흐름 (서버리스 친화):**

1. UI → Vercel API: intent 검증 + 세션 확인  
2. Vercel → DB `order_commands` insert (`pending`)  
3. Worker가 claim → **게이트 재평가** → paper/live 분기 → 토스 호출  
4. 결과 row 업데이트 → Realtime으로 UI 반영  

또는 Worker에 내부 인증된 `POST /internal/orders` (Vercel만 호출).  
어느 쪽이든 **게이트·멱등·전송은 Worker 단일 경로** (명세 N3).

### 2.3 Supabase

| 기능 | 용도 |
|---|---|
| **Auth** | 단일 운영자 MVP 로그인 (이메일+비밀번호 또는 매직링크). 이후 2FA는 Auth MFA |
| **Postgres** | 전략, 저널, 주문, 캔들, 설정, 암호화된 API 키 |
| **RLS** | `auth.uid() = user_id` — 브라우저 anon/authenticated 키로 자기 데이터만 |
| **Realtime** | `engine_status`, `quotes_snapshot`, `journal_entries`, `orders` 변경 구독 |
| **Vault / 암호화** | 토스 Client Secret은 **service_role만 읽기**. 앱에서 AES-GCM 암호화 후 bytea/text 저장 + 키는 Worker/Vercel env `CREDENTIALS_MASTER_KEY` |
| **Storage** | (P2) 리포트 export, 백테스트 artifact |
| **Cron** | 보조: 일일 리포트, 캔들 GC, 헬스 체크 핑 — **메인 매매 루프에는 쓰지 않음** |

**RLS 원칙**

- 브라우저 클라이언트: authenticated + RLS  
- Worker / Vercel 서버: `service_role` (RLS 우회) — 절대 프론트 번들에 넣지 않음  
- 토스 자격증명 테이블: **브라우저 SELECT 금지** (존재 여부·마스킹 메타만 별도 뷰)

### 2.4 ORM · 스키마

| 선택 | **Drizzle ORM** + `drizzle-kit` |
|---|---|
| 이유 | SQL에 가깝고 타입 안전, 마이그레이션 파일 리뷰 용이, Edge/Node 모두 무난 |
| 대안 기각 | Prisma Accelerate 없어도 되나 마이그레이션·엣지 조합이 무겁고, supabase-js만 쓰면 복잡한 조·트랜잭션이 약함 |

스키마는 `packages/db`에 두고 Vercel·Worker가 공유한다.

### 2.5 매매 엔진 Worker (필수)

| 항목 | 선택 |
|---|---|
| 런타임 | **Node.js 22 LTS** + TypeScript |
| 호스팅 권장 | **Fly.io** (상주, 작은 shared-cpu, 서울/도쿄 리전 근접) |
| 대안 | Railway, Render background worker, 가정용 상시 PC (비권장) |
| 프로세스 모델 | 단일 프로세스 이벤트 루프: 시세 폴링 · 전략 tick · command consumer · 토큰 갱신 |
| 패키지 | `@tosspilot/engine` depends on `@tosspilot/core`, `@tosspilot/db` |
| 토스 호출 | **오직 Worker** (Vercel은 토스 쓰기 API를 직접 치지 않는 것을 MVP 기본으로) |
| 헬스 | `engine_heartbeats` 테이블 5~10초마다 upsert → 홈 UI “엔진 생존” |
| 배포 | GitHub Actions → Fly; 이미지에 시크릿은 Fly secrets |

**Vercel-only 폴백 (비권장, 비상용):**  
Inngest/Vercel Cron 15~60초 tick + DB 버킷. Paper 모드 데모에는 가능, **Live 자동매매 기본 경로로 채택하지 않음**.

### 2.6 장시간 작업

| 작업 | 처리 |
|---|---|
| 백테스트 | **Inngest** on Vercel (수 분) 또는 Worker job 테이블 |
| 대량 캔들 백필 | Worker 큐 |
| 텔레그램 정시 알림 | Worker 스케줄러 (기존 hourly bot 포팅) |

MVP 단순화: Inngest 없이 **Worker 내부 큐만** 써도 된다. 백테스트가 커지면 Inngest 추가.

### 2.7 알림

| 채널 | 구현 |
|---|---|
| 텔레그램 | Worker (기존 `hourlyAlertBot` / `orderNotify` 포팅) |
| 인앱 | Realtime + `notifications` 테이블 |
| 이메일 | Supabase 없음 → 이후 Resend (P2) |

### 2.8 테스트 · 품질

| 도구 | 용도 |
|---|---|
| Vitest | core 게이트·decimal·전략·멱등 (기존 테스트 이식) |
| Playwright | (P1) 로그인·Paper 주문 플로우 |
| Typecheck | `tsc --noEmit` CI |
| ESLint + Prettier | 모노레포 공통 |

---

## 3. 모노레포 구조 (권장)

```
C:\DEV\TossAutoPilot\
  apps/
    web/                 # Next.js → Vercel
    engine/              # 상주 Worker → Fly.io
  packages/
    core/                # 토스 클라이언트, 게이트, 전략, 백테스트, decimal (포팅)
    db/                  # Drizzle schema, migrations
    shared/              # Zod DTO, 상수, 이벤트 타입
  docs/
    FEATURE_SPEC.md
    TECH_STACK.md
  pnpm-workspace.yaml
  package.json
```

기존 `AUTO_TRADE_VER2/src/core/**` → `packages/core`로 이전 시 Electron/`node:fs`/IPC 의존을 제거한다.

---

## 4. 환경 변수 (개요)

### Vercel (`apps/web`)

| 변수 | 설명 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 공개 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 공개 (RLS 전제) |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 전용 (최소화 사용) |
| `CREDENTIALS_MASTER_KEY` | 자격증명 암복호화 (서버) |
| `ENGINE_INTERNAL_SECRET` | Worker 호출 시 HMAC/공유비밀 |
| `ENGINE_URL` | (선택) Worker 내부 API |

### Fly Worker (`apps/engine`)

| 변수 | 설명 |
|---|---|
| `SUPABASE_URL` | |
| `SUPABASE_SERVICE_ROLE_KEY` | |
| `CREDENTIALS_MASTER_KEY` | 웹과 동일 |
| `TOSS_BASE_URL` | `https://openapi.tossinvest.com` |
| `ENGINE_INTERNAL_SECRET` | |
| `TELEGRAM_*` | 봇 설정 (또는 DB) |

브라우저에 두는 것: Supabase URL + anon key **뿐**.

---

## 5. 데이터·보안 요약

| 규칙 | 내용 |
|---|---|
| 시크릿 | Client Secret·액세스 토큰·마스터키 → 서버/Worker only |
| 주문 경로 | 단일: Worker `submit` (+ 게이트 10 + 멱등키) |
| Paper | Worker가 `POST /orders` 자체를 호출하지 않음 |
| 감사 | `journal_entries` append-only에 가깝게, 업데이트 최소화 |
| RLS | 사용자 데이터 격리; 자격증명 원문 비공개 |
| HTTPS | Vercel·Supabase·Fly 기본 |

---

## 6. 기각한 대안 (짧게)

| 대안 | 기각 사유 |
|---|---|
| Vite SPA + 별도 API | Vercel에 올릴 때 Next가 Auth SSR·Route Handler 한곳에 모임 |
| Supabase Edge only 엔진 | Deno cold start, 실행 시간, Node core 포팅 비용, 상주 루프 불가 |
| Prisma | 가능하나 Drizzle이 SQL·마이그레이션 리뷰에 더 가볍 |
| tRPC 전체 | 이득 있으나 MVP 복잡도↑ — Route Handler + Zod로 충분, 이후 도입 가능 |
| 순수 Vercel Cron 매매 | Live 자동매매 신뢰도 부족 |
| 브라우저 전략 실행 | 명세 위반 (탭 종료·조작) |
| Python 엔진 | 기존 TS core·테스트 자산 포팅 비용 큼 |

---

## 7. MVP 구현 순서 (스택 기준)

| Step | 내용 | 배포 |
|---|---|---|
| 0 | monorepo + `packages/core` 스켈레톤 (decimal, zod 스키마) | 로컬 |
| 1 | Supabase 프로젝트 · Auth · Drizzle 스키마 · RLS | Supabase |
| 2 | Next.js 로그인·홈 골격·디자인 토큰 | Vercel |
| 3 | 자격증명 등록(암호화) · Paper 강제 | Vercel+DB |
| 4 | Engine Worker 하트비트 + 시세 폴링 + Realtime 스냅샷 | Fly |
| 5 | 게이트 + 수동 주문 command + 저널 | Fly+Web |
| 6 | basic-v1 전략 · autoSend · 텔레그램 | Fly |
| 7 | 백테스트 · 조건주문 자동 OCO | Fly |

---

## 8. 비용·운영 메모 (대략)

| 구성 | 메모 |
|---|---|
| Vercel Hobby/Pro | UI·짧은 API. Pro 권장(상용·팀) |
| Supabase Free/Pro | Free로 개발 가능, 프로덕션은 Pro + 백업 |
| Fly 최소 머신 | 엔진 전용 상시 1대 (가장 중요한 운영 비용) |

엔진을 끄면 **자동매매가 멈춘다** — 홈 화면에 엔진 heartbeat 경고를 명세대로 노출한다.

---

## 9. 결정 요약 체크리스트

- [x] 웹: **Next.js on Vercel**
- [x] 데이터·인증·Realtime: **Supabase**
- [x] 공유 도메인: **TS monorepo + Zod + Vitest**
- [x] ORM: **Drizzle**
- [x] 매매 실행: **상주 Worker (Fly.io 권장)** — Vercel에 두지 않음
- [x] UI 실시간: **Supabase Realtime** (커스텀 WS 서버 없음)
- [x] 토스 API: **Worker 전용**
- [x] 기존 core: **포팅 우선**, Electron 폐기

---

## 10. 스캐폴드 상태

모노레포: `C:\DEV\TossAutoPilot`

| 항목 | 상태 |
|---|---|
| pnpm workspaces | ✅ |
| `packages/shared` · `core` · `db` | ✅ |
| `apps/web` (Next.js) | ✅ |
| `apps/engine` (health + tick loop) | ✅ |
| decimal / kill-switch 테스트 | ✅ |
| Fly Dockerfile · `fly.toml` | ✅ |
| `vercel.json` | ✅ |
| Supabase schema + RLS | ✅ M1 |
| Auth login/signup · middleware | ✅ M1 |
| profile / engine_status bootstrap | ✅ M1 |

### 다음 액션 (M1.5 / M2)

1. 자격증명 암호화 저장 UI  
2. Engine heartbeat → `engine_status`  
3. 게이트 포팅 · 주문 command 경로
