// 데모 모드 (pnpm demo): 토스 키 없이 가짜 계좌로 화면을 띄운다.
// 토스 REST(get) · 웹소켓(tradeStream) 자리만 바꾸고 집계 · 기록 · 섹터 · 백테스트는 실제 코드 그대로 돈다.
// 가격은 Yahoo 실제 종가, 체결은 PLAN 대로 2023년부터 매달 사 모은 것. 기록 DB 는 메모리 (kit/db.ts)
import type { Market, PricePoint, Snapshot } from '@portfolio/client'
import { cached } from '../kit/cache.ts'
import { dayStart, record, recordFlow } from '../portfolio/history.ts'
import type { TossHoldings } from '../portfolio/service.ts'
import type { Trade } from './toss-ws.ts'
import { history } from './yahoo.ts'

/** 매달 첫 거래일에 monthly(거래통화)만큼 산다 */
const PLAN: {
  symbol: string
  name: string
  market: Market
  type: string
  monthly: number
}[] = [
  {
    symbol: 'VOO',
    name: '뱅가드 S&P 500 ETF',
    market: 'US',
    type: 'FOREIGN_ETF',
    monthly: 300,
  },
  {
    symbol: 'QQQM',
    name: '인베스코 나스닥 100 ETF',
    market: 'US',
    type: 'FOREIGN_ETF',
    monthly: 200,
  },
  {
    symbol: 'SCHD',
    name: '슈왑 미국 배당주 ETF',
    market: 'US',
    type: 'FOREIGN_ETF',
    monthly: 150,
  },
  {
    symbol: 'SGOV',
    name: '아이셰어즈 0-3개월 미국 국채 ETF',
    market: 'US',
    type: 'FOREIGN_ETF',
    monthly: 100,
  },
  {
    symbol: 'AAPL',
    name: '애플',
    market: 'US',
    type: 'FOREIGN_STOCK',
    monthly: 100,
  },
  {
    symbol: 'NVDA',
    name: '엔비디아',
    market: 'US',
    type: 'FOREIGN_STOCK',
    monthly: 100,
  },
  {
    symbol: 'MSFT',
    name: '마이크로소프트',
    market: 'US',
    type: 'FOREIGN_STOCK',
    monthly: 100,
  },
  {
    symbol: '005930',
    name: '삼성전자',
    market: 'KR',
    type: 'STOCK',
    monthly: 300_000,
  },
]
const START = Date.UTC(2023, 0, 1)
/** [종목, 날짜, 그때 가진 수량 중 판 비율] — 거래 탭 양도세용 */
const SELLS: [string, string, number][] = [
  ['NVDA', '2025-06-02', 0.3],
  ['NVDA', '2026-03-02', 0.2],
]
const CASH = { KRW: 1_250_000, USD: 830 }
const FEE = { KRW: 0.00015, USD: 0.001 }
const HOUR = 3_600_000

interface Deal {
  symbol: string
  side: 'BUY' | 'SELL'
  currency: 'KRW' | 'USD'
  quantity: number
  price: number
  at: number
  settlement: string
}

const planOf = (symbol: string) => PLAN.find((p) => p.symbol === symbol)
const yahooOf = (symbol: string) =>
  planOf(symbol)?.market === 'KR' ? `${symbol}.KS` : symbol
const day = (t: number) => new Date(t).toISOString().slice(0, 10)
/** t 이전 마지막 종가 */
const closeAt = (points: PricePoint[], t: number) =>
  (points.findLast((p) => p.t <= t) ?? points[0]!).v

/** a 에서 b 로 n 걸음 걷는 무작위 경로 (끝을 b 에 맞춘 브라운 브리지). seed 가 같으면 같은 경로 */
function bridge(a: number, b: number, n: number, seed: number) {
  const noise = (i: number) => {
    const x = Math.sin(seed * 9973 + i * 12.9898) * 43758.5453
    return x - Math.floor(x) - 0.5
  }
  const w = [0]
  for (let i = 1; i <= n; i++) w.push(w[i - 1]! + noise(i))
  return w.map(
    (x, i) => a + ((b - a) * i) / n + (x - (w[n]! * i) / n) * a * 0.001,
  )
}

