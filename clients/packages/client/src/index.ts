// 서버 ↔ 웹 API 계약. 서버는 타입만 가져다 쓰고(import type), 웹은 api()까지 쓴다.

export type Market = 'KR' | 'US'
export type Duration = '1d' | '1w' | '1mo' | '3mo' | '6mo' | '1y'

/** 금액은 모두 KRW 환산, 비율은 소수 (0.1 = 10%) */
export interface Holding {
  symbol: string
  name: string
  market: Market
  value: number
  purchase: number
  pnl: number
  daily: number
  rate: number
  dailyRate: number
  weight: number
  /** 개별주식은 GICS 섹터, ETF 는 추종 대상별 묶음. 분류가 안 되면 '미분류' */
  sector: string
  /** 개별주식 · 나스닥100 ETF · 단기국채 ETF ... */
  assetClass: string
  /** 거래통화 기준 (quantity 는 주, 가격은 KRW 또는 USD) */
  currency: 'KRW' | 'USD'
  quantity: number
  averagePrice: number
  lastPrice: number
}

/** 시계열 한 점. t = epoch ms */
export interface PricePoint {
  t: number
  v: number
}

export type ChartRange = '1d' | '1y' | 'max'

/** GICS 섹터별 노출. ETF 는 보유종목(N-PORT) 비중대로 펼쳐서 더한다 */
export interface Sector {
  name: string
  value: number
  /** 주식 평가금액 합(total) 대비 */
  weight: number
  /** 개별주식으로 직접 보유한 금액 */
  direct: number
  /** ETF 를 통해 간접 보유한 금액 */
  etf: number
  /** 직접 보유 종목명 */
  symbols: string[]
  /** 이 섹터에 기여한 ETF 종목명 */
  etfs: string[]
}

export interface AssetClass {
  name: string
  value: number
  /** 총자산(현금 포함) 대비 */
  weight: number
}

export interface Snapshot {
  /** 주식 평가금액 합 (섹터·종목 weight 의 분모) */
  total: number
  /** 주식 + 주문 가능 현금 */
  assets: number
  /** 주문 가능 현금 (통화별 원래 단위) */
  cash: { krw: number; usd: number }
  /** 통화별 노출액 (KRW 환산, 주식 + 현금) */
  exposure: { KRW: number; USD: number }
  assetClasses: AssetClass[]
  /** 원화 기준 총 손익 (환차손익 포함, 토스 손익률로 역산) */
  pnl: number
  /** 주가 손익만 (매입·평가 모두 현재 환율 환산, 환차 제외) = 종목/섹터 손익의 합 */
  pricePnl: number
  pnlRate: number
  daily: number
  dailyRate: number
  /** 1 USD = fx KRW */
  fx: number
  holdings: Holding[]
  sectors: Sector[]
  /** ETF → 펼쳐 본 보유종목의 기준일 (N-PORT 보고 기준일) */
  etfAsOf: Record<string, string>
  /** epoch ms */
  at: number
}

/** GICS 섹터 성과. S&P 500 섹터 ETF 의 거래일 기준 가격 등락률 (배당 제외) */
export interface SectorPerformance {
  name: string
  /** 기준 ETF */
  symbol: string
  rates: Record<Duration, number | null>
}

/** 체결된 주문 하나 (부분 체결 포함). 금액은 거래통화 기준 */
export interface Fill {
  orderId: string
  symbol: string
  side: 'BUY' | 'SELL'
  currency: 'KRW' | 'USD'
  /** 체결 수량 · 평균 체결가 · 체결 금액 · 수수료 · 세금 */
  quantity: number
  price: number
  amount: number
  commission: number
  tax: number
  /** 마지막 체결 시각 (epoch ms) */
  at: number
  /** 결제일 (YYYY-MM-DD, KST). 양도세는 결제일 기준 */
  settlement: string
}

/** 하락장 때 각 종목이 하는 일 */
export type Role = 'growth' | 'switch' | 'cushion' | 'hold'

export interface StrategyAsset {
  symbol: string
  /** 목표 비율 (%). 합이 100 이 아니면 비율대로 맞춘다 */
  weight: number
  role: Role
  /** 묶음 이름 (예: Top5). 묶음별 합계와 한도에 쓴다 */
  group?: string
}

/** 전략 = 종목별 비율 + 매일 매수액 + (선택) 하락장 룰 · 매도 허용 트리거 */
export interface Strategy {
  id: string
  name: string
  /** 매 거래일 매수액 (USD) */
  daily: number
  assets: StrategyAsset[]
  /** 하락장 룰: market 의 1년 종가 고점 대비 하락률이 steps[0] 이하면 2단계, steps[1] 이하면 3단계 */
  bear?: { market: string; steps: [number, number] }
  /** 매도 허용 트리거: 개별주 하나의 비중 한도, 묶음별 합계 한도 */
  limits?: { single?: number; groups?: Record<string, number> }
}

