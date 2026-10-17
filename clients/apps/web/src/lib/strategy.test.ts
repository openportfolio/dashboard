/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Holding, Strategy } from '@portfolio/client'
import {
  allocate,
  drawdown,
  fromHoldings,
  stageOf,
  stageWeights,
  targets,
} from './strategy.ts'

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9
// 하락장 룰 · 묶음 한도를 다 쓰는 전략 (코어 5종목 + 지수 + 배당 + 단기채)
const core: Strategy = {
  id: 'example',
  name: '예시 전략',
  daily: 200,
  assets: [
    ...['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN'].map((symbol) => ({
      symbol,
      weight: 10,
      role: 'growth' as const,
      group: 'Top5',
    })),
    { symbol: 'QQQM', weight: 20, role: 'growth' },
    { symbol: 'SCHD', weight: 20, role: 'cushion' },
    { symbol: 'SGOV', weight: 10, role: 'switch' },
  ],
  bear: { market: 'QQQ', steps: [-0.2, -0.3] },
  limits: { single: 0.15, groups: { Top5: 0.6 } },
}
const single = (symbol: string): Strategy => ({
  id: symbol,
  name: `${symbol} 100%`,
  daily: 200,
  assets: [{ symbol, weight: 100, role: 'hold' }],
})
const plan = (stage: number) =>
  Object.fromEntries(
    Object.entries(stageWeights(core, stage)).map(([k, w]) => [
      k,
      Math.round(w * core.daily * 100) / 100,
    ]),
  )

test('기본 단계: Top5 각 $20 · QQQM $40 · SCHD $40 · SGOV $20', () => {
  assert.deepEqual(plan(0), {
    AAPL: 20,
    MSFT: 20,
    NVDA: 20,
    GOOGL: 20,
    AMZN: 20,
    QQQM: 40,
    SCHD: 40,
    SGOV: 20,
  })
})

test('하락장: 2단계 SGOV 중단, 3단계 SCHD 절반 → Top5·QQQM 에 비중대로, 합계 유지', () => {
  for (const stage of [1, 2]) {
    const w = stageWeights(core, stage)
    assert.ok(
      near(
        Object.values(w).reduce((a, v) => a + v, 0),
        1,
      ),
    )
    assert.equal(w.SGOV, 0)
  }
  assert.deepEqual(plan(1), {
    AAPL: 22.86,
    MSFT: 22.86,
    NVDA: 22.86,
    GOOGL: 22.86,
    AMZN: 22.86,
    QQQM: 45.71,
    SCHD: 40,
    SGOV: 0,
  })
  assert.equal(plan(2).SCHD, 20)
  assert.equal(plan(2).QQQM, 51.43)
  // 성장 종목이 없으면 그대로
  assert.deepEqual(stageWeights(single('SPY'), 2), { SPY: 1 })
})

test('하락률 → 단계, 고점 대비 하락률', () => {
  const steps = [-0.2, -0.3]
  assert.equal(stageOf(steps, 0), 0)
  assert.equal(stageOf(steps, -0.1999), 0)
  assert.equal(stageOf(steps, -0.2), 1)
  assert.equal(stageOf(steps, -0.3), 2)
  const d = drawdown([
    { t: 1, v: 100 },
    { t: 2, v: 125 },
    { t: 3, v: 100 },
  ])
  assert.deepEqual(d.peak, { t: 2, v: 125 })
  assert.ok(near(d.rate, -0.2))
})

test('비율 합이 100 이 아니어도 비율대로 맞춘다', () => {
  const t = targets({
    ...core,
    assets: core.assets.map((a) => ({ ...a, weight: a.weight * 3 })),
  })
  assert.ok(near(t.QQQM!, 0.2))
})

test('allocate: QQQ 는 QQQM 에 합치고, 전략 외는 빼고, 묶음 합계·개별주 최대·매도 없이 맞출 추가 매수액', () => {
  const h = (symbol: string, value: number, stock = false) =>
    ({
      symbol,
      name: symbol,
      value,
      assetClass: stock ? '개별주식' : 'ETF',
    }) as Holding
  const a = allocate(
    [
      ...['AAPL', 'MSFT', 'NVDA', 'GOOGL'].map((s) => h(s, 100, true)),
      h('AMZN', 150, true),
      h('QQQM', 150),
      h('QQQ', 50),
      h('SCHD', 200),
      h('SGOV', 200), // 목표 10% 의 2배
      h('000660', 999, true),
    ],
    core,
  )
  assert.equal(a.total, 1150)
  assert.deepEqual(
    a.outside.map((x) => x.symbol),
    ['000660'],
  )
  const row = (k: string) => a.rows.find((r) => r.symbol === k)!
  assert.equal(row('QQQM').value, 200)
  assert.equal(row('QQQM').name, 'QQQM')
  // SGOV 200 이 10% 가 되려면 전체 2000 → 850 추가
  assert.equal(a.topUp, 850)
  assert.equal(row('SGOV').topUp, 0)
  assert.equal(row('AAPL').topUp, 100)
  assert.equal(a.single?.symbol, 'AMZN')
  assert.deepEqual(
    a.groups.map((g) => [g.name, near(g.weight, 550 / 1150), g.limit]),
    [['Top5', true, 0.6]],
  )
  // QQQ 를 직접 담은 전략에서는 QQQ 그대로
  assert.equal(allocate([h('QQQ', 10), h('QQQM', 5)], single('QQQ')).total, 10)
})

test('보유 비중으로 전략: 미국 종목만, 평가금액 비율 (소수 첫째 자리)', () => {
  const h = (symbol: string, value: number, currency: 'USD' | 'KRW') =>
    ({ symbol, value, currency }) as Holding
  const d = fromHoldings([
    h('SCHD', 200, 'USD'),
    h('000660', 999, 'KRW'),
    h('AAPL', 400, 'USD'),
  ])!
  assert.deepEqual(
    d.assets.map((a) => [a.symbol, a.weight]),
    [
      ['AAPL', 66.7],
      ['SCHD', 33.3],
    ],
  )
  assert.equal(fromHoldings([h('000660', 1, 'KRW')]), undefined)
})
