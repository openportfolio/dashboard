// 토스증권 Open API 클라이언트. 스펙: https://openapi.tossinvest.com/openapi-docs/latest/openapi.json
import { setTimeout as sleep } from 'node:timers/promises'
import { config } from '../config.ts'
import { BadRequest } from '../exceptions.ts'
import { cached, forget } from '../kit/cache.ts'
import { seal, unseal } from '../kit/secret.ts'
import { saveSetting, setting } from '../kit/settings.ts'
import * as demo from './demo.ts'

const BASE = 'https://openapi.tossinvest.com'

interface Credentials {
  clientId: string
  clientSecret: string
}

/** server/.env 에 있으면 그것을 (화면 입력보다 우선), 없으면 화면에서 저장한 키 */
export function credentials():
  | (Credentials & { from: 'env' | 'saved' })
  | null {
  if (config.tossClientId && config.tossClientSecret)
    return {
      clientId: config.tossClientId,
      clientSecret: config.tossClientSecret,
      from: 'env',
    }
  const saved = unseal(setting<Credentials | { sealed: string }>('toss'))
  return saved && { ...saved, from: 'saved' }
}

let tok: { v: string; exp: number } | null = null
let refreshing: Promise<string> | null = null

async function issue(c: Credentials) {
  const r = await fetch(BASE + '/oauth2/token', {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: c.clientId,
      client_secret: c.clientSecret,
    }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!r.ok)
    throw new Error(
      `토큰 발급 실패 ${r.status}: ${(await r.text()).slice(0, 300)}`,
    )
  const t = (await r.json()) as { access_token: string; expires_in: number }
  return { v: t.access_token, exp: Date.now() + (t.expires_in - 60) * 1000 }
}

// client 당 유효 토큰은 1개, 재발급 시 이전 토큰 즉시 무효 → 진행 중 재발급을 공유하고 stale 일 때만 재발급
export async function token(stale?: string): Promise<string> {
  if (tok && tok.v !== stale && Date.now() < tok.exp) return tok.v
  const c = credentials()
  if (!c)
    throw new Error(
      '토스 Open API 키가 없습니다. 화면에서 넣으세요 (키 없이 둘러보기: pnpm demo)',
    )
  refreshing ??= issue(c)
    .then((t) => (tok = t).v)
    .finally(() => (refreshing = null))
  return refreshing
}

/** 키를 확인하고 저장한다. 토큰을 받아 계좌 목록까지 불러 봐서 등록 안 한 IP 도 여기서 걸린다 */
export async function connect(c: Credentials) {
  try {
    const t = await issue(c)
    const r = await fetch(BASE + '/api/v1/accounts', {
      headers: { Authorization: `Bearer ${t.v}` },
      signal: AbortSignal.timeout(15_000),
    })
    if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0, 300)}`)
    saveSetting('toss', seal(c))
    // 방금 받은 토큰을 그대로 쓴다 (다시 받으면 이 토큰이 끊긴다). 이전 계좌의 캐시는 버린다
    tok = t
    forget('account', 'cash', 'fills')
  } catch (e) {
    throw new BadRequest(e instanceof Error ? e.message : String(e))
  }
}

export async function get<T>(
  path: string,
  query: Record<string, string> = {},
  account = false,
): Promise<T> {
  if (config.demo) return (await demo.get(path, query)) as T
  const qs = new URLSearchParams(query).toString()
  const url = BASE + path + (qs ? '?' + qs : '')
  let reauthed = false
  for (let i = 0; i < 5; i++) {
    const t = await token()
    const headers: Record<string, string> = { Authorization: `Bearer ${t}` }
    if (account) headers['X-Tossinvest-Account'] = String(await accountSeq())
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) })
    if (r.ok) return ((await r.json()) as { result: T }).result
    // 401 은 토큰 만료일 때만 재발급이 통한다. IP 미등록 등 다른 원인이면 재발급이 다른 클라이언트 토큰만 끊으므로 1회만
    if (r.status === 401 && !reauthed) {
      reauthed = true
      await r.body?.cancel()
      await token(t)
    } else if (r.status === 429) {
      await r.body?.cancel()
      await sleep(Number(r.headers.get('Retry-After') || 1) * 1000)
    } else
      throw new Error(`${r.status} ${path}: ${(await r.text()).slice(0, 300)}`)
  }
  throw new Error(`${path}: 재시도 초과`)
}

const accountSeq = () =>
  cached('account', 86_400_000, async () => {
    // 지금은 종합매매 계좌만 오고, 토스는 한 사람에 하나다
    const [a] = await get<{ accountSeq: number }[]>('/api/v1/accounts')
    if (!a) throw new Error('토스증권 종합매매 계좌가 없습니다')
    return a.accountSeq
  })
