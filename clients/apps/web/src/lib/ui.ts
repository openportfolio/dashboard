import type { Duration } from '@portfolio/client'

export const won = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 })
const sign = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '')
export const pct = (v: number | null | undefined) =>
  v == null ? '–' : sign(v) + Math.abs(v * 100).toFixed(2) + '%'
export const sWon = (v: number) => sign(v) + won.format(Math.abs(v)) + '원'
export const share = (v: number) => (v * 100).toFixed(1) + '%'
export const dir = (v: number) => (v > 0 ? 'up' : v < 0 ? 'down' : '')

export const DUR_LABEL: Record<Duration, string> = {
  '1d': '1일',
  '1w': '1주',
  '1mo': '1개월',
  '3mo': '3개월',
  '6mo': '6개월',
  '1y': '1년',
}
export const DURS = Object.keys(DUR_LABEL) as Duration[]

export const OTHER = 'var(--other)'

/** 키마다 색 슬롯을 처음 본 순서로 고정한다 (순위가 바뀌어도 다시 칠하지 않음). 8번째부터는 '그 외' 회색 */
export function colorScale() {
  const slot = new Map<string, number>()
  return (key: string) => {
    if (!slot.has(key) && slot.size < 7) slot.set(key, slot.size + 1)
    return slot.has(key) ? `var(--s${slot.get(key)})` : OTHER
  }
}

/** 섹터 색 (비중 표·히트맵 공용) */
export const colorOf = colorScale()

/** 거래통화 가격: $186.42 / 7,728원 */
export const money = (v: number, currency: 'KRW' | 'USD') =>
  currency === 'USD'
    ? '$' +
      v.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : won.format(v) + '원'

/** 달러 금액: $1,234.5 (소수 최대 2자리) */
export const usd = (v: number) =>
  '$' + v.toLocaleString('en-US', { maximumFractionDigits: 2 })
/** 센트 단위로 반올림한 달러: $22.86 */
export const cents = (v: number) => usd(Math.round(v * 100) / 100)

/** 소수점 수량(미국 소수점 거래)까지 */
export const qty = (v: number) =>
  v.toLocaleString('ko-KR', { maximumFractionDigits: 4 })

export const hhmm = (t: number) =>
  new Date(t).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  })
export const ymd = (t: number) =>
  new Date(t).toLocaleDateString('ko-KR', {
    year: '2-digit',
    month: 'short',
    day: 'numeric',
  })
