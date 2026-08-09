# 상시 PC 엔진 배포 (비용 최소 · 토스 IP 허용)

Vercel 웹은 그대로 두고, **꺼지지 않는 PC 1대**에서만 토스 API를 호출합니다.  
토스 콘솔에는 **그 PC의 공인 IP** 만 등록하면 됩니다.

```
사용자 (폰/PC)
    │ HTTPS
    ▼
Vercel (apps/web)  ──ENGINE_URL──►  상시 PC 엔진 (:8787)
    │                                    │
    ▼                                    ▼
 Supabase                          토스 Open API
                              (PC 공인 IP 허용)
```

---

## 0. 체크리스트

- [ ] 상시 PC에 Node 20+, pnpm, 이 레포 clone
- [ ] 루트 `.env` 채움 (Supabase · `CREDENTIALS_MASTER_KEY` · `ENGINE_INTERNAL_SECRET`)
- [ ] 공인 IP 확인 → **토스 Open API IP 허용 목록**에 등록
- [ ] 엔진 기동 → `http://127.0.0.1:8787/health` OK
- [ ] Vercel 환경변수에 `ENGINE_URL` / `ENGINE_INTERNAL_SECRET` / 마스터키
- [ ] (Vercel → 집 PC) Cloudflare Tunnel 또는 포트포워드+HTTPS

---

## 1. 상시 PC 준비

### 1-1. 소프트웨어

```powershell
# Node 20+ , pnpm
cd C:\DEV\TossAutoPilot   # 또는 clone 경로
pnpm install
pnpm build:packages
pnpm --filter @tosspilot/engine build
```

### 1-2. `.env` (레포 루트)

최소 예시:

```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...

CREDENTIALS_MASTER_KEY=  # 32바이트 hex (Vercel 과 동일)
ENGINE_INTERNAL_SECRET=  # 랜덤 문자열 (Vercel 과 동일)

ENGINE_DEPLOY_MODE=home-pc
ENGINE_HOST=0.0.0.0
ENGINE_PORT=8787
ENGINE_REQUIRE_SECRET=true

TOSS_BASE_URL=https://openapi.tossinvest.com
```

시크릿 생성:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

### 1-3. 공인 IP → 토스

```powershell
# 브라우저 또는
Invoke-RestMethod https://ifconfig.me/ip
```

1. 토스 증권 개발자/Open API 콘솔  
2. **허용 IP** 에 위 주소 등록  
3. 회선 재접속 후 IP가 바뀌면 **재등록** 필요 (가정용 회선 주의)

---

## 2. 엔진 실행

### 수동 (테스트)

```powershell
cd C:\DEV\TossAutoPilot
pnpm engine:home
# 또는
.\scripts\home-engine\start-engine.ps1
```

확인:

```text
GET http://127.0.0.1:8787/health
→ ok: true, deployMode: home-pc
```

### 부팅 시 자동 실행 (Windows 작업 스케줄러)

**관리자 PowerShell:**

```powershell
cd C:\DEV\TossAutoPilot
.\scripts\home-engine\install-autostart.ps1
```

- 로그온 시 `TossAutoPilot-Engine` 작업이 엔진을 띄웁니다.  
- 제거: `.\scripts\home-engine\uninstall-autostart.ps1`

절전 해제 권장: 제어판 → 전원 → **절전 안 함**, 네트워크 어댑터 절전 해제.

---

## 3. Vercel 이 상시 PC 엔진에 붙기

Vercel 서버는 `127.0.0.1` 에 닿을 수 없습니다. **공개 URL** 이 필요합니다.

### 추천 A — Cloudflare Tunnel (포트 안 열어도 됨, 무료)

1. [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/) 설치  
2. 상시 PC에서:

```powershell
cloudflared tunnel login
cloudflared tunnel create toss-engine
# config 에서 8787 로 프록시
cloudflared tunnel run toss-engine
```

3. 나온 `https://xxxx.trycloudflare.com` 또는 커스텀 도메인을 복사  
4. Vercel 환경변수:

```env
ENGINE_URL=https://xxxx.trycloudflare.com
ENGINE_INTERNAL_SECRET=  # PC .env 와 동일
CREDENTIALS_MASTER_KEY=  # PC .env 와 동일
SUPABASE_...=            # 기존과 동일
```

5. Redeploy

### 대안 B — 공유기 포트포워드

1. 공유기에서 외부 8787 → PC 내부 8787  
2. PC 방화벽 인바운드 8787 허용  
3. `ENGINE_URL=http://공인IP:8787` (가능하면 HTTPS 리버스 프록시 권장)  
4. **시크릿 필수** — 포트 공개 시 무단 호출 방지

---

## 4. Vercel 환경변수 요약

| 변수 | 값 |
|------|-----|
| `ENGINE_URL` | 터널/공개 엔진 URL (끝 `/` 없음) |
| `ENGINE_INTERNAL_SECRET` | 상시 PC `.env` 와 **동일** |
| `CREDENTIALS_MASTER_KEY` | 상시 PC 와 **동일** |
| Supabase 키들 | 기존과 동일 |

웹 서버가 차트·시세·주문 프록시를 `ENGINE_URL` 로 보냅니다.

---

## 5. 동작 확인

1. 상시 PC: 엔진 실행 중, `/health` OK  
2. 토스: 해당 공인 IP 허용  
3. 설정에서 토스 API 키 저장 · 연결 테스트  
4. `/trade` 종목 선택 → 차트 로드  
5. 엔진 로그에 토스 호출 오류가 없는지 확인  

차트에 `엔진 연결 실패` → `ENGINE_URL`/터널/방화벽  
`IP address not allowed` → 토스 허용 IP ≠ 지금 공인 IP  

---

## 6. 로컬만 쓸 때 (Vercel 없이)

상시 PC에서 웹+엔진 둘 다:

```powershell
pnpm dev:engine   # 터미널 1
pnpm dev:web      # 터미널 2
```

`.env` / `apps/web/.env.local`:

```env
ENGINE_URL=http://127.0.0.1:8787
ENGINE_INTERNAL_SECRET=...
```

이 경우 터널 없이 `127.0.0.1` 로 충분합니다. 토스에는 여전히 **그 PC 공인 IP** 등록.

---

## 7. 문제 해결

| 증상 | 조치 |
|------|------|
| 엔진 기동 거부 (secret) | `.env` 에 `ENGINE_INTERNAL_SECRET` |
| Vercel 차트 실패 | 터널 URL · Redeploy · 시크릿 일치 |
| 토스 IP 거부 | `ifconfig.me` IP 재확인 후 토스 등록 |
| 재부팅 후 엔진 없음 | `install-autostart.ps1` · 작업 스케줄러 확인 |
| IP 자주 변경 | 통신사 고정 IP 문의 또는 변경 시 토스 수동 갱신 |

---

## 관련 스크립트

| 파일 | 용도 |
|------|------|
| `scripts/home-engine/start-engine.ps1` | 엔진 포그라운드 실행 |
| `scripts/home-engine/install-autostart.ps1` | 부팅 자동 시작 |
| `scripts/home-engine/uninstall-autostart.ps1` | 자동 시작 제거 |
| `scripts/home-engine/show-public-ip.ps1` | 공인 IP 출력 (토스 등록용) |
