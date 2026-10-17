import type { Setup } from '@portfolio/client'
import { config } from '../config.ts'
import { BadRequest } from '../exceptions.ts'
import { connect, credentials } from '../integrations/toss.ts'
import { saveSetting, setting } from '../kit/settings.ts'

// 처음 연결: 토스 Open API 키 · SEC 연락처를 화면에서 받는다. 키는 다시 돌려주지 않는다
const KEY = /^[\x21-\x7e]{1,200}$/ // 공백 없는 ASCII
const EMAIL = /^[^\s@]{1,100}@[^\s@]{1,100}\.[^\s@]{1,50}$/

/** 아는 필드만 검사해서 꺼낸다 */
export function parseSetup(v: unknown) {
  const b = (v ?? {}) as Record<string, unknown>
  const clientId = typeof b.clientId === 'string' ? b.clientId.trim() : ''
  const clientSecret =
    typeof b.clientSecret === 'string' ? b.clientSecret.trim() : ''
  const contact = typeof b.contact === 'string' ? b.contact.trim() : ''
  if (!KEY.test(clientId) || !KEY.test(clientSecret))
    throw new BadRequest('Client ID · Secret 을 확인하세요')
  if (contact && !EMAIL.test(contact))
    throw new BadRequest('연락처는 이메일 형식이어야 합니다')
  return { clientId, clientSecret, contact }
}

export const routes = {
  '/api/setup': async (): Promise<Setup> => ({
    keys: config.demo ? 'demo' : (credentials()?.from ?? null),
    contact: setting<string>('contact'),
  }),
}

export const writes = {
  '/api/setup': async (body: unknown) => {
    if (config.demo)
      throw new BadRequest('데모 모드에서는 키를 저장하지 않습니다')
    if (credentials()?.from === 'env')
      throw new BadRequest(
        'server/.env 의 키를 쓰고 있습니다. 화면에서 넣으려면 .env 의 두 줄을 지우고 서버를 다시 켜세요',
      )
    const { contact, ...keys } = parseSetup(body)
    await connect(keys)
    saveSetting('contact', contact || null)
  },
}
