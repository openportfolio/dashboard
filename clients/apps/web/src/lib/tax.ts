import type { Fill, Holding, PricePoint } from '@portfolio/client'

// 해외주식 양도소득세 추정: 연간 실현 손익 - 기본공제 250만원, 22% (지방세 포함)
export const DEDUCTION = 2_500_000
export const RATE = 0.22
export const taxOf = (gain: number) => Math.max(0, gain - DEDUCTION) * RATE

/** 원/달러 일봉 → 날짜(YYYY-MM-DD)별 환율. 그날이 없으면(주말 · 휴일) 직전 값 */
export function fxOn(points: PricePoint[]) {
  const days = points.map((p) => new Date(p.t).toISOString().slice(0, 10))
  return (day: string) => {
    let lo = 0
    let hi = days.length - 1
    if (hi < 0 || day < days[0]!) return undefined
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (days[mid]! <= day) lo = mid
      else hi = mid - 1
    }
    return points[lo]!.v
  }
}

const EPS = 1e-9

/**
 * 달러 체결을 선입선출로 맞춰 원화 손익을 낸다. 취득가 · 양도가 모두 결제일 환율 (세법은 결제일 기준환율).
 * 매수에 수수료를 더하고 매도에서 수수료 · 세금을 뺀다 (필요경비). 매수 기록보다 많이 판 몫은 계산에서 뺀다
 */
export function capitalGains(
  fills: Fill[],
  fx: (day: string) => number | undefined,
) {
  const lots = new Map<string, { qty: number; cost: number }[]>()
  const years = new Map<
    string,
    {
      gain: number
      bySymbol: Map<string, { qty: number; proceeds: number; cost: number }>
    }
  >()
  /** 매수 기록 없이 판 수량 (종목별) */
  const unmatched = new Map<string, number>()
  const noFx = new Set<string>()
  for (const f of fills) {
    if (f.currency !== 'USD') continue
    const r = fx(f.settlement)
    if (r === undefined) {
      noFx.add(f.settlement)
      continue
    }
    const q = lots.get(f.symbol) ?? []
    lots.set(f.symbol, q)
    if (f.side === 'BUY') {
      q.push({
        qty: f.quantity,
        cost: ((f.amount + f.commission + f.tax) * r) / f.quantity,
      })
      continue
    }
    let left = f.quantity
    let cost = 0
    while (left > EPS && q.length) {
      const lot = q[0]!
      const take = Math.min(lot.qty, left)
      cost += take * lot.cost
      lot.qty -= take
      left -= take
      if (lot.qty <= EPS) q.shift()
    }
    if (left > EPS)
      unmatched.set(f.symbol, (unmatched.get(f.symbol) ?? 0) + left)
    const matched = f.quantity - left
    const proceeds =
      ((f.amount - f.commission - f.tax) * r * matched) / f.quantity
    const year = f.settlement.slice(0, 4)
    const y = years.get(year) ?? { gain: 0, bySymbol: new Map() }
    years.set(year, y)
    const s = y.bySymbol.get(f.symbol) ?? { qty: 0, proceeds: 0, cost: 0 }
    y.bySymbol.set(f.symbol, {
      qty: s.qty + matched,
      proceeds: s.proceeds + proceeds,
      cost: s.cost + cost,
    })
    y.gain += proceeds - cost
  }
  return {
    /** 연도별 실현 손익 (원화) */
    years,
    /** 남은 보유분의 원화 취득가 (종목별 합계 · 수량) */
    held: new Map(
      [...lots].map(([k, q]) => [
        k,
        {
          qty: q.reduce((a, l) => a + l.qty, 0),
          cost: q.reduce((a, l) => a + l.qty * l.cost, 0),
        },
      ]),
    ),
    unmatched,
    noFx,
  }
}

/** 지금 모두 판다면: 보유 종목별 미실현 손익 (평가액 - 선입선출 원화 취득가). 기록보다 많이 가진 종목은 따로 */
export function unrealized(
  holdings: Holding[],
  held: ReturnType<typeof capitalGains>['held'],
) {
  const rows = holdings
    .filter((h) => h.currency === 'USD')
    .map((h) => {
      const lot = held.get(h.symbol)
      const known = Math.min(h.quantity, lot?.qty ?? 0)
      // 기록에 있는 수량만큼만 (평가액도 그 비율로)
      const value = h.quantity ? (h.value * known) / h.quantity : 0
      const cost = lot && lot.qty > EPS ? (lot.cost * known) / lot.qty : 0
      return {
        holding: h,
        value,
        cost,
        gain: value - cost,
        missing: h.quantity - known,
      }
    })
  return { rows, gain: rows.reduce((a, r) => a + r.gain, 0) }
}
