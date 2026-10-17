import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { FundHolding } from '../../src/integrations/edgar.ts'
import { UNMAPPED } from '../../src/sector/classification.ts'
import { CASH_LIKE, sectorWeights } from '../../src/sector/universe.ts'

const h = (
  cusip: string,
  pct: number,
  assetCat = 'EC',
  issuerCat = 'CORP',
): FundHolding => ({
  name: cusip,
  cusip,
  pct,
  assetCat,
  issuerCat,
})

test('펀드 보유종목 → 섹터 비중 (CUSIP 매칭 · 국채/단기자금 · 미분류 · 정규화)', () => {
  const w = sectorWeights(
    [
      h('AAPL', 40),
      h('XOM', 20),
      h('ASML', 10), // 표에 없는 주식
      h('TBILL', 20, 'DBT', 'UST'),
      h('MMF', 10, 'STIV', 'RF'),
      h('SHORT', -1), // 음수·0 은 제외
    ],
    { AAPL: '정보기술', XOM: '에너지' },
  )
  assert.deepEqual(w, {
    정보기술: 0.4,
    에너지: 0.2,
    [UNMAPPED]: 0.1,
    [CASH_LIKE]: 0.3,
  })
})

test('비중 합이 100% 가 아니어도 1 로 맞춘다', () => {
  const w = sectorWeights([h('A', 30), h('B', 30)], { A: '금융', B: '금융' })
  assert.deepEqual(w, { 금융: 1 })
})
