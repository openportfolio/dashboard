/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Fill, Holding } from '@portfolio/client'
import { capitalGains, fxOn, taxOf, unrealized } from './tax.ts'

const fill = (
  side: 'BUY' | 'SELL',
  quantity: number,
  price: number,
  settlement: string,
  extra: Partial<Fill> = {},
): Fill => ({
  orderId: `${side}${settlement}${quantity}`,
  symbol: 'QQQ',
  side,
  currency: 'USD',
  quantity,
  price,
  amount: quantity * price,
  commission: 0,
  tax: 0,
  at: Date.parse(settlement),
  settlement,
  ...extra,
})
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6

test('환율: 그날 없으면 직전 값, 처음보다 앞이면 없음', () => {
  const fx = fxOn([
    { t: Date.UTC(2025, 0, 2), v: 1400 },
    { t: Date.UTC(2025, 0, 6), v: 1450 },
  ])
  assert.equal(fx('2025-01-02'), 1400)
  assert.equal(fx('2025-01-04'), 1400) // 주말
  assert.equal(fx('2025-01-07'), 1450)
  assert.equal(fx('2025-01-01'), undefined)
})

test('선입선출 · 결제일 환율 · 수수료: 연도별 실현 손익, 남은 원가, 기록 없는 매도', () => {
  const rate: Record<string, number> = {
    '2024-01-10': 1300,
    '2024-06-10': 1400,
    '2025-03-10': 1500,
  }
  const r = capitalGains(
    [
      fill('BUY', 10, 100, '2024-01-10', { commission: 1 }), // (1000+1)×1300 / 10주
      fill('BUY', 10, 200, '2024-06-10'), // 200×1400 = 280,000/주
      fill('SELL', 15, 300, '2025-03-10', { commission: 3 }), // 첫 10주 + 다음 5주
      fill('SELL', 1, 300, '2025-03-10', { symbol: 'TSLA' }), // 매수 기록 없음
      fill('BUY', 1, 1, '2025-03-10', { currency: 'KRW', symbol: '000660' }), // 국내는 제외
    ],
    (d) => rate[d],
  )
  const cost = 1001 * 1300 + 5 * 200 * 1400
  const proceeds = (4500 - 3) * 1500
  const y = r.years.get('2025')!
  assert.ok(near(y.gain, proceeds - cost))
  assert.ok(near(y.bySymbol.get('QQQ')!.cost, cost))
  assert.equal(r.years.has('2024'), false)
  assert.deepEqual(r.held.get('QQQ'), { qty: 5, cost: 5 * 280_000 })
  assert.deepEqual([...r.unmatched], [['TSLA', 1]])
  assert.equal(y.bySymbol.get('TSLA')!.proceeds, 0) // 기록 없는 몫은 양도가도 뺀다
  assert.equal(r.held.has('000660'), false)
})

test('세금: 250만원 공제 뒤 22%, 손실이면 0 · 미실현은 기록 있는 수량만', () => {
  assert.equal(taxOf(1_000_000), 0)
  assert.ok(near(taxOf(3_500_000), 220_000))
  assert.equal(taxOf(-5_000_000), 0)
  const h = {
    symbol: 'QQQ',
    quantity: 8,
    value: 4_000_000,
    currency: 'USD',
  } as Holding
  const u = unrealized([h], new Map([['QQQ', { qty: 5, cost: 1_500_000 }]]))
  // 8주 중 5주만 기록: 평가액 2,500,000 - 원가 1,500,000
  assert.ok(near(u.gain, 1_000_000))
  assert.equal(u.rows[0]!.missing, 3)
})
