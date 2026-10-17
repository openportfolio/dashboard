import type { Holding, PricePoint, Role, Strategy } from '@portfolio/client'

export type { Role, Strategy, StrategyAsset } from '@portfolio/client'

// 전략 = 종목별 비율 + 하락장 룰 + 매도 허용 트리거. 순수 함수만 (저장은 strategies.ts)

/** 하락장 때 각 종목이 하는 일 */
export const ROLES: Record<Role, { label: string; help: string }> = {
  growth: { label: '성장', help: '줄인 몫을 넘겨받음' },
  switch: { label: '스위치', help: '2단계부터 매수 중단' },
  cushion: { label: '완충', help: '3단계에 매수 절반' },
  hold: { label: '유지', help: '그대로' },
}
/** 3단계에서 완충 종목 매수를 줄이는 비율 (절반) */
const CUSHION_CUT = 0.5

type Draft = Omit<Strategy, 'id'>

/** 처음 만들 때 고르는 출발점. 고르면 새 id 를 붙여 사용자 전략이 된다 */
export const TEMPLATES: { help: string; strategy: Draft }[] = [
  {
    help: '미국 대형주 500개 지수 하나',
    strategy: {
      name: 'S&P 500',
      daily: 100,
      assets: [{ symbol: 'VOO', weight: 100, role: 'hold' }],
    },
  },
  {
    help: '나스닥 100 지수 하나',
    strategy: {
      name: '나스닥 100',
      daily: 100,
      assets: [{ symbol: 'QQQM', weight: 100, role: 'hold' }],
    },
  },
  {
    help: '성장 지수 + 배당 + 단기채. 하락장에는 단기채·배당 몫을 성장 지수로',
    strategy: {
      name: '성장 · 배당 · 단기채',
      daily: 100,
      assets: [
        { symbol: 'QQQM', weight: 60, role: 'growth' },
        { symbol: 'SCHD', weight: 25, role: 'cushion' },
        { symbol: 'SGOV', weight: 15, role: 'switch' },
      ],
      bear: { market: 'QQQ', steps: [-0.2, -0.3] },
    },
  },
]

/** 지금 보유한 미국 종목의 평가금액 비율 그대로 (매일 매수가 달러라 국내 종목은 뺀다). 없으면 undefined */
export function fromHoldings(holdings: Holding[]): Draft | undefined {
  const us = holdings
    .filter((h) => h.currency === 'USD' && h.value > 0)
    .sort((a, b) => b.value - a.value)
  const total = us.reduce((a, h) => a + h.value, 0)
  if (!total) return
  return {
    name: '지금 보유 비중',
    daily: 100,
    assets: us.map((h) => ({
      symbol: h.symbol,
      weight: Math.round((h.value / total) * 1000) / 10,
      role: 'hold',
    })),
  }
}

/** 백테스트 비교선: 지수 하나를 같은 금액으로 매일 샀을 때 */
export const BENCHMARKS = [
  { symbol: 'QQQ', label: '나스닥100', color: 'var(--s2)' },
  { symbol: 'SPY', label: 'S&P 500', color: 'var(--s3)' },
  { symbol: 'DIA', label: '다우', color: 'var(--s7)' },
]

/** 종목 → 목표 비중 (합 1) */
export function targets(s: Strategy): Record<string, number> {
  const total = s.assets.reduce((a, x) => a + x.weight, 0)
  return Object.fromEntries(
    s.assets.map((a) => [a.symbol, total ? a.weight / total : 0]),
  )
}

/**
 * 하락장 단계(0 = 1단계)별 비중. 2단계부터 스위치 종목을, 3단계에는 완충 종목의 절반도
 * 성장 종목에 기존 비중대로 넘긴다. 성장 종목이 없으면 그대로
 */
export function stageWeights(
  s: Strategy,
  stage: number,
): Record<string, number> {
  const w = targets(s)
  const growth = s.assets.filter((a) => a.role === 'growth')
  const g = growth.reduce((t, a) => t + w[a.symbol]!, 0)
  if (!stage || !g) return w
  const out = { ...w }
  let moved = 0
  for (const a of s.assets) {
    const cut =
      a.role === 'switch'
        ? w[a.symbol]!
        : a.role === 'cushion' && stage >= 2
          ? w[a.symbol]! * CUSHION_CUT
          : 0
    out[a.symbol] = w[a.symbol]! - cut
    moved += cut
  }
  for (const a of growth) out[a.symbol] = w[a.symbol]! * (1 + moved / g)
  return out
}

