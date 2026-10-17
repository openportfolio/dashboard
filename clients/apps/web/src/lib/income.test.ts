/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Holding } from '@portfolio/client'
import { frequency, income } from './income.ts'

const h = (
  symbol: string,
  quantity: number,
  value: number,
  market: 'US' | 'KR' = 'US',
) =>
  ({
    symbol,
    quantity,
    value,
    market,
    currency: market === 'US' ? 'USD' : 'KRW',
  }) as Holding

test('최근 12개월 배당 × 수량 → 원화 세후, 월별 · 주기 · 배당률', () => {
  const now = Date.parse('2026-10-17')
  const r = income(
    [
      h('SCHD', 10, 400_000),
      h('AMZN', 1, 300_000),
      h('000660', 2, 2_000_000, 'KR'),
    ],
    {
      SCHD: {
        '2025-09-24': 9,
        '2025-12-10': 0.3,
        '2026-03-25': 0.2,
        '2026-06-24': 0.25,
        '2026-09-23': 0.25,
      },
      AMZN: {},
      '000660': { '2026-03-28': 375 },
    },
    1000,
    now,
  )
  // SCHD: 1년 전(2025-09-24)은 빼고 0.3+0.2+0.25+0.25 = $1 × 10주 × 1000원 × 0.85
  const schd = r.rows.find((x) => x.holding.symbol === 'SCHD')!
  assert.equal(schd.perShare, 1)
  assert.equal(schd.count, 4)
  assert.equal(frequency(schd.count), '분기')
  assert.equal(schd.last, '2026-09-23')
  assert.ok(Math.abs(schd.annual - 8500) < 1e-9)
  assert.ok(Math.abs(schd.yield - 8500 / 400_000) < 1e-12)
  // 국내: 375원 × 2주 × (1 - 15.4%)
  assert.ok(
    Math.abs(r.rows.find((x) => x.holding.market === 'KR')!.annual - 634.5) <
      1e-9,
  )
  assert.deepEqual(
    r.none.map((x) => x.symbol),
    ['AMZN'],
  )
  assert.ok(Math.abs(r.months[2]! - (0.2 * 8500 + 634.5)) < 1e-9) // 3월
  assert.ok(Math.abs(r.total - (8500 + 634.5)) < 1e-9)
  assert.equal(r.rows[0]!.holding.symbol, 'SCHD') // 큰 순
})
