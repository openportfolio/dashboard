import type { ChartRange } from '@portfolio/client'
import { BadRequest } from '../exceptions.ts'
import { candles, dividends } from './service.ts'

const RANGES: ChartRange[] = ['1d', '1y', 'max']

export const routes = {
  '/api/candles': (q: URLSearchParams) => {
    const symbol = q.get('symbol') ?? ''
    const range = (q.get('range') ?? '1d') as ChartRange
    // 토스 심볼 규칙과 같은 문자만 허용 (업스트림 쿼리에 그대로 들어간다). '=' 는 Yahoo 환율(KRW=X)용
    if (!/^[A-Za-z0-9.=-]{1,12}$/.test(symbol) || !RANGES.includes(range))
      throw new BadRequest('symbol/range 값이 올바르지 않습니다')
    return candles(symbol, range)
  },
  '/api/dividends': (q: URLSearchParams) => {
    const symbol = q.get('symbol') ?? ''
    if (!/^[A-Za-z0-9.-]{1,12}$/.test(symbol))
      throw new BadRequest('symbol 값이 올바르지 않습니다')
    return dividends(symbol)
  },
}
