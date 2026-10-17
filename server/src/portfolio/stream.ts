import type { ServerResponse } from 'node:http'
import type { Snapshot } from '@portfolio/client'
import { tradeStream } from '../integrations/toss-ws.ts'
import { recordFlow } from './history.ts'
import { lastFetch, liveSnapshot, snapshot } from './service.ts'

// 체결로는 안 바뀌는 값(수량·현금·환율)은 REST 로 주기적으로 다시 맞춘다
const REFRESH_MS = 15_000
const FLUSH_MS = 1_000

const clients = new Set<ServerResponse>()
const ticks = new Map<string, { price: number; at: number }>()
let stop: (() => void) | undefined
let latest: Snapshot | undefined

const broadcast = (event: string | null, data: unknown) => {
  const msg = `${event ? `event: ${event}\n` : ''}data: ${JSON.stringify(data)}\n\n`
  for (const c of clients) c.write(msg)
}

// 총 자산 흐름은 스트림이 도는 동안(대시보드를 켠 동안)만 1분 단위로 DB 에 쌓는다 → 안 켠 시간은 빈다.
// 하루 전체가 필요하면 보유 종목 1분봉 × 수량으로 재구성
const push = (s: Snapshot) => {
  latest = s
  broadcast(null, s)
  // 기록이 실패해도 스트림은 계속
  try {
    recordFlow({ t: s.at - (s.at % 60_000), v: s.assets })
  } catch (e) {
    console.warn('[기록] 흐름 실패:', e instanceof Error ? e.message : e)
  }
}

// SSE 구독자가 있을 때만 토스 웹소켓을 연다 (계정당 동시 연결 2개 제한)
function start() {
  let dirty = false
  let declared = ''
  const ws = tradeStream((t) => {
    ticks.set(`${t.market}:${t.symbol}`, { price: t.price, at: Date.now() })
    dirty = true
  })
  const syncSymbols = () => {
    const items = lastFetch()?.h.items ?? []
    const key = items.map((i) => `${i.marketCountry}:${i.symbol}`).join(',')
    if (key === declared) return
    declared = key
    ws.setSymbols(
      items.map((i) => ({ market: i.marketCountry, symbol: i.symbol })),
    )
  }
  const refresh = () =>
    snapshot()
      .then((s) => {
        dirty = false
        push(s)
        syncSymbols()
      })
      .catch((e: unknown) =>
        broadcast('failure', e instanceof Error ? e.message : String(e)),
      )
  // 체결은 초당 수십 건씩 올 수 있어 1초 단위로 모아서 보낸다
  const flush = setInterval(() => {
    if (!dirty) return
    dirty = false
    const s = liveSnapshot(ticks)
    if (s) push(s)
  }, FLUSH_MS)
  const poll = setInterval(refresh, REFRESH_MS)
  refresh()

  stop = () => {
    clearInterval(flush)
    clearInterval(poll)
    ws.close()
    ticks.clear()
    latest = undefined
    stop = undefined
  }
}

export function subscribe(res: ServerResponse) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  clients.add(res)
  if (!stop) start()
  else if (latest) res.write(`data: ${JSON.stringify(latest)}\n\n`)
  res.on('close', () => {
    clients.delete(res)
    if (!clients.size) stop?.()
  })
}
