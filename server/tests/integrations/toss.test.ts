import assert from 'node:assert/strict'
import { test } from 'node:test'
import { config } from '../../src/config.ts'
import { get } from '../../src/integrations/toss.ts'

config.tossClientId = config.tossClientSecret = 'test'

test('401 이면 토큰은 한 번만 재발급하고 업스트림 에러를 그대로 낸다', async (t) => {
  let tokens = 0
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    if (String(input).endsWith('/oauth2/token')) {
      tokens++
      return Response.json({ access_token: `t${tokens}`, expires_in: 3600 })
    }
    return new Response('{"error":{"code":"ip-not-allowed"}}', { status: 401 })
  })

  await assert.rejects(
    get('/api/v1/prices'),
    /^Error: 401 \/api\/v1\/prices: .*ip-not-allowed/,
  )
  assert.equal(tokens, 2)
})