const model = () =>
  cached('demo', 6 * HOUR, async () => {
    const [fx, ...charts] = await Promise.all([
      history('KRW=X'),
      ...PLAN.map((p) => history(yahooOf(p.symbol))),
    ])
    const prices = new Map(PLAN.map((p, i) => [p.symbol, charts[i]!.points]))
    const deals: Deal[] = []
    for (const p of PLAN) {
      const pts = prices.get(p.symbol)!
      const currency = p.market === 'KR' ? 'KRW' : 'USD'
      // [일봉 위치, 판 비율(없으면 매수)]
      const events: [number, number?][] = []
      for (let m = 0; ; m++) {
        const k = pts.findIndex((x) => x.t >= Date.UTC(2023, m, 1))
        if (k < 0) break
        events.push([k])
      }
      for (const [s, d, r] of SELLS)
        if (s === p.symbol)
          events.push([pts.findIndex((x) => x.t >= Date.parse(d)), r])
      let held = 0
      for (const [k, sell] of events.sort((a, b) => a[0] - b[0])) {
        if (k < 0) continue
        const { t, v } = pts[k]!
        const q = sell
          ? held * sell
          : currency === 'KRW'
            ? Math.floor(p.monthly / v)
            : Math.round((p.monthly / v) * 1e6) / 1e6
        if (!q) continue
        held += sell ? -q : q
        deals.push({
          symbol: p.symbol,
          side: sell ? 'SELL' : 'BUY',
          currency,
          quantity: q,
          price: v,
          // 국내 10시 KST · 미국 14:30 UTC (서머타임엔 10:30, 아니면 개장 9:30 ET)
          at: t + (currency === 'KRW' ? 1 : 14.5) * HOUR,
          settlement: day(pts[k + 1]?.t ?? t),
        })
      }
    }
    deals.sort((a, b) => a.at - b.at)
    return { fx: fx.points, prices, deals }
  })

/** 실시간 체결가 (`${market}:${symbol}`). 잔고 조회도 이 값을 쓴다 */
const live = new Map<string, number>()

/** t 시점 보유: 수량 · 이동평균 매입액(거래통화) · 매입 원화액 */
function positions(deals: Deal[], fx: PricePoint[], until = Infinity) {
  const pos = new Map<string, { qty: number; cost: number; krw: number }>()
  for (const d of deals) {
    if (d.at > until) break
    const p = pos.get(d.symbol) ?? { qty: 0, cost: 0, krw: 0 }
    if (d.side === 'BUY') {
      const amount = d.quantity * d.price
      p.qty += d.quantity
      p.cost += amount
      p.krw += amount * (d.currency === 'USD' ? closeAt(fx, d.at) : 1)
    } else {
      const left = 1 - d.quantity / p.qty
      p.qty -= d.quantity
      p.cost *= left
      p.krw *= left
    }
    pos.set(d.symbol, p)
  }
  return pos
}

async function holdings(): Promise<TossHoldings> {
  const { fx, prices, deals } = await model()
  const rate = fx.at(-1)!.v
  let value = 0
  let cost = 0
  const items = [...positions(deals, fx)].flatMap(([symbol, pos]) => {
    const p = planOf(symbol)!
    const pts = prices.get(symbol)!
    const key = `${p.market}:${symbol}`
    if (!live.has(key)) live.set(key, pts.at(-1)!.v)
    const price = live.get(key)!
    const prev = pts.at(-2)!.v
    const k = p.market === 'US' ? rate : 1
    const amount = pos.qty * price
    value += amount * k
    cost += pos.krw
    return [
      {
        symbol,
        name: p.name,
        marketCountry: p.market,
        currency: p.market === 'US' ? ('USD' as const) : ('KRW' as const),
        quantity: String(pos.qty),
        lastPrice: String(price),
        averagePurchasePrice: String(pos.cost / pos.qty),
        marketValue: {
          amount: String(amount),
          purchaseAmount: String(pos.cost),
        },
        profitLoss: {
          amount: String(amount - pos.cost),
          rate: String(amount / pos.cost - 1),
        },
        dailyProfitLoss: {
          amount: String(pos.qty * (price - prev)),
          rate: String(price / prev - 1),
        },
      },
    ]
  })
  return { profitLoss: { rate: String(value / cost - 1) }, items }
}

