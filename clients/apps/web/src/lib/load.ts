import { api, type Api } from '@portfolio/client'

// 종목별 상장 이후 일봉 · 배당 (Yahoo, 서버도 캐시). 탭을 오가거나 전략을 켜고 끌 때 다시 받지 않게
// 이 페이지가 열려 있는 동안 기억한다. 실패는 기억하지 않음
const cache = new Map<string, Promise<unknown>>()

export function load<P extends '/api/candles' | '/api/dividends'>(
  path: P,
  symbol: string,
) {
  const key = `${path}|${symbol}`
  let p = cache.get(key) as Promise<Api[P]> | undefined
  if (!p) {
    p = api(
      path,
      path === '/api/candles' ? { symbol, range: 'max' } : { symbol },
    )
    p.catch(() => cache.delete(key))
    cache.set(key, p)
  }
  return p
}
