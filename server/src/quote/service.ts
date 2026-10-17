import type { ChartRange, PricePoint } from '@portfolio/client'
import { get } from '../integrations/toss.ts'
import { history } from '../integrations/yahoo.ts'
import { cached } from '../kit/cache.ts'

const SESSION_GAP = 60 * 60_000

/** 순수 함수: 오래된→최신 순 점들에서 마지막 연속 구간(1시간 넘게 끊기면 다른 세션)만 */
export function currentSession(points: PricePoint[]): PricePoint[] {
  let i = points.length - 1
  while (i > 0 && points[i]!.t - points[i - 1]!.t <= SESSION_GAP) i--
  return points.slice(Math.max(0, i))
}

const RANGES: Record<
  Exclude<ChartRange, 'max'>,
  { interval: string; pages: number; ttl: number }
> = {
  '1d': { interval: '1m', pages: 2, ttl: 30_000 }, // 400분 ≈ 국내 정규장 하루
  '1y': { interval: '1d', pages: 2, ttl: 600_000 }, // 400 거래일 중 최근 1년
}

/** 상장 이후 전체 배당 (백테스트용, Yahoo) */
export const dividends = async (symbol: string) =>
  (await history(symbol)).dividends

/** 1d · 1y 는 토스, max(백테스트용 상장 이후 전체)는 Yahoo. 토스 일봉은 최대 ~8년이라서 */
export const candles = async (symbol: string, range: ChartRange) =>
  range === 'max' ? (await history(symbol)).points : toss(symbol, range)

const toss = (symbol: string, range: Exclude<ChartRange, 'max'>) =>
  cached(`candles:${symbol}:${range}`, RANGES[range].ttl, async () => {
    type R = {
      candles: { timestamp: string; closePrice: string }[]
      nextBefore: string | null
    }
    const { interval, pages } = RANGES[range]
    const raw: R['candles'] = []
    let before: string | null = null
    for (let p = 0; p < pages; p++) {
      const r: R = await get<R>('/api/v1/candles', {
        symbol,
        interval,
        count: '200',
        ...(before ? { before } : {}),
      })
      raw.push(...r.candles)
      before = r.nextBefore
      if (!before) break
    }
    // 응답은 최신순 → 차트용으로 오래된 순
    const points = raw
      .map((c) => ({ t: Date.parse(c.timestamp), v: +c.closePrice }))
      .reverse()
    return range === '1d' ? currentSession(points) : points.slice(-253)
  })
