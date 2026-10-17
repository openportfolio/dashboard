# OpenPortfolio

토스증권 Open API 포트폴리오 대시보드. 전부 TypeScript, pnpm 워크스페이스 하나.

## Architecture

```
dashboard/
├── server/                   # Node 24 API 서버 (.ts 직접 실행, 런타임 의존성 0)
│   ├── src/
│   │   ├── main.ts           # pnpm dev · demo 진입점 (listen(PORT))
│   │   ├── app.ts            # HTTP 서버: 모듈별 routes(GET) · writes(PUT), WEB_DIR 이면 빌드한 웹도 · listen(port)
│   │   ├── config.ts         # 환경변수
│   │   ├── exceptions.ts     # BadRequest → 400, 그 외 → 502
│   │   ├── kit/              # cache · db(server/data/portfolio.db) · settings(key → JSON) · xlsx
│   │   ├── integrations/     # toss REST · toss-ws 실시간 · yahoo · edgar · ssga · demo
│   │   ├── portfolio/        # /api/snapshot · /api/stream(SSE) · /api/history · /api/flow (거래일은 08:00 KST 에 넘긴다)
│   │   ├── sector/           # GICS 분류 · /api/performance
│   │   ├── setup/            # /api/setup: 연결 화면 (토스 키 · SEC 연락처)
│   │   ├── strategy/         # /api/strategies
│   │   ├── trade/            # /api/fills
│   │   ├── quote/            # /api/candles · /api/dividends
│   │   └── {module}/         # endpoints.ts (라우트 + 입력 검증) · service.ts (로직)
│   └── tests/{module}/       # node:test
├── clients/
│   ├── apps/web/             # Vite + Solid(TSX) (:5280, /api → :8000 프록시)
│   ├── apps/desktop/         # Electron: 서버 listen(0) + 빌드한 웹을 같은 주소로 연다 (esbuild 로 한 파일)
│   └── packages/
│       ├── client/           # API 계약: 응답 타입 · Api(GET) · ApiWrite(PUT) · api() · put()
│       └── typescript-config/
└── docs/                     # VitePress 사용자 문서
```

API 를 바꿀 때는 `clients/packages/client` 의 `Api` 를 먼저 고친다. `server/src/app.ts` 의
라우트 테이블이 이 타입으로 검사되므로 서버 · 웹이 어긋나면 typecheck 에서 걸린다.

타입체크는 TypeScript 7 하나. TS 7 에서는 vue-tsc · svelte-check 가 돌지 않아 web 은 tsc 가 직접 읽는
TSX(Solid)를 쓰고, 문서 사이트는 마크다운만 쓴다 (Vue 컴포넌트 없음).

## Commands

```bash
pnpm dev           # server + web → http://localhost:5280
pnpm demo          # 토스 키 없이 가짜 계좌 (기록 DB 는 메모리)
pnpm app           # 데스크톱 앱으로 실행 (웹 빌드 → Electron) · app:dist 는 설치 파일 (clients/apps/desktop/release)
pnpm test          # node --test (네트워크 · DB 없이 돈다)
pnpm typecheck
pnpm lint          # oxlint
pnpm format        # oxfmt (세미콜론 없음, 작은따옴표, 80자)
pnpm docs          # 문서 사이트. docs:build 는 깨진 링크도 잡는다
```

토스 키는 처음 열 때 연결 화면에서 넣는다 (`server/.env` 가 있으면 그게 우선 · 테스트도 이 경로). CI 는 push · PR 마다 format:check · lint · typecheck · test · docs:build.

## Toss Open API

- 스펙: https://openapi.tossinvest.com/openapi-docs/latest/openapi.json
- client 당 유효 토큰은 1개. 재발급하면 이전 토큰이 바로 끊기므로 같은 키로 다른 프로세스를 같이 돌리지 않는다.
- 키 발급 때 등록한 IP 에서만 호출된다.
- 금액 · 비율은 decimal 문자열, 비율은 소수 (0.1 = 10%).
- `holdings.profitLoss.rate` 는 매수 시점 환율 기준(환차 포함)이고 종목별 금액은 거래통화 기준이다.
  총 손익(`pnl`)은 이 비율로 역산하고, 종목 · 섹터 손익의 합은 `pricePnl`(환차 제외)로 따로 둔다.
- 현금은 `buying-power`(통화별 주문 가능 현금). 원화 · 달러가 따로 잡힌다.
- 웹소켓은 `Authorization` 헤더가 필요해 서버가 붙고 브라우저에는 SSE(`/api/stream`)로 중계한다. 계정당 동시 연결이
  2개라 SSE 구독자가 있을 때만 연결하고, 60초마다 `PING`, 끊기면 지수 백오프. 수량 · 현금 · 환율은 체결로 안 바뀌어
  15초마다 REST 로 다시 맞춘다.
- 계좌 목록은 종합매매 계좌만 오고 한 사람에 하나라 첫 계좌를 쓴다.

## 섹터 분류 (GICS)

- 토스 섹터(자체 분류, 한 종목이 여러 섹터에 겹침)는 쓰지 않고 GICS 11개를 공개 데이터로 만든다
  (`sector/universe.ts`, 하루 1회). 출처와 방식은 `docs/calculations.md`.
