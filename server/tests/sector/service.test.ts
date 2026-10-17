import assert from 'node:assert/strict'
import { test } from 'node:test'
import { returns } from '../../src/sector/service.ts'

test('종가(최신순) → 거래일 기준 기간 등락률', () => {
  // c[n] = 100 + n 이면 c[0]/c[n] - 1 = 100/(100+n) - 1
  const c = Array.from({ length: 300 }, (_, n) => 100 + n)
  const r = returns(c)
  assert.equal(r['1d'], 100 / 101 - 1)
  assert.equal(r['1w'], 100 / 105 - 1)
  assert.equal(r['1mo'], 100 / 121 - 1)
  assert.equal(r['1y'], 100 / 352 - 1)
})

test('기간보다 데이터가 짧으면 null', () => {
  const r = returns(Array.from({ length: 30 }, () => 50))
  assert.equal(r['1mo'], 0)
  assert.equal(r['3mo'], null)
  assert.equal(r['1y'], null)
  assert.equal(returns([])['1d'], null)
})
