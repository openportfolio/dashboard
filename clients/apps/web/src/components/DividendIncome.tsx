import type { Market, Snapshot } from '@portfolio/client'
import { createMemo, createResource, Index, Show } from 'solid-js'
import { frequency, income } from '../lib/income'
import { load } from '../lib/load'
import { money, share, won } from '../lib/ui'
import { remember, SkeletonCard } from './Skeleton'
import './DividendIncome.css'

/** 국내 종목은 Yahoo 에서 .KS(코스피), 없으면 .KQ(코스닥) */
const dividendsOf = (symbol: string, market: Market) =>
  market === 'US'
    ? load('/api/dividends', symbol)
    : load('/api/dividends', `${symbol}.KS`).catch(() =>
        load('/api/dividends', `${symbol}.KQ`),
      )

/** 2026-09-23 → 26.09.23 */
const short = (d: string) => d.slice(2).replaceAll('-', '.')

/** 보유 종목의 예상 배당 (최근 12개월 기준, 세후 원화) */
export function DividendIncome(props: { snap?: Snapshot }) {
  // 보유 종목이 바뀔 때만 다시 받는다 (스냅샷은 1초마다 새 객체)
  const key = () =>
    props.snap?.holdings
      .map((h) => `${h.market}:${h.symbol}`)
      .sort()
      .join(',')
  const [data] = createResource(key, async (k) => {
    const list = k.split(',').map((x) => x.split(':') as [Market, string])
    const got = await Promise.allSettled(
      list.map(([m, s]) => dividendsOf(s, m)),
    )
    const dividends: Record<string, Record<string, number>> = {}
    const failed: string[] = []
    list.forEach(([, s], i) => {
      const r = got[i]!
      if (r.status === 'fulfilled') dividends[s] = r.value
      else failed.push(s)
    })
    return { dividends, failed }
  })
  const r = createMemo(() => {
    const s = props.snap
    const d = data.latest
    return s && d && income(s.holdings, d.dividends, s.fx)
  })

  return (
    <Show when={r()} fallback={<SkeletonCard id="dividends" height={480} />}>
      {(x) => {
        const max = () => Math.max(1, ...x().months)
        return (
          <section class="card" ref={remember('dividends')}>
            <h2>배당</h2>
            <p class="sub">
              최근 12개월 배당이 그대로 나온다고 보고 지금 보유 수량으로 셈한
              세후 금액 (원천징수 미국 15% · 국내 15.4%).
            </p>
            <div class="div-sum">
              <div>
                <div class="label">한 해 배당</div>
                <b>{won.format(x().total)}원</b>
              </div>
              <div>
                <div class="label">한 달 평균</div>
                <b>{won.format(x().total / 12)}원</b>
              </div>
              <div>
                <div class="label">주식 평가액 대비</div>
                <b>{share(x().total / props.snap!.total)}</b>
              </div>
            </div>
            <div
              class="div-months"
              role="img"
              aria-label="배당락 달별 세후 배당"
            >
              <Index each={x().months}>
                {(v, i) => (
                  <div
                    class="div-month"
                    tabindex="0"
                    data-v={`${won.format(v())}원`}
                    data-tip={`${i + 1}월 배당락분`}
                  >
                    <div class="div-bar">
                      <div style={{ height: `${(v() / max()) * 100}%` }} />
                    </div>
                    <span>{i + 1}</span>
                  </div>
                )}
              </Index>
            </div>
            <div class="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>종목</th>
                    <th>주기</th>
                    <th class="n">최근 배당락</th>
                    <th class="n">주당 · 12개월</th>
                    <th class="n">한 해 배당</th>
                    <th class="n">배당률</th>
                  </tr>
                </thead>
                <tbody>
                  <Index each={x().rows}>
                    {(row) => (
                      <tr>
                        <td>{row().holding.name}</td>
                        <td class="names">{frequency(row().count)}</td>
                        <td class="n">{short(row().last)}</td>
                        <td class="n">
                          {money(row().perShare, row().holding.currency)}
                        </td>
                        <td class="n">{won.format(row().annual)}원</td>
                        <td class="n">{share(row().yield)}</td>
                      </tr>
                    )}
                  </Index>
                </tbody>
              </table>
            </div>
            <p class="names">
              배당락 달 기준 (실제 지급은 보통 며칠~몇 주 뒤). Yahoo Finance
              배당 이력.
              <Show when={x().none.length}>
                {' '}
                배당 없음:{' '}
                {x()
                  .none.map((h) => h.name)
                  .join(', ')}
                .
              </Show>
              <Show when={data.latest?.failed.length}>
                {' '}
                못 받음: {data.latest!.failed.join(', ')}.
              </Show>
            </p>
          </section>
        )
      }}
    </Show>
  )
}
