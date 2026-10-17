import type { PricePoint } from '@portfolio/client'
import { cached } from '../kit/cache.ts'

// Yahoo Finance 차트 API (비공식 · 키 없음). 토스 API 에 없는 배당과, 토스(최대 ~8년)보다 긴 일봉에 쓴다.
// yahoo-finance2(MIT) v4 chart 모듈에서 필요한 부분만 가져왔다: 주소 · 이름을 밝힌 User-Agent · 오류 응답.
// chart 는 쿠키 · crumb 이 필요 없다. 막히면 그 저장소의 src/modules/chart.ts · src/lib/options/defaults.ts 와 맞춘다
// (브라우저인 척하는 User-Agent 는 429 로 막힌다)
const UA = 'Mozilla/5.0 (compatible; portfolio-dashboard)'

export interface Chart {
  chart: {
    result:
      | {
          /** 거래소 시간대 (미국 주식 America/New_York, 환율 KRW=X 는 Europe/London) */
          meta: { exchangeTimezoneName: string }
          timestamp?: number[]
          indicators: { quote: { close?: (number | null)[] }[] }
          events?: {
            dividends?: Record<string, { amount: number; date: number }>
          }
        }[]
      | null
    error: { description: string } | null
  }
}

/** 초 단위 시각 → 거래소 날짜 (YYYY-MM-DD). 환율 일봉은 런던 자정이라 미국 동부로 보면 하루 앞이 된다 */
const dayIn = (c: Chart) => {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone:
      c.chart.result?.[0]?.meta.exchangeTimezoneName ?? 'America/New_York',
  })
  return (sec: number) => f.format(sec * 1000)
}

/** 일봉 종가 (분할 반영 · 배당 미반영 = 토스 수정주가와 같은 기준). t = 거래일의 UTC 자정.
 * 같은 날이 두 번이면(끝에 붙는 진행 중인 봉) 나중 값 */
export const closes = (c: Chart): PricePoint[] => {
  const r = c.chart.result?.[0]
  const close = r?.indicators.quote[0]?.close ?? []
  const day = dayIn(c)
  const byDay = new Map<number, number>()
  ;(r?.timestamp ?? []).forEach((s, i) => {
    if (close[i] != null) byDay.set(Date.parse(day(s)), close[i]!)
  })
  return [...byDay].map(([t, v]) => ({ t, v }))
}

/** 배당락일(거래소 날짜)별 주당 배당금 (분할 반영) */
export const exDates = (c: Chart): Record<string, number> => {
  const day = dayIn(c)
  return Object.fromEntries(
    Object.values(c.chart.result?.[0]?.events?.dividends ?? {})
      .sort((a, b) => a.date - b.date)
      .map((d) => [day(d.date), d.amount]),
  )
}

/** 상장 이후 전체 일봉 + 배당. 백테스트용이라 6시간 캐시 */
export const history = (symbol: string) =>
  cached(`yahoo:${symbol}`, 6 * 3_600_000, async () => {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=0&period2=${Math.floor(Date.now() / 1000)}&interval=1d&events=div`
    const r = await fetch(url, {
      headers: { 'user-agent': UA },
      signal: AbortSignal.timeout(20_000),
    })
    const c = (await r.json().catch(() => null)) as Chart | null
    if (!r.ok || !c?.chart.result)
      throw new Error(
        `Yahoo ${symbol}: ${c?.chart.error?.description ?? `HTTP ${r.status}`}`,
      )
    return { points: closes(c), dividends: exDates(c) }
  })
