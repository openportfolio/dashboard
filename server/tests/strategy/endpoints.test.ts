import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BadRequest } from '../../src/exceptions.ts'
import { parseState } from '../../src/strategy/endpoints.ts'

const strategy = {
  id: 'a',
  name: '지수',
  daily: 100,
  assets: [{ symbol: 'SPY', weight: 100, role: 'hold', extra: 'x'.repeat(10) }],
  bear: { market: 'SPY', steps: [-0.2, -0.3] },
  limits: { single: 0.15, groups: { Top5: 0.6 } },
}

test('아는 필드만 남기고, 없는 id 는 비교 · 지금 전략에서 뺀다', () => {
  const s = parseState({
    list: [strategy],
    active: 'gone',
    compare: ['a', 'gone'],
    benchmarks: ['QQQ'],
    junk: 1,
  })
  assert.deepEqual(s, {
    list: [
      { ...strategy, assets: [{ symbol: 'SPY', weight: 100, role: 'hold' }] },
    ],
    active: 'a',
    compare: ['a'],
    benchmarks: ['QQQ'],
  })
  assert.deepEqual(
    parseState({ list: [], active: null, compare: [], benchmarks: [] }).active,
    null,
  )
})

test('잘못된 값은 400', () => {
  const bad = (patch: object) => () =>
    parseState({
      list: [{ ...strategy, ...patch }],
      active: 'a',
      compare: [],
      benchmarks: [],
    })
  for (const patch of [
    { daily: 0 },
    { daily: '100' },
    { assets: [{ symbol: 'a b', weight: 1, role: 'hold' }] },
    { assets: [{ symbol: 'SPY', weight: -1, role: 'hold' }] },
    { assets: [{ symbol: 'SPY', weight: 1, role: 'boss' }] },
    { assets: [{ symbol: 123, weight: 1, role: 'hold' }] },
    { bear: { market: 'SPY', steps: [0.2, -0.3] } },
    { id: '' },
  ])
    assert.throws(bad(patch), BadRequest, JSON.stringify(patch))
  assert.throws(() => parseState([]), BadRequest)
  assert.throws(
    () =>
      parseState({
        list: [strategy, strategy],
        active: 'a',
        compare: [],
        benchmarks: [],
      }),
    BadRequest,
  )
})
