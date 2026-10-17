import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dayStart, tradingDay } from '../../src/portfolio/history.ts'

test('tradingDay: 08:00 KST 에 날짜가 넘어간다', () => {
  const kst = (s: string) => Date.parse(s + '+09:00')
  // 미국 정규장 마감 직후는 아직 전날
  assert.equal(tradingDay(kst('2026-10-16T06:00')), '2026-10-15')
  assert.equal(tradingDay(kst('2026-10-16T07:59')), '2026-10-15')
  assert.equal(tradingDay(kst('2026-10-16T08:00')), '2026-10-16')
  assert.equal(tradingDay(kst('2026-10-16T23:59')), '2026-10-16')
})

test('dayStart: tradingDay 와 같은 08:00 KST 경계', () => {
  const kst = (s: string) => Date.parse(s + '+09:00')
  assert.equal(dayStart(kst('2026-10-16T08:00')), kst('2026-10-16T08:00'))
  assert.equal(dayStart(kst('2026-10-16T23:59')), kst('2026-10-16T08:00'))
  assert.equal(dayStart(kst('2026-10-17T07:59')), kst('2026-10-16T08:00'))
})
