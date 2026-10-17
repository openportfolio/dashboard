import type { Duration, SectorPerformance } from '@portfolio/client'
import { cached } from '../kit/cache.ts'
import { candles } from '../quote/service.ts'
import { GICS } from './classification.ts'

const DURATIONS: Duration[] = ['1d', '1w', '1mo', '3mo', '6mo', '1y']
// 기간은 거래일 기준 (토스 섹터 API 와 같은 정의)
const TRADING_DAYS: Record<Duration, number> = {
  '1d': 1,
  '1w': 5,
  '1mo': 21,
  '3mo': 63,
  '6mo': 126,
  '1y': 252,
}

/** 순수 함수: 종가 배열(최신순) → 기간별 등락률 */
export function returns(c: number[]): Record<Duration, number | null> {
  return Object.fromEntries(
    DURATIONS.map((d) => {
      const n = TRADING_DAYS[d]
      return [d, c.length > n && c[n] ? c[0]! / c[n] - 1 : null]
    }),
  ) as Record<Duration, number | null>
}

/** GICS 11개 섹터의 기간별 등락률 (S&P 500 섹터 ETF 기준) */
export const performance = () =>
  cached('performance', 600_000, async (): Promise<SectorPerformance[]> => {
    const out: SectorPerformance[] = []
    // 차트 API 호출 한도가 있어 순차 조회 (10분 캐시). 1년 일봉(오래된 순) → 최신순 종가
    for (const [name, symbol] of Object.entries(GICS)) {
      const c = (await candles(symbol, '1y')).map((p) => p.v).reverse()
      out.push({ name, symbol, rates: returns(c) })
    }
    return out
  })
