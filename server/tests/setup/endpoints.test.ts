import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BadRequest } from '../../src/exceptions.ts'
import { parseSetup } from '../../src/setup/endpoints.ts'

test('키 입력: 앞뒤 공백을 지우고 아는 필드만 꺼낸다', () => {
  assert.deepEqual(
    parseSetup({
      clientId: ' abc-123 ',
      clientSecret: 's3cr3t!',
      contact: ' me@example.com ',
      extra: 'x',
    }),
    { clientId: 'abc-123', clientSecret: 's3cr3t!', contact: 'me@example.com' },
  )
  assert.deepEqual(parseSetup({ clientId: 'a', clientSecret: 'b' }), {
    clientId: 'a',
    clientSecret: 'b',
    contact: '',
  })
})

test('키 입력: 빈 키 · 공백 섞인 키 · 문자열 아님 · 이메일 아닌 연락처는 거절', () => {
  for (const bad of [
    null,
    {},
    { clientId: '', clientSecret: 'b' },
    { clientId: 'a b', clientSecret: 'b' },
    { clientId: 'a', clientSecret: 1 },
    { clientId: 'a'.repeat(201), clientSecret: 'b' },
    { clientId: 'a', clientSecret: 'b', contact: 'not-an-email' },
  ])
    assert.throws(() => parseSetup(bad), BadRequest, JSON.stringify(bad))
})
