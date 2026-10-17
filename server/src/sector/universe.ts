import { type FundHolding, fundHoldings } from '../integrations/edgar.ts'
import { type SsgaHolding, ssgaHoldings } from '../integrations/ssga.ts'
import { cached } from '../kit/cache.ts'
import { GICS, GICS_EN, UNMAPPED } from './classification.ts'

const DAY = 86_400_000
export const CASH_LIKE = '단기국채·현금성'
const OTHER_ASSET = '기타 자산'

interface GicsMap {
  byTicker: Record<string, string>
  byCusip: Record<string, string>
}

/**
 * 종목 → GICS 섹터. S&P 500 은 섹터 SPDR 11종(펀드 = 섹터), S&P 중형 400 은 MDY 의 Sector 열.
 * 하루 1회 받는다. 소형주·해외 종목은 출처가 없어 미분류 (SPSM 파일은 Sector 가 비어 있음)
 */
export const gicsMap = () =>
  cached('gics-map', DAY, async (): Promise<GicsMap> => {
    const [mid, ...large] = await Promise.all([
      ssgaHoldings('MDY'),
      ...Object.values(GICS).map((etf) => ssgaHoldings(etf)),
    ])
    const m: GicsMap = { byTicker: {}, byCusip: {} }
    const add = (h: SsgaHolding, sector: string) => {
      m.byTicker[h.ticker] = sector
      if (h.cusip) m.byCusip[h.cusip] = sector
    }
    Object.keys(GICS).forEach((sector, i) =>
      large[i]!.forEach((h) => add(h, sector)),
    )
    for (const h of mid!) if (GICS_EN[h.sector]) add(h, GICS_EN[h.sector]!)
    return m
  })

/** 순수 함수: 펀드 보유종목 → 섹터별 비중(합 1). 주식은 GICS, 국채·단기자금은 현금성 */
export function sectorWeights(
  holdings: FundHolding[],
  byCusip: Record<string, string>,
): Record<string, number> {
  const w: Record<string, number> = {}
  let total = 0
  for (const h of holdings) {
    if (!(h.pct > 0)) continue
    const key =
      h.assetCat === 'EC'
        ? (byCusip[h.cusip] ?? UNMAPPED)
        : h.issuerCat === 'UST' || h.assetCat === 'STIV'
          ? CASH_LIKE
          : OTHER_ASSET
    w[key] = (w[key] ?? 0) + h.pct
    total += h.pct
  }
  for (const k in w) w[k]! /= total
  return w
}

/** ETF → 섹터 비중 (최신 N-PORT 기준). 미국 공시가 없는 ETF 면 null */
export const etfSectors = (symbol: string) =>
  cached(`etf-sectors:${symbol}`, DAY, async () => {
    const fund = await fundHoldings(symbol)
    if (!fund?.holdings.length) return null
    return {
      asOf: fund.asOf,
      weights: sectorWeights(fund.holdings, (await gicsMap()).byCusip),
    }
  })
