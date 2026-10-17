import type { Duration, SectorPerformance } from '@portfolio/client'
import { createMemo, createSignal, For, Index, Show } from 'solid-js'
import { DUR_LABEL, DURS, pct, share } from '../lib/ui'
import { remember, remembered, Skeleton } from './Skeleton'
import './SectorHeatmap.css'

type Key = 'weight' | Duration

/** GICS 11개 섹터 × 기간별 등락률. 기본은 내 노출 큰 순, 열 제목을 누르면 그 기간 순 */
export function SectorHeatmap(props: {
  perf: SectorPerformance[]
  exposure: Map<string, number>
}) {
  const [sort, setSort] = createSignal<{ key: Key; desc: boolean }>({
    key: 'weight',
    desc: true,
  })
  const mine = (name: string) => props.exposure.get(name) ?? 0
  const rows = createMemo(() => {
    const { key, desc } = sort()
    const get = (p: SectorPerformance) =>
      key === 'weight' ? mine(p.name) : (p.rates[key] ?? -Infinity)
    return [...props.perf].sort((a, b) =>
      desc ? get(b) - get(a) : get(a) - get(b),
    )
  })
  const toggle = (key: Key) =>
    setSort((s) => ({ key, desc: s.key === key ? !s.desc : true }))

  // 기간마다 스케일이 크게 다르므로 열 단위로 정규화
  const max = createMemo(
    () =>
      Object.fromEntries(
        DURS.map((k) => [
          k,
          Math.max(0.01, ...props.perf.map((r) => Math.abs(r.rates[k] ?? 0))),
        ]),
      ) as Record<Duration, number>,
  )
  const fill = (v: number | null, k: Duration) => {
    const p =
      v === null ? 0 : Math.round(Math.min(1, Math.abs(v) / max()[k]) * 75) // 75% 상한: 글자 대비 유지
    return `color-mix(in oklab, var(--${(v ?? 0) >= 0 ? 'up' : 'down'}) ${p}%, var(--mid))`
  }
  const th = (key: Key, label: string) => (
    <th
      class="n"
      aria-sort={
        sort().key === key
          ? sort().desc
            ? 'descending'
            : 'ascending'
          : undefined
      }
    >
      <button class="th-sort" onClick={() => toggle(key)}>
        {label}
        {sort().key === key && (sort().desc ? ' ↓' : ' ↑')}
      </button>
    </th>
  )

  return (
    <section class="card">
      <h2>섹터 등락률</h2>
      <p class="sub">
        S&P 500 섹터 ETF 가격 기준 (배당 제외). 색은 같은 기간 안에서의 상대
        크기입니다.
      </p>
      <Show
        when={props.perf.length}
        fallback={<Skeleton height={remembered('heat', 440)} />}
      >
        <div class="table-scroll" ref={remember('heat')}>
          <table class="heat">
            <thead>
              <tr>
                <th>섹터</th>
                {th('weight', '내 비중')}
                <For each={DURS}>{(k) => th(k, DUR_LABEL[k])}</For>
              </tr>
            </thead>
            <tbody>
              <Index each={rows()}>
                {(r) => (
                  <tr>
                    <td classList={{ muted: mine(r().name) < 0.01 }}>
                      {r().name}
                      <span class="names"> · {r().symbol}</span>
                    </td>
                    <td class="n">
                      {mine(r().name) >= 0.01 ? share(mine(r().name)) : '–'}
                    </td>
                    <For each={DURS}>
                      {(k) => {
                        const v = () => r().rates[k]
                        return (
                          <td
                            class="c"
                            tabindex="0"
                            style={{ background: fill(v(), k) }}
                            data-v={pct(v())}
                            data-tip={`${r().name} (${r().symbol}) · ${DUR_LABEL[k]}`}
                          >
                            {pct(v())}
                          </td>
                        )
                      }}
                    </For>
                  </tr>
                )}
              </Index>
            </tbody>
          </table>
        </div>
      </Show>
    </section>
  )
}
