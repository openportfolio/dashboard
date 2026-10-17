import type { Holding } from '@portfolio/client'

/** 배당 원천징수: 미국 15% (한미 조세조약), 국내 15.4% (소득세 + 지방세) */
const TAX = { US: 0.15, KR: 0.154 } as const
const YEAR = 365 * 86_400_000

/** 한 해 배당 횟수 → 주기 */
export const frequency = (n: number) =>
  ({ 12: '월', 4: '분기', 2: '반기', 1: '연' })[n] ?? `연 ${n}회`

/**
 * 최근 12개월 배당이 앞으로도 그대로 나온다고 보고 보유 수량으로 셈한 세후 배당 (원화).
 * dividends: 보유 종목 심볼 → 배당락일 → 주당 배당금 (거래통화). fx: 원/달러
 */
export function income(
  holdings: Holding[],
  dividends: Record<string, Record<string, number>>,
  fx: number,
  now = Date.now(),
) {
  const since = new Date(now - YEAR).toISOString().slice(0, 10)
  const months = Array<number>(12).fill(0)
  const rows = holdings.flatMap((h) => {
    const recent = Object.entries(dividends[h.symbol] ?? {}).filter(
      ([d]) => d > since,
    )
    if (!recent.length) return []
    // 주당 금액 → 원화 세후
    const krw =
      h.quantity * (h.currency === 'USD' ? fx : 1) * (1 - TAX[h.market])
    for (const [d, v] of recent) months[Number(d.slice(5, 7)) - 1]! += v * krw
    const perShare = recent.reduce((a, [, v]) => a + v, 0)
    return [
      {
        holding: h,
        perShare,
        count: recent.length,
        last: recent.at(-1)![0],
        annual: perShare * krw,
        yield: (perShare * krw) / h.value,
      },
    ]
  })
  rows.sort((a, b) => b.annual - a.annual)
  const total = rows.reduce((a, r) => a + r.annual, 0)
  return {
    rows,
    total,
    months,
    /** 배당 안 주는 보유 종목 */
    none: holdings.filter((h) => !rows.some((r) => r.holding === h)),
  }
}
