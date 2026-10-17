import type { PricePoint, Strategy } from '@portfolio/client'
import {
  createMemo,
  createResource,
  createSignal,
  For,
  Index,
  Show,
} from 'solid-js'
import {
  backtest,
  type BacktestResult,
  PROXIES,
  splice,
  WITHHOLDING,
  YEAR,
} from '../lib/backtest'
import {
  benchmarks,
  compared,
  strategies,
  strategyColor,
  toggleBenchmark,
  toggleCompare,
} from '../lib/strategies'
import { load } from '../lib/load'
import { BENCHMARKS, stageWeights, targets } from '../lib/strategy'
import { pct, usd, won, ymd } from '../lib/ui'
import { LineChart } from './LineChart'
import { remember, remembered, Skeleton } from './Skeleton'
import './Backtest.css'

/** 21.12.27 (일봉 t 의 UTC 날짜가 곧 거래일) */
const short = (t: number) =>
  new Date(t).toISOString().slice(2, 10).replaceAll('-', '.')
/** 원/달러 일봉 (Yahoo) — 원화 기준 백테스트용 */
const FX = 'KRW=X'
const PERIODS = [
  { key: '1y', label: '1년', years: 1 },
  { key: '3y', label: '3년', years: 3 },
  { key: '5y', label: '5년', years: 5 },
  { key: '10y', label: '10년', years: 10 },
  { key: 'max', label: '전체', years: 0 },
]

