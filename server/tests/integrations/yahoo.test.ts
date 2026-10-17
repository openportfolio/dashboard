import assert from 'node:assert/strict'
import { test } from 'node:test'
import { type Chart, closes, exDates } from '../../src/integrations/yahoo.ts'

const sec = (...d: [number, number, number, number, number]) =>
  Date.UTC(...d) / 1000
type Result = NonNullable<Chart['chart']['result']>[number]
const chart = (r: Omit<Result, 'meta'>, tz = 'America/New_York'): Chart => ({
  chart: {
    error: null,
    result: [{ meta: { exchangeTimezoneName: tz }, ...r }],
  },
})

test('배당 시각 → 미국 동부 날짜 (서머타임 · 자정 전후)', () => {
  const c = chart({
    indicators: { quote: [{}] },
    events: {
      dividends: {
        b: { amount: 0.2747, date: sec(2024, 5, 26, 13, 30) }, // 09:30 EDT
        a: { amount: 0.247333, date: sec(2023, 11, 6, 14, 30) }, // 09:30 EST
        c: { amount: 0.3, date: sec(2024, 0, 10, 3, 0) }, // UTC 로는 10일, 동부로는 9일 22시
      },
    },
  })
  assert.deepEqual(exDates(c), {
    '2023-12-06': 0.247333,
    '2024-06-26': 0.2747,
    '2024-01-09': 0.3,
  })
})

test('무배당이면 빈 객체', () => {
  assert.deepEqual(exDates(chart({ indicators: { quote: [{}] } })), {})
})

test('종가: 거래일 UTC 자정으로 맞추고 빈 값은 건너뛴다', () => {
  const c = chart({
    timestamp: [
      sec(2024, 5, 26, 13, 30),
      sec(2024, 5, 27, 13, 30),
      sec(2024, 5, 28, 13, 30),
    ],
    indicators: { quote: [{ close: [10, null, 12] }] },
  })
  assert.deepEqual(closes(c), [
    { t: Date.UTC(2024, 5, 26), v: 10 },
    { t: Date.UTC(2024, 5, 28), v: 12 },
  ])
})

test('환율(런던 자정 봉): 거래소 날짜로, 같은 날 두 번이면 나중 값', () => {
  const c = chart(
    {
      // 런던 00:00 BST = 전날 23:00 UTC, 마지막은 같은 날 진행 중인 봉
      timestamp: [
        sec(2026, 9, 14, 23, 0),
        sec(2026, 9, 15, 23, 0),
        sec(2026, 9, 16, 21, 0),
      ],
      indicators: { quote: [{ close: [1330, 1333, 1334] }] },
    },
    'Europe/London',
  )
  assert.deepEqual(closes(c), [
    { t: Date.UTC(2026, 9, 15), v: 1330 },
    { t: Date.UTC(2026, 9, 16), v: 1334 },
  ])
})