async function candles(symbol: string, interval: string) {
  const pts = (await history(yahooOf(symbol))).points
  // 1분봉은 전일 종가에서 지금 가격까지 하루치(390분)를 지어낸다
  const points =
    interval === '1m'
      ? bridge(
          pts.at(-2)!.v,
          live.get(`${planOf(symbol)?.market ?? 'US'}:${symbol}`) ??
            pts.at(-1)!.v,
          390,
          [...symbol].reduce((h, c) => h + c.charCodeAt(0), 0) +
            Math.floor(Date.now() / 86_400_000),
        ).map((v, i, all) => ({
          t: Date.now() - (Date.now() % 60_000) - (all.length - 1 - i) * 60_000,
          v,
        }))
      : pts.slice(-400)
  return {
    candles: points
      .map((p) => ({
        timestamp: new Date(p.t).toISOString(),
        closePrice: String(p.v),
      }))
      .reverse(),
    nextBefore: null,
  }
}

/** toss.ts get() 대신 */
export async function get(
  path: string,
  q: Record<string, string>,
): Promise<unknown> {
  switch (path) {
    case '/api/v1/accounts':
      return [{ accountSeq: 1 }]
    case '/api/v1/holdings':
      return holdings()
    case '/api/v1/buying-power':
      return { cashBuyingPower: String(CASH[q.currency as 'KRW' | 'USD']) }
    case '/api/v1/exchange-rate':
      return { midRate: String((await model()).fx.at(-1)!.v) }
    case '/api/v1/stocks':
      return (q.symbols ?? '').split(',').map((symbol) => ({
        symbol,
        securityType: planOf(symbol)?.type ?? 'STOCK',
      }))
    case '/api/v1/candles':
      return candles(q.symbol ?? '', q.interval ?? '1d')
    case '/api/v1/orders': {
      const { deals } = await model()
      const orders = deals.map((d, i) => {
        const amount = d.quantity * d.price
        const filledAt = new Date(d.at).toISOString()
        return {
          orderId: `demo-${i}`,
          symbol: d.symbol,
          side: d.side,
          currency: d.currency,
          orderedAt: filledAt,
          execution: {
            filledQuantity: String(d.quantity),
            averageFilledPrice: String(d.price),
            filledAmount: String(amount),
            commission: String(
              Math.round(amount * FEE[d.currency] * 100) / 100,
            ),
            tax: '0',
            filledAt,
            settlementDate: d.settlement,
          },
        }
      })
      return { orders: orders.reverse(), nextCursor: null, hasNext: false }
    }
  }
  throw new Error(`데모에 없는 API: ${path}`)
}

/** toss-ws.ts tradeStream() 대신: 0.4초마다 보유 종목 하나가 전일 종가 근처에서 움직인다 */
export function stream(onTrade: (t: Trade) => void) {
  let symbols: { market: Market; symbol: string }[] = []
  const timer = setInterval(() => {
    const s = symbols[Math.floor(Math.random() * symbols.length)]
    const key = s && `${s.market}:${s.symbol}`
    const p = key && live.get(key)
    if (!s || !p) return
    const next = p * (1 + (Math.random() - 0.5) * 0.002)
    live.set(key, next)
    onTrade({ ...s, price: next })
  }, 400)
  return {
    setSymbols(next: typeof symbols) {
      symbols = next
    },
    close() {
      clearInterval(timer)
    },
  }
}

/** 서버 시작 때: 첫 매수부터 어제까지 거래일별 총자산과 오늘 1분 흐름을 기록 DB 에 채운다 */
export async function seed() {
  const { fx, prices, deals } = await model()
  const assets = (t: number, at: (pts: PricePoint[]) => number) => {
    let v = CASH.KRW + CASH.USD * closeAt(fx, t)
    for (const [symbol, pos] of positions(deals, fx, t)) {
      const k = planOf(symbol)!.market === 'US' ? closeAt(fx, t) : 1
      v += pos.qty * at(prices.get(symbol)!) * k
    }
    return v
  }
  // 미국 장 마감(21시 UTC)이 그 거래일 기록
  for (const { t } of prices.get('VOO')!.filter((p) => p.t >= START))
    record({
      at: t + 21 * HOUR,
      assets: assets(t + 21 * HOUR, (pts) => closeAt(pts, t)),
    } as Snapshot)

  const now = Date.now()
  const start = dayStart(now)
  const n = Math.max(1, Math.floor((now - start) / 60_000))
  bridge(
    assets(now, (pts) => pts.at(-2)!.v),
    assets(now, (pts) => pts.at(-1)!.v),
    n,
    7,
  ).forEach((v, i) => recordFlow({ t: start + i * 60_000, v }))
}
