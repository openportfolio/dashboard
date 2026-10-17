// SSGA(SPDR) ETF 일일 보유종목 xlsx
import { readXlsx } from '../kit/xlsx.ts'

export interface SsgaHolding {
  ticker: string
  cusip: string
  /** GICS 섹터(영문). 펀드에 따라 비어 있다 (섹터 SPDR·SPY 는 비어 있고 MDY 는 채워져 있음) */
  sector: string
}

export async function ssgaHoldings(etf: string): Promise<SsgaHolding[]> {
  const url = `https://www.ssga.com/us/en/intermediary/library-content/products/fund-data/etfs/us/holdings-daily-us-en-${etf.toLowerCase()}.xlsx`
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!r.ok) throw new Error(`SSGA ${etf} 보유종목 ${r.status}`)
  const rows = readXlsx(Buffer.from(await r.arrayBuffer()))
  // 표 앞뒤에 펀드 정보·안내문 행이 있어 헤더 행을 찾아 그 아래만 읽는다
  const h = rows.findIndex(
    (row) => row.includes('Ticker') && row.includes('Identifier'),
  )
  if (h < 0) throw new Error(`SSGA ${etf} 보유종목 파일 형식이 바뀌었습니다`)
  const [t, c, s] = ['Ticker', 'Identifier', 'Sector'].map((k) =>
    rows[h]!.indexOf(k),
  )
  return rows
    .slice(h + 1)
    .filter((row) => /^[A-Z][A-Z0-9.-]*$/.test(row[t!] ?? ''))
    .map((row) => ({
      ticker: row[t!]!,
      cusip: row[c!] ?? '',
      sector: s! >= 0 ? (row[s!] ?? '') : '',
    }))
}
