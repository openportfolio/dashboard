/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PricePoint } from '@portfolio/client'
import { backtest, splice, WITHHOLDING } from './backtest.ts'

const series = (...vs: number[]): PricePoint[] =>
  vs.map((v, i) => ({ t: i * 86_400_000, v }))

test('적립식: 평가액·투자금, MDD·누적 수익률은 입금을 뺀 시간가중', () => {
  // 1주 @100 → 가격 반토막에 2주 더 → 원래 가격 회복
  const r = backtest(
    { A: series(100, 50, 100) },
    { A: 1 },
    { daily: 100, from: 0 },
  )!
  assert.equal(r.invested, 300)
  assert.equal(r.final, 400)
  assert.deepEqual(
    r.twr.map((p) => p.v),
    [0, -0.5, 0],
  )
  assert.deepEqual(r.mdd, { rate: -0.5, peak: 0, trough: 86_400_000 })
})

test('가격이 다 있는 날만, from 이후만', () => {
  const r = backtest(
    { A: series(1, 1, 1, 1), B: series(1, 1, 1, 1).slice(1) },
    { A: 0.5, B: 0.5 },
    { daily: 10, from: 86_400_000 * 2 },
  )!
  assert.deepEqual(
    r.value.map((p) => p.t / 86_400_000),
    [2, 3],
  )
})

test('하락장 룰: 시장 고점 대비 −20% 면 2단계, −30% 면 3단계 비중으로 산다', () => {
  // SGOV 는 마지막 날 2배 → 보유 수량이 결과에 드러난다
  const prices = { QQQM: series(1, 1, 1, 1), SGOV: series(1, 1, 1, 2) }
  const w = { QQQM: 0.8, SGOV: 0.2 }
  const bear = {
    market: series(100, 79, 69, 69),
    steps: [-0.2, -0.3],
    weightsAt: () => ({ QQQM: 1, SGOV: 0 }),
  }
  const on = backtest(prices, w, { daily: 100, from: 0, bear })!
  assert.deepEqual(on.stageDays, [1, 1, 2])
  // SGOV 는 첫날 20주만 → QQQM 280 + SGOV 20×2 + 마지막 날 매수 100
  assert.equal(on.final, 420)
  const off = backtest(prices, w, { daily: 100, from: 0 })!
  assert.equal(off.final, 460)
})

test('배당: 배당락일 종가에 원천징수 뒤 재투자, 시간가중 수익률에 포함', () => {
  // 1일 = 1970-01-02 (UTC 날짜가 거래일)
  const r = backtest(
    { A: series(10, 10, 10) },
    { A: 1 },
    { daily: 100, from: 0, dividends: { A: { '1970-01-02': 1 } } },
  )!
  // 10주 보유 중 주당 $1 → 세후 $8.5 = 0.85주 재투자
  assert.ok(Math.abs(r.twr[1]!.v - (1 - WITHHOLDING) / 10) < 1e-12)
  assert.ok(Math.abs(r.final - (300 + 8.5)) < 1e-9)
  assert.equal(r.invested, 300)
})

test('원화 기준: 그날(없으면 직전) 환율로 매수액 · 평가액, 수익률에 환율 변화가 들어간다', () => {
  const day = 86_400_000
  // 가격은 그대로, 환율만 1000 → 1100 (둘째 날 환율 없음 → 첫날 값)
  const r = backtest(
    { A: series(10, 10, 10) },
    { A: 1 },
    {
      daily: 1,
      from: 0,
      fx: [
        { t: 0, v: 1000 },
        { t: 2 * day, v: 1100 },
      ],
    },
  )!
  assert.equal(r.invested, 1000 + 1000 + 1100)
  assert.equal(r.final, 3 * 1100) // 3주 × $10 = $3 → 3,300원
  assert.ok(Math.abs(r.twr.at(-1)!.v - 0.1) < 1e-9)
})

test('상장 전 구간을 proxy 로: 첫날 가격 비율로 잇고 배당도 같은 비율', () => {
  const day = 86_400_000
  const s = splice(
    { points: [{ t: 2 * day, v: 50 }], dividends: { '1970-01-03': 1 } },
    {
      points: series(80, 90, 100),
      dividends: { '1970-01-02': 2, '1970-01-03': 9 },
    },
  )
  assert.deepEqual(s.points, [
    { t: 0, v: 40 },
    { t: day, v: 45 },
    { t: 2 * day, v: 50 },
  ])
  assert.deepEqual(s.dividends, { '1970-01-02': 1, '1970-01-03': 1 })
  // proxy 가 더 늦게 시작하면 그대로
  const late = { points: [{ t: 5 * day, v: 1 }] }
  assert.equal(splice({ points: [{ t: day, v: 1 }] }, late).points.length, 1)
})
