import type { Holding } from '@portfolio/client'
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Index,
  on,
  Show,
} from 'solid-js'
import { dir, money, pct, qty, share, sWon, won } from '../lib/ui'
import { remember } from './Skeleton'
import './HoldingsTable.css'

type Col = {
  key: string
  label: string
  num?: boolean
  /** 정렬 기준값 */
  sort?: (h: Holding) => number | string
}
const COLS: Col[] = [
  { key: 'name', label: '종목', sort: (h) => h.name },
  { key: 'sector', label: '섹터', sort: (h) => h.sector },
  { key: 'quantity', label: '수량', num: true },
  { key: 'averagePrice', label: '평균 단가', num: true },
  { key: 'lastPrice', label: '현재가', num: true },
  { key: 'value', label: '평가금액', num: true, sort: (h) => h.value },
  { key: 'weight', label: '비중', num: true, sort: (h) => h.weight },
  { key: 'rate', label: '수익률', num: true, sort: (h) => h.rate },
  { key: 'dailyRate', label: '오늘', num: true, sort: (h) => h.dailyRate },
]

// 체결로 값이 바뀌면 칸을 잠깐 상승/하락 색으로
const flash = (el: HTMLElement, up: boolean) =>
  el.animate(
    [
      {
        background: `color-mix(in oklab, var(--${up ? 'up' : 'down'}) 30%, transparent)`,
      },
      { background: 'transparent' },
    ],
    { duration: 900, easing: 'ease-out' },
  )

export function HoldingsTable(props: {
  holdings: Holding[]
  onSelect: (symbol: string) => void
}) {
  const [sort, setSort] = createSignal<{ key: string; desc: boolean }>({
    key: 'value',
    desc: true,
  })
  const rows = createMemo(() => {
    const { key, desc } = sort()
    const get = COLS.find((c) => c.key === key)?.sort ?? ((h) => h.value)
    return [...props.holdings].sort((a, b) => {
      const [x, y] = [get(a), get(b)]
      const c =
        typeof x === 'string'
          ? x.localeCompare(String(y), 'ko')
          : x - (y as number)
      return desc ? -c : c
    })
  })
  const toggle = (key: string) =>
    setSort((s) => ({
      key,
      desc: s.key === key ? !s.desc : key !== 'name' && key !== 'sector',
    }))

  return (
    <section class="card" ref={remember('holdings')}>
      <h2>보유 종목</h2>
      <div class="table-scroll">
        <table class="holdings">
          <thead>
            <tr>
              <For each={COLS}>
                {(c) => (
                  <th
                    class={c.num ? 'n' : ''}
                    aria-sort={
                      sort().key === c.key
                        ? sort().desc
                          ? 'descending'
                          : 'ascending'
                        : undefined
                    }
                  >
                    {c.sort ? (
                      <button class="th-sort" onClick={() => toggle(c.key)}>
                        {c.label}
                        {sort().key === c.key && (sort().desc ? ' ↓' : ' ↑')}
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                )}
              </For>
            </tr>
          </thead>
          <tbody>
            <Index each={rows()}>
              {(r) => {
                let priceCell: HTMLTableCellElement | undefined
                // 같은 행에 같은 종목인데 현재가가 바뀌었을 때만 깜빡인다 (정렬로 행이 바뀐 경우 제외)
                createEffect(
                  on(
                    () => [r().symbol, r().lastPrice] as const,
                    (cur, prev) => {
                      if (
                        prev &&
                        prev[0] === cur[0] &&
                        prev[1] !== cur[1] &&
                        priceCell
                      )
                        flash(priceCell, cur[1] > prev[1])
                    },
                  ),
                )
                return (
                  <tr
                    class="clickable"
                    tabindex="0"
                    onClick={() => props.onSelect(r().symbol)}
                    onKeyDown={(e) =>
                      e.key === 'Enter' && props.onSelect(r().symbol)
                    }
                  >
                    <td>
                      {r().name}
                      <Show when={r().name !== r().symbol}>
                        <div class="names">{r().symbol}</div>
                      </Show>
                    </td>
                    <td class="names">{r().sector}</td>
                    <td class="n">{qty(r().quantity)}</td>
                    <td class="n">{money(r().averagePrice, r().currency)}</td>
                    <td class="n" ref={(e) => (priceCell = e)}>
                      {money(r().lastPrice, r().currency)}
                    </td>
                    <td class="n">{won.format(r().value)}</td>
                    <td class="n">{share(r().weight)}</td>
                    <td class={`n ${dir(r().rate)}`}>
                      {pct(r().rate)}
                      <div class="names">{sWon(r().pnl)}</div>
                    </td>
                    <td class={`n ${dir(r().dailyRate)}`}>
                      {pct(r().dailyRate)}
                      <div class="names">{sWon(r().daily)}</div>
                    </td>
                  </tr>
                )
              }}
            </Index>
          </tbody>
        </table>
      </div>
    </section>
  )
}
