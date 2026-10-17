import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Api, ApiWrite } from '@portfolio/client'
import { config } from './config.ts'
import { BadRequest } from './exceptions.ts'
import { seed } from './integrations/demo.ts'
import { serveStatic } from './kit/static.ts'

// 앱(Electron)이 키 암호화를 끼운다
export { useSealer } from './kit/secret.ts'
import * as portfolio from './portfolio/endpoints.ts'
import * as quote from './quote/endpoints.ts'
import * as sector from './sector/endpoints.ts'
import * as setup from './setup/endpoints.ts'
import * as strategy from './strategy/endpoints.ts'
import * as trade from './trade/endpoints.ts'
import { subscribe } from './portfolio/stream.ts'

// 라우트 누락·응답 타입 불일치는 여기서 타입 에러가 난다
const routes: { [P in keyof Api]: (q: URLSearchParams) => Promise<Api[P]> } = {
  ...portfolio.routes,
  ...quote.routes,
  ...sector.routes,
  ...setup.routes,
  ...strategy.routes,
  ...trade.routes,
}
const writes: { [P in keyof ApiWrite]: (body: unknown) => Promise<void> } = {
  ...setup.writes,
  ...strategy.writes,
}

/** JSON 본문만 받는다 (form 같은 단순 요청으로는 못 보내게). 256KB 까지 */
async function json(req: IncomingMessage): Promise<unknown> {
  if (!req.headers['content-type']?.startsWith('application/json'))
    throw new BadRequest('JSON 본문이 필요합니다')
  const chunks: Buffer[] = []
  let size = 0
  for await (const c of req as AsyncIterable<Buffer>) {
    if ((size += c.length) > 256_000) throw new BadRequest('본문이 너무 큽니다')
    chunks.push(c)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new BadRequest('JSON 형식이 아닙니다')
  }
}

// DNS 리바인딩 방어: 127.0.0.1 바인딩만으로는 attacker.com → 127.0.0.1 재지정을 못 막는다
const LOCAL_HOST = /^(localhost|127\.0\.0\.1)(:\d+)?$/

/** 127.0.0.1:port 에 띄우고 실제 포트를 돌려준다 (0 이면 빈 포트) */
export async function listen(port: number): Promise<number> {
  if (config.demo)
    await seed().catch((e: unknown) =>
      console.warn(
        '[데모] 기록 채우기 실패:',
        e instanceof Error ? e.message : e,
      ),
    )
  const server = createServer(handle)
  await new Promise<void>((resolve) =>
    server.listen(port, '127.0.0.1', resolve),
  ) // 계좌 데이터 → localhost 전용
  return (server.address() as AddressInfo).port
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  if (!LOCAL_HOST.test(req.headers.host ?? '')) {
    res.writeHead(403).end()
    return
  }
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (
    config.webDir &&
    req.method === 'GET' &&
    !url.pathname.startsWith('/api/')
  )
    return serveStatic(config.webDir, url.pathname, res)
  // SSE: 체결이 반영된 스냅샷을 계속 흘려보낸다
  if (url.pathname === '/api/stream') return subscribe(res)
  const route = routes[url.pathname as keyof Api] as
    | ((q: URLSearchParams) => Promise<unknown>)
    | undefined
  const write = writes[url.pathname as keyof ApiWrite] as
    | ((body: unknown) => Promise<void>)
    | undefined
  let code = 200,
    body: unknown
  try {
    if (req.method === 'PUT') {
      if (!write) [code, body] = [404, { error: 'not found' }]
      else {
        await write(await json(req))
        body = { ok: true }
      }
    } else if (req.method !== 'GET')
      [code, body] = [405, { error: 'method not allowed' }]
    else if (!route) [code, body] = [404, { error: 'not found' }]
    else body = await route(url.searchParams)
  } catch (e) {
    // 업스트림 오류를 화면에 그대로 노출 (로컬 전용)
    ;[code, body] = [
      e instanceof BadRequest ? 400 : 502,
      { error: e instanceof Error ? e.message : String(e) },
    ]
  }
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(body))
}
