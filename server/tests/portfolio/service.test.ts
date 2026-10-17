import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  aggregate,
  applyPrices,
  type Context,
  type TossHoldings,
} from '../../src/portfolio/service.ts'
import { UNMAPPED } from '../../src/sector/classification.ts'

const item = (
  symbol: string,
  marketCountry: 'KR' | 'US',
  quantity: string,
  value: string,
  purchase: string,
  pnl: string,
  daily: string,
) => ({
  symbol,
  name: symbol,
  marketCountry,
  currency: marketCountry === 'US' ? ('USD' as const) : ('KRW' as const),
  quantity,
  lastPrice: String(+value / +quantity),
  averagePurchasePrice: String(+purchase / +quantity),
  marketValue: { amount: value, purchaseAmount: purchase },
  profitLoss: { amount: pnl, rate: '0' },
  dailyProfitLoss: { amount: daily, rate: '0' },
})

// 000660 → 정보기술(STOCK_SECTOR 수동), NVDA·AMZN → ctx.gics(자동 분류)
const h: TossHoldings = {
  profitLoss: { rate: '0.1' },
  items: [
    item('000660', 'KR', '10', '1000000', '800000', '200000', '10000'),
    item('NVDA', 'US', '1', '100', '50', '50', '-10'),
    item('AMZN', 'US', '2', '300', '300', '0', '0'),
    item('069500', 'KR', '50', '500000', '500000', '0', '0'), // 분류표에 없는 ETF
  ],
}
const ctx: Context = {
  fx: 1000,
  cash: { krw: 0, usd: 0 },
  types: { '069500': 'ETF', QQQ: 'ETF', QQQM: 'ETF' },
  gics: { NVDA: '정보기술', AMZN: '경기소비재' },
  etfSectors: {},
}

test('KRW 환산 · GICS 섹터 합산 · 미분류 · 비율', () => {
  const d = aggregate(h, ctx)
  const s = Object.fromEntries(d.sectors.map((x) => [x.name, x]))

  assert.equal(d.total, 1_000_000 + 100_000 + 300_000 + 500_000)
  // 국내·미국 종목이 같은 GICS 섹터로 합쳐진다
  assert.equal(s['정보기술']!.value, 1_100_000)
  assert.deepEqual(s['정보기술']!.symbols, ['000660', 'NVDA'])
  assert.equal(s['정보기술']!.direct, 1_100_000)
  assert.equal(s['경기소비재']!.value, 300_000)
  assert.equal(s[UNMAPPED]!.value, 500_000)
  assert.equal(s[UNMAPPED]!.etf, 500_000) // 못 펼친 ETF 는 ETF 경유로 집계
  assert.equal(
    d.holdings.find((r) => r.symbol === '069500')!.assetClass,
    'ETF 기타',
  )
  assert.ok(Math.abs(d.sectors.reduce((a, x) => a + x.weight, 0) - 1) < 1e-9)
  assert.deepEqual(
    d.sectors.map((x) => x.name),
    ['정보기술', UNMAPPED, '경기소비재'],
  )
  assert.equal(d.pricePnl, 200_000 + 50_000) // 종목 손익 합 (현재 환율)
  assert.ok(Math.abs(d.pnl - (1_900_000 - 1_900_000 / 1.1)) < 1e-6) // 토스 손익률(0.1)로 역산
})

test('ETF 보유종목 펼침 · 자산군 · 현금 · 통화 노출', () => {
  const d = aggregate(
    {
      ...h,
      items: [
        ...h.items,
        item('QQQ', 'US', '1', '300', '300', '0', '0'),
        item('QQQM', 'US', '1', '200', '200', '0', '0'),
      ],
    },
    {
      ...ctx,
      cash: { krw: 400_000, usd: 100 },
      etfSectors: {
        QQQ: {
          asOf: '2026-06-30',
          weights: { 정보기술: 0.6, 경기소비재: 0.4 },
        },
      },
    },
  )
  const s = Object.fromEntries(d.sectors.map((x) => [x.name, x]))
  const cls = Object.fromEntries(d.assetClasses.map((c) => [c.name, c.value]))

  // QQQ 300k → 정보기술 180k + 경기소비재 120k. QQQM 은 비중이 없어 묶음 그대로
  assert.equal(s['정보기술']!.value, 1_100_000 + 180_000)
  assert.equal(s['정보기술']!.direct, 1_100_000)
  assert.equal(s['정보기술']!.etf, 180_000)
  assert.deepEqual(s['정보기술']!.etfs, ['QQQ'])
  assert.equal(s['경기소비재']!.value, 300_000 + 120_000)
  assert.equal(s['나스닥100 ETF']!.value, 200_000)
  assert.deepEqual(d.etfAsOf, { QQQ: '2026-06-30' })
  assert.ok(Math.abs(d.sectors.reduce((a, x) => a + x.weight, 0) - 1) < 1e-9)

  // 자산군·포트폴리오 맵용 묶음은 그대로
  assert.equal(cls['나스닥100 ETF'], 500_000)
  assert.equal(cls['ETF 기타'], 500_000)
  assert.equal(cls['개별주식'], 1_400_000)
  assert.equal(cls['현금'], 400_000 + 100_000)
  assert.equal(d.assets, d.total + 500_000)
  assert.deepEqual(d.exposure, {
    KRW: 1_500_000 + 400_000,
    USD: 900_000 + 100_000,
  })
})

test('실시간 체결가 반영', () => {
  // NVDA 100 → 110 USD (1주), fx 1000
  const live = applyPrices(h, new Map([['US:NVDA', 110]]), 1000)
  const nvda = live.items.find((i) => i.symbol === 'NVDA')!
  assert.equal(+nvda.marketValue.amount, 110)
  assert.equal(+nvda.profitLoss.amount, 60)
  assert.equal(+nvda.dailyProfitLoss.amount, 0) // -10 + 10
  assert.equal(+nvda.profitLoss.rate, 60 / 50)
  assert.equal(live.items[0], h.items[0]) // 다른 종목은 그대로
  // 원화 매입액(1_900_000 / 1.1)은 고정 → 평가액 1_910_000 기준 손익률
  assert.ok(
    Math.abs(+live.profitLoss.rate - (1.1 * 1_910_000) / 1_900_000 + 1) < 1e-12,
  )
  // 일간 수익률은 전일 평가액(1_910_000 - 10_000) 대비
  assert.ok(
    Math.abs(aggregate(live, ctx).dailyRate - 10_000 / 1_900_000) < 1e-12,
  )
  assert.equal(applyPrices(h, new Map(), 1000), h) // 가격 없으면 그대로
})

test('보유 종목 없음', () => {
  const d = aggregate({ ...h, items: [] }, ctx)
  assert.equal(d.total, 0)
  assert.equal(d.dailyRate, 0)
})
