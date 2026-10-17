import assert from 'node:assert/strict'
import { test } from 'node:test'
import { seal, unseal } from '../../src/kit/secret.ts'

// 가짜 암호화: 뒤집기 (진짜는 Electron safeStorage)
const rev = {
  seal: (s: string) => [...s].reverse().join(''),
  open: (s: string) => [...s].reverse().join(''),
}
const keys = { clientId: 'id', clientSecret: 's3cr3t' }

test('끼운 게 있으면 암호화해서 저장하고 같은 걸로 푼다', () => {
  const stored = seal(keys, rev)
  assert.ok('sealed' in stored && !stored.sealed.includes('s3cr3t'))
  assert.deepEqual(unseal(stored, rev), keys)
})

test('끼운 게 없으면 평문 그대로 (브라우저 모드), 평문 저장분은 앱에서도 읽힌다', () => {
  assert.deepEqual(seal(keys, null), keys)
  assert.deepEqual(unseal(keys, rev), keys)
  assert.equal(unseal(null, rev), null)
})

test('암호화된 걸 풀 수 없으면 null → 연결 화면에서 다시 넣는다', () => {
  const stored = seal(keys, rev)
  assert.equal(unseal(stored, null), null)
  const broken = {
    seal: rev.seal,
    open: () => {
      throw new Error('keychain')
    },
  }
  assert.equal(unseal(stored, broken), null)
})
