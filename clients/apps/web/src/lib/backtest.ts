import type { PricePoint } from '@portfolio/client'
import { stageOf } from './strategy.ts'

export const YEAR = 365.25 * 86_400_000
/** 미국 배당 원천징수 (한미 조세조약, 국내 추가 과세 없음) */
export const WITHHOLDING = 0.15

export interface BacktestResult {
  /** 거래일별 평가액 (그날 매수 직후) */
  value: PricePoint[]
  /** 시간가중 누적 수익률 (입금 효과 제외, 0.1 = +10%) */
  twr: PricePoint[]
  invested: number
  final: number
  /** 시간가중 연환산 수익률 */
  cagr: number
  /** 시간가중 최대 낙폭 (≤ 0)과 그 고점·저점 날짜 */
  mdd: { rate: number; peak: number; trough: number }
  /** 하락장 단계별 일수 */
  stageDays: number[]
}

/** 상장 전 구간을 채울, 같은 지수를 따르는 오래된 종목 */
export const PROXIES: Record<string, string> = {
  QQQM: 'QQQ', // 나스닥100 (2020 ← 1999)
  SGOV: 'BIL', // 0~3개월 미 국채 (2020 ← 2007)
  VOO: 'SPY', // S&P 500 (2010 ← 1993)
  SPLG: 'SPY',
}

const ymd = (t: number) => new Date(t).toISOString().slice(0, 10)

/**
 * 상장일 앞을 proxy 가격으로 잇는다. 상장 첫날 두 가격의 비율로 맞추고, proxy 배당도 같은 비율로.
 * 상장 후는 원래 종목 그대로
 */
export function splice(
  actual: { points: PricePoint[]; dividends?: Record<string, number> },
  proxy: { points: PricePoint[]; dividends?: Record<string, number> },
) {
  const t0 = actual.points[0]?.t
  const base = proxy.points.find((p) => p.t >= (t0 ?? Infinity))
  if (t0 === undefined || !base || proxy.points[0]!.t >= t0) return actual
  const r = actual.points[0]!.v / base.v
  const day0 = ymd(t0)
  return {
    points: [
      ...proxy.points
        .filter((p) => p.t < t0)
        .map((p) => ({ t: p.t, v: p.v * r })),
      ...actual.points,
    ],
    dividends: {
      ...Object.fromEntries(
        Object.entries(proxy.dividends ?? {})
          .filter(([d]) => d < day0)
          .map(([d, v]) => [d, v * r]),
      ),
      ...actual.dividends,
    },
  }
}

/**
 * 매 거래일 daily 달러를 weights(합 1)대로 나눠 소수점으로 산다. 수수료·환율 제외.
 * dividends(종목 → 배당락일 → 주당 배당금)를 주면 배당락일 종가에 원천징수 뒤 금액을 같은 종목으로 재투자한다.
 * bear 를 주면 하락장 룰 적용: market 의 그날 포함 직전 252거래일 종가 고점 대비 하락률로 단계를 정하고
 * weightsAt(단계) 비중으로 산다.
 * 적립식이라 평가액 낙폭은 입금에 가려지므로, MDD·연환산은 입금을 뺀 시간가중 수익률로 잰다.
 * fx(원/달러)를 주면 원화 기준: 그날(없으면 직전) 환율로 매수액 · 평가액을 원화로 셈한다
 */
export function backtest(
  prices: Record<string, PricePoint[]>,
  weights: Record<string, number>,
  opts: {
    daily: number
    from: number
    bear?: {
      market: PricePoint[]
      steps: number[]
      weightsAt: (stage: number) => Record<string, number>
    }
    dividends?: Record<string, Record<string, number>>
    fx?: PricePoint[]
  },
): BacktestResult | undefined {
  const keys = Object.keys(weights).filter((k) => weights[k]! > 0)
  if (!keys.length) return
  const px = new Map(
    keys.map((k) => [k, new Map(prices[k]!.map((p) => [p.t, p.v]))]),
  )
  const m = opts.bear?.market ?? []
  const drawdown = new Map(
    m.map((p, i) => {
      let peak = 0
      for (let j = Math.max(0, i - 251); j <= i; j++)
        peak = Math.max(peak, m[j]!.v)
      return [p.t, p.v / peak - 1]
    }),
  )
  // 모든 자산(과 시장)에 가격이 있는 날만
  const dates = prices[keys[0]!]!.map((p) => p.t).filter(
    (t) =>
      t >= opts.from &&
      keys.every((k) => px.get(k)!.has(t)) &&
      (!opts.bear || drawdown.has(t)) &&
      (!opts.fx || t >= opts.fx[0]!.t),
  )
  if (dates.length < 2) return

  const shares = new Map(keys.map((k) => [k, 0]))
  const value: PricePoint[] = []
  const twr: PricePoint[] = []
  const stageDays = Array<number>((opts.bear?.steps.length ?? 0) + 1).fill(0)
  let post = 0
  let invested = 0
  let index = 1
  // 환율은 날짜순으로 따라가며 그날(없으면 직전) 값
  const fx = opts.fx ?? []
  let fi = 0
  const rate = (t: number) => {
    if (!fx.length) return 1
    while (fi + 1 < fx.length && fx[fi + 1]!.t <= t) fi++
    return fx[fi]!.v
  }
  let peak = { v: 1, t: dates[0]! }
  const mdd = { rate: 0, peak: dates[0]!, trough: dates[0]! }
  for (const t of dates) {
    const f = rate(t)
    const price = (k: string) => px.get(k)!.get(t)!
    // 일봉 t 의 UTC 날짜가 곧 거래일. 어제까지 보유분이 배당 대상
    const day = new Date(t).toISOString().slice(0, 10)
    for (const k of keys) {
      const d = opts.dividends?.[k]?.[day]
      if (d)
        shares.set(k, shares.get(k)! * (1 + (d * (1 - WITHHOLDING)) / price(k)))
    }
    const pre = keys.reduce((a, k) => a + shares.get(k)! * price(k), 0) * f
    if (post) index *= pre / post
    if (index > peak.v) peak = { v: index, t }
    if (index / peak.v - 1 < mdd.rate)
      Object.assign(mdd, { rate: index / peak.v - 1, peak: peak.t, trough: t })

    const stage = opts.bear ? stageOf(opts.bear.steps, drawdown.get(t)!) : 0
    stageDays[stage]!++
    const w = stage ? opts.bear!.weightsAt(stage) : weights
    for (const k of keys)
      shares.set(k, shares.get(k)! + (opts.daily * (w[k] ?? 0)) / price(k))
    post = pre + opts.daily * f
    invested += opts.daily * f
    value.push({ t, v: post })
    twr.push({ t, v: index - 1 })
  }
  const span = dates.at(-1)! - dates[0]!
  return {
    value,
    twr,
    invested,
    final: post,
    cagr: index ** (YEAR / span) - 1,
    mdd,
    stageDays,
  }
}
