import type { Holding, Market, Sector, Snapshot } from '@portfolio/client'
import { get } from '../integrations/toss.ts'
import { cached } from '../kit/cache.ts'
import { ETF_CLASS, STOCK_SECTOR, UNMAPPED } from '../sector/classification.ts'
import { etfSectors, gicsMap } from '../sector/universe.ts'
import { record } from './history.ts'

const CASH = '현금'
const STOCK = '개별주식'

const ETF_TYPES = new Set(['ETF', 'FOREIGN_ETF', 'ETN'])

// GET /api/v1/holdings 응답 중 쓰는 필드만. 금액·비율은 decimal 문자열
export interface TossHoldings {
  profitLoss: { rate: string }
  items: {
    symbol: string
    name: string
    marketCountry: Market
    currency: 'KRW' | 'USD'
    quantity: string
    lastPrice: string
    averagePurchasePrice: string
    marketValue: { amount: string; purchaseAmount: string }
    profitLoss: { amount: string; rate: string }
    dailyProfitLoss: { amount: string; rate: string }
  }[]
}

export interface Context {
  /** 1 USD = fx KRW */
  fx: number
  /** 주문 가능 현금 (통화별 원래 단위) */
  cash: { krw: number; usd: number }
  /** symbol → securityType (GET /api/v1/stocks) */
  types: Record<string, string>
  /** 종목 → GICS 섹터 (S&P 900 자동 분류) */
  gics: Record<string, string>
  /** ETF → 섹터 비중(합 1)과 기준일. 펼칠 수 없는 ETF 는 없음 */
  etfSectors: Record<string, { asOf: string; weights: Record<string, number> }>
}

/** holdings 응답 → KRW 환산 종목/섹터/자산군 집계. 순수 함수 */
export function aggregate(h: TossHoldings, ctx: Context): Omit<Snapshot, 'at'> {
  const { fx, cash, types, gics, etfSectors } = ctx
  const holdings: Holding[] = []
  const sectors = new Map<string, Sector>()
  const addExposure = (
    name: string,
    value: number,
    by: string,
    viaEtf: boolean,
  ) => {
    let s = sectors.get(name)
    if (!s) {
      s = {
        name,
        value: 0,
        weight: 0,
        direct: 0,
        etf: 0,
        symbols: [],
        etfs: [],
      }
      sectors.set(name, s)
    }
    s.value += value
    if (viaEtf) {
      s.etf += value
      s.etfs.push(by)
    } else {
      s.direct += value
      s.symbols.push(by)
    }
  }
  const exposure = { KRW: cash.krw, USD: cash.usd * fx }

  for (const it of h.items) {
    const k = it.currency === 'USD' ? fx : 1
    const mkt = it.marketCountry
    const etfClass = ETF_CLASS[it.symbol]
    const row: Holding = {
      symbol: it.symbol,
      name: it.name,
      market: mkt,
      value: +it.marketValue.amount * k,
      purchase: +it.marketValue.purchaseAmount * k,
      pnl: +it.profitLoss.amount * k,
      daily: +it.dailyProfitLoss.amount * k,
      rate: +it.profitLoss.rate,
      dailyRate: +it.dailyProfitLoss.rate,
      weight: 0,
      sector:
        etfClass ?? STOCK_SECTOR[it.symbol] ?? gics[it.symbol] ?? UNMAPPED,
      assetClass:
        etfClass ??
        (ETF_TYPES.has(types[it.symbol] ?? '') ? 'ETF 기타' : STOCK),
      currency: it.currency,
      quantity: +it.quantity,
      averagePrice: +it.averagePurchasePrice,
      lastPrice: +it.lastPrice,
    }
    holdings.push(row)
    exposure[it.currency] += row.value

    // ETF 는 보유종목 비중대로 펼쳐서 각 섹터에 더한다. 못 펼치면 ETF 묶음 그대로
    const lookthrough = etfSectors[it.symbol]?.weights
    if (lookthrough)
      for (const [name, w] of Object.entries(lookthrough))
        addExposure(name, row.value * w, it.name, true)
    else addExposure(row.sector, row.value, it.name, row.assetClass !== STOCK)
  }

  const total = holdings.reduce((a, r) => a + r.value, 0)
  const daily = holdings.reduce((a, r) => a + r.daily, 0)
  for (const s of sectors.values()) s.weight = total ? s.value / total : 0
  for (const r of holdings) r.weight = total ? r.value / total : 0

  const cashKrw = cash.krw + cash.usd * fx
  const assets = total + cashKrw
  const classes = new Map<string, number>()
  for (const r of holdings)
    classes.set(r.assetClass, (classes.get(r.assetClass) ?? 0) + r.value)
  if (cashKrw) classes.set(CASH, cashKrw)

  // 토스 손익률은 매수 시점 환율 기준(환차 포함)이라, 현재 환율로 환산한 종목 손익 합과 다르다.
  // 원화 기준 손익 금액은 이 비율로 역산 (비율이 소수 4자리라 1억당 ±5천원 오차)
  const pnlRate = +h.profitLoss.rate
  return {
    total,
    assets,
    cash,
    exposure,
    assetClasses: [...classes]
      .map(([name, value]) => ({
        name,
        value,
        weight: assets ? value / assets : 0,
      }))
      .sort((a, b) => b.value - a.value),
    pnl: total ? total - total / (1 + pnlRate) : 0,
    pricePnl: holdings.reduce((a, r) => a + r.pnl, 0),
    pnlRate,
    daily,
    // 전일 평가액 대비. 토스 dailyProfitLoss.rate 와 같은 정의지만 실시간 반영을 위해 직접 계산
    dailyRate: total - daily ? daily / (total - daily) : 0,
    fx,
    holdings: holdings.sort((a, b) => b.value - a.value),
    sectors: [...sectors.values()].sort((a, b) => b.value - a.value),
    etfAsOf: Object.fromEntries(
      Object.entries(etfSectors).map(([symbol, e]) => [symbol, e.asOf]),
    ),
  }
}