/** 사용자의 전략 목록 (서버 DB 에 하나로 저장. 기기마다 같다) */
export interface StrategyState {
  list: Strategy[]
  /** 지금 따르는 전략 id (전략이 없으면 null) */
  active: string | null
  /** 백테스트에서 비교할 전략 id */
  compare: string[]
  /** 백테스트에서 함께 그릴 벤치마크 심볼 (QQQ · SPY · DIA) */
  benchmarks: string[]
}

export interface ApiError {
  error: string
}

/** 라우트 → 응답 타입. 서버 라우트 테이블도 이 타입으로 검사된다 */
export interface Api {
  '/api/snapshot': Snapshot
  '/api/performance': SectorPerformance[]
  /** 종목 가격 (1d = 현재 세션 1분봉, 1y = 일봉: 토스 · max = 상장 이후 전체 일봉: Yahoo, 백테스트용. 일봉 t = 거래일) */
  '/api/candles': PricePoint[]
  /** 배당락일(YYYY-MM-DD, 미국 동부) → 주당 배당금 (USD, 분할 반영). 상장 이후 전체, 무배당이면 {} */
  '/api/dividends': Record<string, number>
  /** 오늘 총 자산 흐름 (1분 단위, 서버가 실시간 스트림을 돌린 동안) */
  '/api/flow': PricePoint[]
  /** 거래일별 마지막 총 자산 (t = 거래일 UTC 자정). 서버가 스냅샷을 조회한 날만 있다 */
  '/api/history': PricePoint[]
  /** 체결 내역 전체 (오래된 순). 토스 Open API 주문 조회 범위 안에서 */
  '/api/fills': Fill[]
  /** 저장된 전략 (아직 한 번도 저장하지 않았으면 null) */
  '/api/strategies': StrategyState | null
  '/api/setup': Setup
}

/** PUT 라우트 → 요청 본문 타입 (JSON) */
/** 연결 상태. 키 자체는 돌려주지 않는다 */
export interface Setup {
  /** 키를 어디서 읽는지. null 이면 아직 없음 → 연결 화면 */
  keys: 'env' | 'saved' | 'demo' | null
  /** SEC EDGAR 에 보내는 연락처 (ETF 보유종목 펼치기) */
  contact: string | null
}
export interface SetupInput {
  clientId: string
  clientSecret: string
  /** 빈 문자열이면 지운다 */
  contact: string
}

export interface ApiWrite {
  '/api/setup': SetupInput
  '/api/strategies': StrategyState
}

export async function api<P extends keyof Api>(
  path: P,
  query?: Record<string, string>,
): Promise<Api[P]> {
  const r = await fetch(query ? `${path}?${new URLSearchParams(query)}` : path)
  if (!r.ok) {
    // API 서버가 꺼져 있으면 프록시가 JSON 이 아닌 응답을 준다
    const d = (await r.json().catch(() => null)) as ApiError | null
    throw new Error(d?.error || `API 오류 (HTTP ${r.status})`)
  }
  return (await r.json()) as Api[P]
}

/** 저장 (PUT, JSON). JSON 이어야 다른 사이트의 몰래 보내는 요청이 브라우저 사전 확인(preflight)에서 막힌다 */
export async function put<P extends keyof ApiWrite>(
  path: P,
  body: ApiWrite[P],
): Promise<void> {
  const r = await fetch(path, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    const d = (await r.json().catch(() => null)) as ApiError | null
    throw new Error(d?.error || `저장 실패 (HTTP ${r.status})`)
  }
}

/** 실시간 스냅샷 (SSE, 체결 반영). 끊기면 브라우저가 자동 재연결한다. 반환값은 구독 해제 */
export function streamSnapshot(handlers: {
  onData: (s: Snapshot) => void
  /** 서버가 토스 조회에 실패했을 때 (연결은 유지) */
  onFailure: (message: string) => void
  onConnected: (connected: boolean) => void
}): () => void {
  const es = new EventSource('/api/stream')
  es.onmessage = (e) => handlers.onData(JSON.parse(e.data) as Snapshot)
  es.addEventListener('failure', (e) =>
    handlers.onFailure(JSON.parse((e as MessageEvent).data) as string),
  )
  es.onopen = () => handlers.onConnected(true)
  es.onerror = () => handlers.onConnected(false)
  return () => es.close()
}
