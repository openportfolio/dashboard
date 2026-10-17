import type { Fill } from '@portfolio/client'
import { get } from '../integrations/toss.ts'
import { cached } from '../kit/cache.ts'
import { db } from '../kit/db.ts'

interface Order {
  orderId: string
  symbol: string
  side: 'BUY' | 'SELL'
  currency: 'KRW' | 'USD'
  orderedAt: string
  execution?: {
    filledQuantity: string
    averageFilledPrice: string | null
    filledAmount: string | null
    commission: string | null
    tax: string | null
    filledAt: string | null
    settlementDate: string | null
  }
}

/** 체결된 끝난 주문만 체결 하나로. 미체결 · 취소는 null */
function toFill(o: Order): Fill | null {
  const e = o.execution
  const quantity = Number(e?.filledQuantity ?? 0)
  if (!e || !quantity || !e.filledAt) return null
  return {
    orderId: o.orderId,
    symbol: o.symbol,
    side: o.side,
    currency: o.currency,
    quantity,
    price: Number(e.averageFilledPrice ?? 0),
    amount: Number(e.filledAmount ?? 0),
    commission: Number(e.commission ?? 0),
    tax: Number(e.tax ?? 0),
    at: Date.parse(e.filledAt),
    settlement: e.settlementDate ?? e.filledAt.slice(0, 10),
  }
}

let ready = false
const open = () => {
  const d = db()
  if (!ready) {
    // 끝난 주문은 다시 바뀌지 않으니 한 번 받은 건 쌓아 두고 새 주문만 이어 받는다
    d.exec(`CREATE TABLE IF NOT EXISTS fills (
      id TEXT PRIMARY KEY,
      at INTEGER NOT NULL,
      fill TEXT NOT NULL
    )`)
    ready = true
  }
  return d
}

/** 새로 끝난 주문을 받아 쌓는다. 이미 쌓인 주문만 있는 페이지가 나오면 멈춘다 (최신순 응답) */
async function sync() {
  const d = open()
  const known = d.prepare('SELECT 1 FROM fills WHERE id = ?')
  const insert = d.prepare('INSERT OR REPLACE INTO fills VALUES (?, ?, ?)')
  let cursor: string | null = null
  for (let page = 0; page < 200; page++) {
    type R = { orders: Order[]; nextCursor: string | null; hasNext: boolean }
    const r: R = await get<R>(
      '/api/v1/orders',
      { status: 'CLOSED', limit: '100', ...(cursor ? { cursor } : {}) },
      true,
    )
    let fresh = 0
    for (const o of r.orders) {
      if (known.get(o.orderId)) continue
      fresh++
      const f = toFill(o)
      // 체결 안 된 주문도 id 는 남겨 다음에 다시 안 본다
      insert.run(o.orderId, f?.at ?? 0, JSON.stringify(f))
    }
    if (!fresh || !r.hasNext || !r.nextCursor) break
    cursor = r.nextCursor
  }
}

/** 체결 내역 전체 (오래된 순). 토스 주문 조회는 따로 묶인 호출 한도가 있어 5분 캐시 */
export const fills = () =>
  cached('fills', 5 * 60_000, async () => {
    await sync()
    return (
      open()
        .prepare('SELECT fill FROM fills WHERE at > 0 ORDER BY at')
        .all() as { fill: string }[]
    ).map((r) => JSON.parse(r.fill) as Fill)
  })
