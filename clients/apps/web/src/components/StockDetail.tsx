import { api, type ChartRange, type Holding } from '@portfolio/client'
import {
  createMemo,
  createResource,
  createSignal,
  For,
  Index,
  onCleanup,
  onMount,
  Show,
} from 'solid-js'
import { dir, hhmm, money, pct, qty, share, sWon, won, ymd } from '../lib/ui'
import { LineChart } from './LineChart'
import './StockDetail.css'

const RANGES: { key: ChartRange; label: string }[] = [
  { key: '1d', label: '당일' },
  { key: '1y', label: '1년' },
]

/** 오른쪽 드로어. Esc·바깥 클릭으로 닫히고, 닫히면 열기 전 포커스로 돌아간다 */
export function StockDetail(props: { holding: Holding; onClose: () => void }) {
  const [range, setRange] = createSignal<ChartRange>('1d')
  // 종목·기간이 바뀔 때만 다시 받는다 (holding 은 1초마다 새 객체)
  const [data] = createResource(
    () => `${props.holding.symbol}|${range()}`,
    (key) => {
      const [symbol, r] = key.split('|') as [string, ChartRange]
      return api('/api/candles', { symbol, range: r })
    },
  )
  // 당일 차트는 실시간 현재가로 마지막 점을 갱신
  const points = createMemo(() => {
    const pts = data() ?? []
    if (range() !== '1d' || !pts.length) return pts
    const now = Date.now()
    const t = now - (now % 60_000)
    const last = pts.at(-1)!
    if (t - last.t > 60 * 60_000) return pts // 장이 끝난 뒤
    const live = { t, v: props.holding.lastPrice }
    return last.t === t ? [...pts.slice(0, -1), live] : [...pts, live]
  })
  const change = () => {
    const p = points()
    return p.length > 1 ? p.at(-1)!.v / p[0]!.v - 1 : 0
  }

  let closeBtn: HTMLButtonElement | undefined
  const opener = document.activeElement as HTMLElement | null
  onMount(() => {
    closeBtn?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose()
    document.addEventListener('keydown', onKey)
    onCleanup(() => {
      document.removeEventListener('keydown', onKey)
      opener?.focus()
    })
  })

  const h = () => props.holding
  const stats = () => [
    ['수량', `${qty(h().quantity)}주`],
    ['평균 단가', money(h().averagePrice, h().currency)],
    ['평가금액', `${won.format(h().value)}원`],
    ['비중', share(h().weight)],
    ['섹터', h().sector],
    ['자산군', h().assetClass],
  ]

  return (
    <>
      <div class="drawer-backdrop" onClick={() => props.onClose()} />
      <aside
        class="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-title"
      >
        <header class="drawer-head">
          <div>
            <h2 id="detail-title">{h().name}</h2>
            <div class="muted">
              {h().symbol} · {h().market}
            </div>
          </div>
          <button
            class="icon-btn"
            ref={(e) => (closeBtn = e)}
            aria-label="닫기"
            onClick={() => props.onClose()}
          >
            ✕
          </button>
        </header>

        <div class="detail-price">
          <span class="big">{money(h().lastPrice, h().currency)}</span>
          <span class={dir(h().dailyRate)}>{pct(h().dailyRate)} 오늘</span>
        </div>

        <div class="filters">
          <div class="segmented" role="group" aria-label="차트 기간">
            <For each={RANGES}>
              {(r) => (
                <button
                  aria-pressed={range() === r.key}
                  onClick={() => setRange(r.key)}
                >
                  {r.label}
                </button>
              )}
            </For>
          </div>
          <span class={`muted ${dir(change())}`}>
            {points().length > 1 && `기간 ${pct(change())}`}
          </span>
        </div>

        <div classList={{ loading: data.loading }}>
          <Show
            when={!data.error}
            fallback={
              <p class="err">{String(data.error?.message ?? data.error)}</p>
            }
          >
            <LineChart
              points={points()}
              loading={data.loading}
              height={240}
              axis
              label={`${h().name} ${range() === '1d' ? '당일' : '1년'} 가격`}
              color={`var(--${change() >= 0 ? 'up' : 'down'})`}
              format={(v) => money(v, h().currency)}
              time={range() === '1d' ? hhmm : ymd}
              refLine={{
                v: h().averagePrice,
                label: `평단 ${money(h().averagePrice, h().currency)}`,
              }}
            />
          </Show>
        </div>

        <div class="detail-pnl">
          <div>
            <div class="muted">총 손익</div>
            <b class={dir(h().pnl)}>{sWon(h().pnl)}</b>
            <span class={dir(h().rate)}> {pct(h().rate)}</span>
          </div>
          <div>
            <div class="muted">오늘</div>
            <b class={dir(h().daily)}>{sWon(h().daily)}</b>
            <span class={dir(h().dailyRate)}> {pct(h().dailyRate)}</span>
          </div>
        </div>

        <dl class="stats">
          <Index each={stats()}>
            {(kv) => (
              <>
                <dt>{kv()[0]}</dt>
                <dd>{kv()[1]}</dd>
              </>
            )}
          </Index>
        </dl>
      </aside>
    </>
  )
}