/** 하락률 → 단계 (0 = 1단계) */
export const stageOf = (steps: number[], drawdown: number) =>
  steps.filter((x) => drawdown <= x).length

/** 단계별 설명 (전략 탭 목록) */
export function stageLabels(steps: [number, number]) {
  const p = (v: number) => `${Math.round(v * 100)}%`.replace('-', '−')
  const [a, b] = [...steps].sort((x, y) => y - x) as [number, number]
  return [
    { label: `0 ~ ${p(a)}`, rule: '변경 없음' },
    {
      label: `${p(a)} ~ ${p(b)}`,
      rule: '스위치 매수 중단 → 성장 종목',
    },
    {
      label: `${p(b)} 이하`,
      rule: '완충 절반 · 스위치 중단 → 성장 종목',
    },
  ]
}

/** 오래된 순 종가 → 기간 고점과 고점 대비 하락률 (≤ 0) */
export function drawdown(points: PricePoint[]) {
  const peak = points.reduce((a, p) => (p.v > a.v ? p : a))
  return { peak, rate: points.at(-1)!.v / peak.v - 1 }
}

/** 같은 자산으로 셈하는 심볼 (QQQ 는 QQQM 과 같은 나스닥100). 전략에 원래 심볼이 없을 때만 */
const ALIAS: Record<string, string> = { QQQ: 'QQQM', GOOG: 'GOOGL' }

export type Allocation = ReturnType<typeof allocate>

/** 보유 종목 → 전략 종목별 비중. 금액은 holdings 와 같은 KRW 환산 */
export function allocate(holdings: Holding[], s: Strategy) {
  const t = targets(s)
  const value = new Map<string, number>()
  const held = new Map<string, Holding>()
  const outside: Holding[] = []
  for (const h of holdings) {
    const key =
      h.symbol in t
        ? h.symbol
        : (ALIAS[h.symbol] ?? '') in t
          ? ALIAS[h.symbol]!
          : undefined
    if (!key) {
      outside.push(h)
      continue
    }
    value.set(key, (value.get(key) ?? 0) + h.value)
    if (!held.has(key) || h.symbol === key) held.set(key, h)
  }
  const total = [...value.values()].reduce((a, v) => a + v, 0)
  // 매도 없이 목표 비중을 맞추려면, 가장 많이 초과한 종목이 목표 비중이 될 만큼 전체를 키워야 한다
  const goal = Math.max(
    0,
    ...s.assets.map((a) =>
      t[a.symbol] ? (value.get(a.symbol) ?? 0) / t[a.symbol]! : 0,
    ),
  )
  const rows = s.assets.map((a) => {
    const v = value.get(a.symbol) ?? 0
    const weight = total ? v / total : 0
    const target = t[a.symbol]!
    return {
      ...a,
      name: held.get(a.symbol)?.name ?? a.symbol,
      stock: held.get(a.symbol)?.assetClass === '개별주식',
      target,
      value: v,
      weight,
      topUp: target * goal - v,
    }
  })
  const groups = [
    ...new Set(rows.flatMap((r) => (r.group ? [r.group] : []))),
  ].map((name) => {
    const rs = rows.filter((r) => r.group === name)
    return {
      name,
      weight: rs.reduce((a, r) => a + r.weight, 0),
      target: rs.reduce((a, r) => a + r.target, 0),
      limit: s.limits?.groups?.[name],
    }
  })
  const stocks = rows.filter((r) => r.stock)
  return {
    rows,
    total,
    outside,
    /** 매도 없이 맞추는 데 필요한 추가 매수 합계 */
    topUp: goal - total,
    groups,
    /** 비중이 가장 큰 개별주 (보유한 개별주가 없으면 undefined) */
    single: stocks.length
      ? stocks.reduce((a, r) => (r.weight > a.weight ? r : a))
      : undefined,
  }
}
