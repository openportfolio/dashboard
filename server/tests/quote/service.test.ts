import assert from 'node:assert/strict'
import { test } from 'node:test'
import { currentSession } from '../../src/quote/service.ts'

const min = 60_000

test('1시간 넘게 끊기면 이전 세션은 버린다', () => {
  const yesterday = [0, 1, 2].map((m) => ({ t: m * min, v: 1 }))
  const today = [900, 901, 950, 1009].map((m) => ({ t: m * min, v: 2 })) // 59분 공백은 같은 세션
  assert.deepEqual(currentSession([...yesterday, ...today]), today)
})

test('끊김이 없으면 전부, 비어 있으면 빈 배열', () => {
  const pts = [0, 30, 60].map((m) => ({ t: m * min, v: m }))
  assert.deepEqual(currentSession(pts), pts)
  assert.deepEqual(currentSession([]), [])
})
