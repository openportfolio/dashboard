// 토스증권 실시간(웹소켓). 스펙: https://openapi.tossinvest.com/openapi-docs/latest/asyncapi.json
import type { Market } from '@portfolio/client'
import { config } from '../config.ts'
import * as demo from './demo.ts'
import { token } from './toss.ts'

const WS_URL = 'wss://openapi-ws.tossinvest.com/ws/v1'

export interface Trade {
  market: Market
  symbol: string
  price: number
}

type Frame =
  | { type: 'message'; topic: string; data: { price: string } }
  | { type: 'subscriptions'; rejected: { target: string; code: string }[] }
  | { type: 'error'; error: { code: string; message: string } }
  | { type: 'pong' }

/**
 * 보유 종목 실시간 체결 구독. 계정당 동시 연결은 2개까지라 연결 하나만 쓴다.
 * 끊기면 지수 백오프(1s → 2s → … 30s, jitter)로 재연결하고 구독을 다시 선언한다.
 */
export function tradeStream(onTrade: (t: Trade) => void) {
  if (config.demo) return demo.stream(onTrade)
  let ws: WebSocket | undefined
  let symbols: { market: Market; symbol: string }[] = []
  let closed = false
  let retry = 0
  let ping: ReturnType<typeof setInterval> | undefined
  let reconnect: ReturnType<typeof setTimeout> | undefined

  // 선언형 full-replace: 보내는 배열이 곧 현재 구독 전체
  const declare = () => {
    if (ws?.readyState !== WebSocket.OPEN) return
    const codes = (m: Market) =>
      symbols.filter((s) => s.market === m).map((s) => s.symbol)
    const decl = [
      { type: 'trade:us', codes: codes('US') },
      { type: 'trade:kr', codes: codes('KR') },
    ]
    ws.send(JSON.stringify(decl.filter((d) => d.codes.length)))
  }

  const onFrame = (raw: unknown) => {
    const m = JSON.parse(String(raw)) as Frame
    if (m.type === 'message' && m.topic.startsWith('trade:')) {
      const [, market, symbol] = m.topic.split(':')
      onTrade({
        market: market!.toUpperCase() as Market,
        symbol: symbol!,
        price: +m.data.price,
      })
    } else if (
      m.type === 'error' ||
      (m.type === 'subscriptions' && m.rejected.length)
    )
      console.warn('[toss-ws]', JSON.stringify(m))
  }

  const schedule = () => {
    const delay =
      Math.min(30_000, 1000 * 2 ** retry++) * (0.5 + Math.random() / 2)
    reconnect = setTimeout(connect, delay)
  }

  async function connect() {
    try {
      const sock = new WebSocket(WS_URL, {
        headers: { Authorization: `Bearer ${await token()}` },
      })
      ws = sock
      sock.onopen = () => {
        retry = 0
        declare()
        // 서버는 클라이언트 수신이 180초 없으면 끊는다 (서버 데이터는 타이머를 리셋하지 않음)
        ping = setInterval(() => sock.send('PING'), 60_000)
      }
      sock.onmessage = (e) => {
        try {
          onFrame(e.data)
        } catch (err) {
          console.warn('[toss-ws] bad frame', err)
        }
      }
      sock.onclose = () => {
        clearInterval(ping)
        if (!closed) schedule()
      }
    } catch (err) {
      console.warn(
        '[toss-ws] connect',
        err instanceof Error ? err.message : err,
      )
      if (!closed) schedule()
    }
  }

  connect()
  return {
    setSymbols(next: { market: Market; symbol: string }[]) {
      symbols = next
      declare()
    },
    close() {
      closed = true
      clearTimeout(reconnect)
      clearInterval(ping)
      ws?.close()
    },
  }
}