/** 고른 전략들을 같은 기간 · 같은 조건으로 돌려 비교한다 */
export function Backtest() {
  // 비교 대상: 체크한 전략 + 벤치마크 (지수 하나를 첫 전략과 같은 금액으로 매일 샀을 때)
  const lineup = createMemo(() => {
    const own = compared().map((s) => ({ s, color: strategyColor(s.id) }))
    const daily = own[0]?.s.daily ?? 100
    const bench = (b: (typeof BENCHMARKS)[number]): Strategy => ({
      id: `bench:${b.symbol}`,
      name: `${b.symbol} (${b.label})`,
      daily,
      assets: [{ symbol: b.symbol, weight: 100, role: 'hold' }],
    })
    return [
      ...own,
      ...benchmarks().map((b) => ({ s: bench(b), color: b.color })),
    ]
  })
  const [period, setPeriod] = createSignal('max')
  const [divs, setDivs] = createSignal(true)
  const [krw, setKrw] = createSignal(false)
  const [log, setLog] = createSignal(false)
  const [proxy, setProxy] = createSignal(true)

  // 고른 전략의 종목 + 하락장 기준 종목 (+ 상장 전을 채울 종목, 원화면 환율)
  const symbols = () => {
    const own = lineup().flatMap(({ s }) => [
      ...s.assets.map((a) => a.symbol),
      ...(s.bear ? [s.bear.market] : []),
    ])
    return [
      ...new Set([
        ...own,
        ...(proxy()
          ? own.flatMap((x) => (PROXIES[x] ? [PROXIES[x]] : []))
          : []),
        ...(krw() ? [FX] : []),
      ]),
    ]
      .sort()
      .join(',')
  }
  // 없는 종목(오타 등)이 있어도 나머지는 돌린다. 배당을 못 받은 종목은 배당 없이 계산
  const [prices] = createResource(symbols, async (key) => {
    const syms = key ? key.split(',') : []
    const [px, dv] = await Promise.all([
      Promise.allSettled(syms.map((s) => load('/api/candles', s))),
      // 환율엔 배당이 없다
      Promise.allSettled(
        syms.map((s) =>
          s === FX ? Promise.resolve({}) : load('/api/dividends', s),
        ),
      ),
    ])
    const ok: Record<string, PricePoint[]> = {}
    const dividends: Record<string, Record<string, number>> = {}
    const failed: string[] = []
    const noDividends: string[] = []
    syms.forEach((s, i) => {
      const r = px[i]!
      const d = dv[i]!
      if (r.status === 'fulfilled' && r.value.length) ok[s] = r.value
      else failed.push(s)
      if (d.status === 'fulfilled') dividends[s] = d.value
      else noDividends.push(s)
    })
    return { ok, failed, dividends, noDividends }
  })
  // 상장 전 구간을 같은 지수 종목으로 이은 가격 · 배당 (이어 붙인 종목 목록도)
  const data = createMemo(() => {
    const got = prices.latest
    if (!got) return
    const p = { ...got.ok }
    const dividends = { ...got.dividends }
    const spliced: string[] = []
    if (proxy())
      for (const [sym, old] of Object.entries(PROXIES)) {
        if (!p[sym] || !p[old]) continue
        const s = splice(
          { points: p[sym], dividends: dividends[sym] },
          { points: p[old], dividends: dividends[old] },
        )
        if (s.points === p[sym]) continue
        p[sym] = s.points
        dividends[sym] = s.dividends ?? {}
        spliced.push(`${sym}←${old}`)
      }
    return { p, dividends, spliced }
  })

  const runs = createMemo(() => {
    const p = data()?.p
    if (!p) return []
    const fx = krw() ? p[FX] : undefined
    const years = PERIODS.find((x) => x.key === period())!.years
    const ready = lineup().filter(({ s }) =>
      s.assets.every((a) => !a.weight || p[a.symbol]),
    )
    // 모두 같은 날 시작하도록, 고른 전략 종목 중 가장 늦게 상장한 종목 이후부터
    const from = Math.max(
      years ? Date.now() - years * YEAR : 0,
      ...ready.flatMap(({ s }) =>
        s.assets.filter((a) => a.weight).map((a) => p[a.symbol]![0]!.t),
      ),
    )
    return ready.flatMap(({ s, color }) => {
      const market = s.bear && p[s.bear.market]
      const r = backtest(p, targets(s), {
        daily: s.daily,
        from,
        bear: market
          ? {
              market,
              steps: s.bear!.steps,
              weightsAt: (stage) => stageWeights(s, stage),
            }
          : undefined,
        dividends: divs() ? data()!.dividends : undefined,
        fx,
      })
      return r ? [{ s, r, color }] : []
    })
  })
  const main = () => runs()[0]
  const money = (v: number) =>
    krw() && data()?.p[FX]
      ? won.format(Math.round(v)) + '원'
      : usd(Math.round(v))
  /** 누적 수익률 → 성장 배수 (로그 눈금은 양수만 그린다) */
  const growth = (r: BacktestResult) =>
    r.twr.map((p) => ({ t: p.t, v: 1 + p.v }))
  const anyBear = () => runs().some((x) => x.s.bear)

  const metrics: {
    label: string
    get: (r: BacktestResult) => string
    note?: (r: BacktestResult) => string
    /** 하락장 룰이 있는 전략만 */
    bear?: boolean
  }[] = [
    { label: '총 투자금', get: (r) => money(r.invested) },
    { label: '최종 평가액', get: (r) => money(r.final) },
    { label: '수익률', get: (r) => pct(r.final / r.invested - 1) },
    { label: '연환산', get: (r) => pct(r.cagr) },
    {
      label: 'MDD',
      get: (r) => pct(r.mdd.rate),
      note: (r) => `${short(r.mdd.peak)} → ${short(r.mdd.trough)}`,
    },
    {
      label: '하락장 2·3단계',
      get: (r) => `${r.stageDays[1] ?? 0} · ${r.stageDays[2] ?? 0}일`,
      bear: true,
    },
  ]
  const shown = () => metrics.filter((m) => !m.bear || anyBear())

  return (
    <section class="card bt-card">
      <div class="filters">
        <div class="segmented" role="group" aria-label="백테스트 기간">
          <For each={PERIODS}>
            {(p) => (
              <button
                aria-pressed={period() === p.key}
                onClick={() => setPeriod(p.key)}
              >
                {p.label}
              </button>
            )}
          </For>
        </div>
        <div class="segmented" role="group" aria-label="통화">
          <button aria-pressed={!krw()} onClick={() => setKrw(false)}>
            달러
          </button>
          <button aria-pressed={krw()} onClick={() => setKrw(true)}>
            원화
          </button>
        </div>
        <label class="muted">
          <input
            type="checkbox"
            checked={divs()}
            onChange={(e) => setDivs(e.currentTarget.checked)}
          />
          배당 재투자
        </label>
        <label class="muted" title="QQQM←QQQ · SGOV←BIL · VOO←SPY">
          <input
            type="checkbox"
            checked={proxy()}
            onChange={(e) => setProxy(e.currentTarget.checked)}
          />
          상장 전은 같은 지수 종목으로
        </label>
        <label class="muted">
          <input
            type="checkbox"
            checked={log()}
            onChange={(e) => setLog(e.currentTarget.checked)}
          />
          로그 눈금
        </label>
      </div>
      {/* 비교할 전략 · 벤치마크. 체크박스를 차트 선 색으로 칠해 범례를 겸한다. 편집은 머리글 '편집' */}
      <Show when={strategies().length}>
        <div class="filters" role="group" aria-label="비교할 전략">
          <For each={strategies()}>
            {(s) => (
              <label>
                <input
                  type="checkbox"
                  style={{ 'accent-color': strategyColor(s.id) }}
                  checked={compared().some((x) => x.id === s.id)}
                  onChange={() => toggleCompare(s.id)}
                />
                {s.name}
              </label>
            )}
          </For>
        </div>
      </Show>
      <div class="filters" role="group" aria-label="벤치마크">
        <span class="muted">벤치마크</span>
        <For each={BENCHMARKS}>
          {(b) => (
            <label>
              <input
                type="checkbox"
                style={{ 'accent-color': b.color }}
                checked={benchmarks().some((x) => x.symbol === b.symbol)}
                onChange={() => toggleBenchmark(b.symbol)}
              />
              {b.symbol} ({b.label})
            </label>
          )}
        </For>
      </div>
      <Show when={prices.latest?.failed.length}>
        <p class="err">
          가격을 못 받은 종목 (이 종목이 든 전략은 빠짐):{' '}
          {prices.latest!.failed.join(', ')}
        </p>
      </Show>
      <Show
        when={main()}
        fallback={
          prices.loading ? (
            <>
              <Skeleton height={260} />
              <div
                class="skeleton-body"
                style={{ height: `${remembered('bt-body', 340)}px` }}
              >
                <p class="names">
                  가격 데이터 받는 중… 처음엔 수십 초 걸릴 수 있습니다
                </p>
                <div class="skeleton" />
              </div>
            </>
          ) : (
            <p class="muted">비교할 전략이나 벤치마크를 고르세요.</p>
          )
        }
      >
        {(m) => (
          <>
            <LineChart
              points={growth(m().r)}
              compare={runs()
                .slice(1)
                .map((x) => ({
                  points: growth(x.r),
                  label: x.s.name,
                  color: x.color,
                }))}
              height={260}
              axis
              log={log()}
              label="전략별 시간가중 누적 수익률"
              color={m().color}
              format={(v) => pct(v - 1)}
              time={ymd}
            />
            {/* 표 + 각주 높이를 기억해 스켈레톤과 맞춘다 */}
            <div class="bt-body" ref={remember('bt-body')}>
              <div class="table-scroll">
                <table class="bt">
                  <thead>
                    <tr>
                      <th>전략</th>
                      <Index each={shown()}>
                        {(x) => <th class="n">{x().label}</th>}
                      </Index>
                    </tr>
                  </thead>
                  <tbody>
                    <Index each={runs()}>
                      {(row) => (
                        <tr>
                          <td>
                            <i class="sw" style={{ background: row().color }} />
                            {row().s.name}
                          </td>
                          <Index each={shown()}>
                            {(x) => (
                              <td class="n">
                                <Show
                                  when={!x().bear || row().s.bear}
                                  fallback="–"
                                >
                                  {x().get(row().r)}
                                  <Show when={x().note}>
                                    <div class="names">
                                      {x().note!(row().r)}
                                    </div>
                                  </Show>
                                </Show>
                              </td>
                            )}
                          </Index>
                        </tr>
                      )}
                    </Index>
                  </tbody>
                </table>
              </div>
              <p class="names">
                {ymd(m().r.twr[0]!.t)} 부터 {m().r.twr.length}거래일 (고른 전략
                종목 중 가장 늦게 상장한 날부터). 매 거래일 전략의 매일 매수액을
                비율대로 소수점 매수하고 하락장 룰을 적용했습니다. 수익률은
                투자금 대비, 연환산·MDD 는 입금 효과를 뺀 시간가중입니다. 배당은
                Yahoo Finance 배당락일 종가에 원천징수 {WITHHOLDING * 100}% 뒤
                재투자
                <Show when={divs() && prices.latest?.noDividends.length}>
                  {' '}
                  (배당을 못 받아 빼고 계산:{' '}
                  {prices.latest!.noDividends.join(', ')})
                </Show>
                .
                <Show when={data()?.spliced.length}>
                  {' '}
                  상장 전은 같은 지수 종목 가격을 상장일 비율로 이어 붙였습니다
                  ({data()!.spliced.join(' · ')}).
                </Show>{' '}
                {krw() && data()?.p[FX]
                  ? `원화 기준: 매일 매수액을 그날 원/달러 환율(Yahoo ${FX})로 환산.`
                  : '달러 기준 (환율 제외).'}{' '}
                수수료·양도세 제외.
              </p>
            </div>
          </>
        )}
      </Show>
    </section>
  )
}