/**
 * 실시간 체결가(거래통화, key `${market}:${symbol}`)를 holdings 응답에 반영한다.
 * 토스 총 손익률(환차 포함)은 매입 원화액이 그대로라는 가정으로 평가액 변화만큼 갱신
 */
export function applyPrices(
  h: TossHoldings,
  prices: Map<string, number>,
  fx: number,
): TossHoldings {
  if (!prices.size) return h
  let before = 0
  let after = 0
  const items = h.items.map((it) => {
    const k = it.currency === 'USD' ? fx : 1
    const value = +it.marketValue.amount
    const p = prices.get(`${it.marketCountry}:${it.symbol}`)
    before += value * k
    if (p === undefined) {
      after += value * k
      return it
    }
    const next = +it.quantity * p
    const pnl = +it.profitLoss.amount + next - value
    const daily = +it.dailyProfitLoss.amount + next - value
    const purchase = +it.marketValue.purchaseAmount
    after += next * k
    return {
      ...it,
      lastPrice: String(p),
      marketValue: { ...it.marketValue, amount: String(next) },
      profitLoss: {
        amount: String(pnl),
        rate: String(purchase ? pnl / purchase : 0),
      },
      dailyProfitLoss: {
        amount: String(daily),
        rate: String(next - daily ? daily / (next - daily) : 0),
      },
    }
  })
  const rate = +h.profitLoss.rate
  return {
    ...h,
    profitLoss: {
      rate: String(before ? (1 + rate) * (after / before) - 1 : rate),
    },
    items,
  }
}

const cashBalance = async () => {
  type R = { cashBuyingPower: string }
  const [krw, usd] = await Promise.all(
    (['KRW', 'USD'] as const).map((currency) =>
      get<R>('/api/v1/buying-power', { currency }, true),
    ),
  )
  return { krw: +krw!.cashBuyingPower, usd: +usd!.cashBuyingPower }
}

const securityTypes = (symbols: string[]) => {
  const key = [...symbols].sort().join(',')
  return cached(`types:${key}`, 86_400_000, async () => {
    if (!key) return {}
    type R = { symbol: string; securityType: string }[]
    const r = await get<R>('/api/v1/stocks', { symbols: key })
    return Object.fromEntries(r.map((s) => [s.symbol, s.securityType]))
  })
}

const warn =
  <T>(what: string, fallback: T) =>
  (e: unknown): T => {
    console.warn(`[분류] ${what} 실패:`, e instanceof Error ? e.message : e)
    return fallback
  }

let last: { h: TossHoldings; ctx: Context; at: number } | undefined

/** 마지막 REST 조회 결과 (실시간 반영의 기준점) */
export const lastFetch = () => last

export async function snapshot(): Promise<Snapshot> {
  const at = Date.now()
  const [h, fx, cash] = await Promise.all([
    get<TossHoldings>('/api/v1/holdings', {}, true),
    cached(
      'fx',
      60_000,
      async () =>
        +(
          await get<{ midRate: string }>('/api/v1/exchange-rate', {
            baseCurrency: 'USD',
            quoteCurrency: 'KRW',
          })
        ).midRate,
    ),
    cached('cash', 30_000, cashBalance),
  ])
  const types = await securityTypes(h.items.map((i) => i.symbol))
  const etfs = h.items
    .map((i) => i.symbol)
    .filter((s) => ETF_TYPES.has(types[s] ?? ''))
  // 분류 데이터(SSGA·SEC)는 실패해도 잔고는 보여준다 — 미분류/ETF 묶음으로 대신 표시
  const [gics, lookthrough] = await Promise.all([
    gicsMap().then((m) => m.byTicker, warn('GICS 분류', {})),
    Promise.all(
      etfs.map((s) => etfSectors(s).catch(warn(`${s} 보유종목`, null))),
    ),
  ])
  const etfSectorsMap = Object.fromEntries(
    etfs.flatMap((s, i) => (lookthrough[i] ? [[s, lookthrough[i]]] : [])),
  )
  last = { h, ctx: { fx, cash, types, gics, etfSectors: etfSectorsMap }, at }
  const s = { ...aggregate(h, last.ctx), at }
  // 기록이 실패해도 잔고는 보여준다
  try {
    record(s)
  } catch (e) {
    console.warn('[기록] 실패:', e instanceof Error ? e.message : e)
  }
  return s
}

/** 마지막 REST 조회 이후 들어온 체결가만 반영한 스냅샷 */
export function liveSnapshot(
  ticks: Map<string, { price: number; at: number }>,
): Snapshot | undefined {
  const base = last
  if (!base) return
  const fresh = new Map(
    [...ticks]
      .filter(([, t]) => t.at > base.at)
      .map(([key, t]) => [key, t.price]),
  )
  return {
    ...aggregate(applyPrices(base.h, fresh, base.ctx.fx), base.ctx),
    at: Date.now(),
  }
}