- SSGA 보유종목은 xlsx 라 `kit/xlsx.ts`(의존성 없는 리더)로 읽는다. SEC EDGAR 는 연락처가 든 User-Agent(`SEC_USER_AGENT`)가 필요하다.
- 자동 분류가 안 되는 개별주(국내 등)는 `sector/classification.ts` 의 `STOCK_SECTOR` 에 넣는다. `ETF_CLASS` 는
  자산 구성 · 포트폴리오 맵에서 쓰는 묶음 이름표일 뿐이고, 섹터 노출은 보유종목으로 펼쳐서 계산한다.
- 분류 데이터를 못 받아도 잔고는 보여 준다 (미분류 · ETF 묶음, 서버 로그 `[분류]`).
- 섹터 성과는 토스 일봉(배당 미반영)이라 가격 수익률이다.

## Conventions

- 계좌 데이터라 서버는 127.0.0.1 에만 바인딩하고, Host 가 localhost 가 아니면 거절한다 (DNS 리바인딩). PUT 은 JSON 만 받고 아는 필드만 골라 저장한다. 토스 Secret 은 GET 으로 돌려주지 않는다.
- 데스크톱 앱: 렌더러는 sandbox · Node 없음, 외부 링크는 기본 브라우저, 창은 로컬 주소 밖으로 못 나간다. CSP 는 서버가 HTML 에 붙인다 (`kit/static.ts`, 그래서 인라인 스크립트 없이 `public/theme.js`). 데이터는 OS 사용자 폴더(`DATA_DIR`), `server/.env` 는 안 읽는다 (키는 연결 화면). 토스 Secret 은 앱이 `useSealer` 로 끼운 safeStorage 로 암호화해 저장한다 (`kit/secret.ts`, 브라우저 모드는 평문). 아이콘 원본은 `desktop/build/icon.svg` → `icon.png`(1024, 헤드리스 Chrome `--screenshot` 으로 그림), 로고 · 파비콘(`docs/public/logo.svg` · `web/public/favicon.svg`)도 같은 그림. ESM 진입점이라 `app.whenReady()` 를 맨 위에서 await 하지 않는다 (ready 와 서로 기다려 멈춘다).
- 화면을 누르는 자동 확인(헤드리스 브라우저)은 데모 인스턴스에서만 한다 (`PORT=8001 DEMO=1`). 실제 서버에서 누르면 전략 같은 실제 데이터가 바뀐다.
- API 응답 문자열은 JSX 텍스트로만 렌더한다 (`innerHTML` 금지).
- 데모 모드(`integrations/demo.ts`)는 토스 `get()` · `tradeStream()` 자리만 바꾸고 나머지 코드에는 데모 분기를 두지 않는다. 토스 API 를 새로 부르면 데모 `get()` 에도 응답을 더한다.
- 1초마다 갱신되는 목록은 `<For>` 대신 `<Index>` 로 그린다 (DOM 재사용 → 포커스 · 호버 유지).
- 선 차트는 uPlot 을 `components/LineChart.tsx` 하나로 감싼다. 캔버스는 CSS 변수를 몰라 색 토큰을 읽어 넘기고, 다크/라이트가 바뀌면 다시 만들고, 값만 바뀌면 `setData`. draw 훅에서 ctx 스타일을 바꾸면 save/restore 로 되돌린다 (uPlot 이 마지막 스타일을 기억해, 안 되돌리면 다음 그리기의 선 색이 바뀐다). 트리맵 · 히트맵 · 막대는 HTML/CSS.
- 국내 관례대로 상승 빨강, 하락 파랑.
- 스타일: 전역 `style.css` 에는 색 토큰과 여러 컴포넌트가 같이 쓰는 카드 · 표 · 버튼 · 세그먼트 · 입력칸만. 나머지는 컴포넌트 옆 `Component.css` 를 그 컴포넌트에서 import. `main.tsx` 는 `style.css` 를 App 보다 먼저 import (같은 우선순위면 컴포넌트 CSS 가 이기게).
- 전략은 사용자 데이터다. 코드에 개인 전략을 기본값으로 두지 않는다 (시작점은 '지금 보유 비중' 과 `TEMPLATES`). 서버 DB 에 저장한다 (`lib/strategies.ts`). 벤치마크(QQQ · SPY · DIA)는 전략이 아니다. 규칙 로직은 `lib/strategy.ts`.
- Yahoo Finance 차트 API(`integrations/yahoo.ts`, 비공식 · 키 없음)는 백테스트 일봉(상장 이후 전체)과 배당에 쓴다. 토스는 배당이 없고 일봉이 ~8년까지라서다. 종목 상세 차트는 토스. 호출은 yahoo-finance2 chart 모듈에서 필요한 부분만 가져온 것이라, Yahoo 가 바뀌어 막히면 그 구현과 맞춘다.
- 계산(손익 · 섹터 · 배당 · 전략 · 백테스트 · 양도세)을 바꾸면 `docs/calculations.md` 도, 화면을 바꾸면 `docs/guide.md` 도 고친다. 문서 마크다운은 GitHub 에서도 읽히게 쓰고, 스크린샷(`docs/images`)은 데모 모드로 찍는다.
