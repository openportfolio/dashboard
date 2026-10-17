// SEC EDGAR: 미국 펀드의 N-PORT 공시(분기별 전체 보유종목)
// fair access: 연락처가 든 User-Agent 필수, 초당 10회 이하
import { config } from '../config.ts'
import { cached } from '../kit/cache.ts'
import { setting } from '../kit/settings.ts'
import { decodeXml } from '../kit/xlsx.ts'

const SEC = 'https://www.sec.gov'

/** server/.env 의 SEC_USER_AGENT, 없으면 화면에서 넣은 연락처 */
const userAgent = () => {
  const contact = setting<string>('contact')
  return (
    config.secUserAgent ||
    (contact ? `portfolio-dashboard ${contact}` : 'portfolio-dashboard')
  )
}

async function sec(pathOrUrl: string): Promise<string> {
  const r = await fetch(
    pathOrUrl.startsWith('http') ? pathOrUrl : SEC + pathOrUrl,
    {
      headers: { 'User-Agent': userAgent() },
      signal: AbortSignal.timeout(20_000),
    },
  )
  if (!r.ok) throw new Error(`SEC ${r.status} ${pathOrUrl}`)
  return r.text()
}

/** 펀드 티커 → SEC 시리즈 ID */
const seriesIds = () =>
  cached('sec-series', 7 * 86_400_000, async () => {
    const d = JSON.parse(await sec('/files/company_tickers_mf.json')) as {
      fields: string[]
      data: (string | number)[][]
    }
    const [sym, series] = [
      d.fields.indexOf('symbol'),
      d.fields.indexOf('seriesId'),
    ]
    return Object.fromEntries(
      d.data.map((r) => [String(r[sym!]), String(r[series!])]),
    )
  })

export interface FundHolding {
  name: string
  cusip: string
  /** 순자산 대비 % */
  pct: number
  /** EC = 보통주, DBT = 채권, STIV = 단기자금 ... */
  assetCat: string
  /** CORP, UST(미 국채) ... */
  issuerCat: string
}

/** 최신 N-PORT 의 전체 보유종목. 분기 공시라 2~4개월 전 구성이다. SEC 에 없는 펀드면 null */
export async function fundHoldings(
  symbol: string,
): Promise<{ asOf: string; holdings: FundHolding[] } | null> {
  const series = (await seriesIds())[symbol]
  if (!series) return null
  const atom = await sec(
    `/cgi-bin/browse-edgar?action=getcompany&CIK=${series}&type=NPORT-P&dateb=&owner=include&count=1&output=atom`,
  )
  const index = atom.match(/<filing-href>([^<]+)<\/filing-href>/)?.[1]
  if (!index) return null
  const xml = await sec(index.replace(/[^/]+$/, 'primary_doc.xml'))
  return {
    asOf: xml.match(/<repPdDate>([^<]+)<\/repPdDate>/)?.[1] ?? '',
    holdings: [...xml.matchAll(/<invstOrSec>([\s\S]*?)<\/invstOrSec>/g)].map(
      ([, s]) => {
        const f = (tag: string) =>
          s!.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1] ?? ''
        return {
          name: decodeXml(f('name')),
          cusip: f('cusip'),
          pct: +f('pctVal'),
          assetCat: f('assetCat'),
          issuerCat: f('issuerCat'),
        }
      },
    ),
  }
}
