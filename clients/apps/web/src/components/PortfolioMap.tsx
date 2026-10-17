import type { Holding } from '@portfolio/client'
import { createMemo, createSignal, Index, onCleanup, onMount } from 'solid-js'
import { type Rect, squarify } from '../lib/treemap'
import { pct, share, sWon, won } from '../lib/ui'
import { remember } from './Skeleton'
import './PortfolioMap.css'

const HEIGHT = 420
const HEADER = 18
const CAP = 0.03 // ±3% 에서 색이 가장 진함
const SCALE = [-3, -2, -1, 0, 1, 2, 3]

const fill = (rate: number) => {
  const p = Math.round(Math.min(1, Math.abs(rate) / CAP) * 80) // 80% 상한: 글자 대비 유지
  return `color-mix(in oklab, var(--${rate >= 0 ? 'up' : 'down'}) ${p}%, var(--mid))`
}

// 타일 안의 2px 표면 간격
const pos = (r: Rect) => ({
  left: `${r.x + 1}px`,
  top: `${r.y + 1}px`,
  width: `${Math.max(0, r.w - 2)}px`,
  height: `${Math.max(0, r.h - 2)}px`,
})

// 글자가 들어가는 최대 크기 (한글은 1em, 영숫자는 ~0.62em 폭으로 어림)
const fitFont = (r: Rect, text: string) => {
  const em = [...text].reduce(
    (a, c) => a + (c.charCodeAt(0) > 0x2e80 ? 1 : 0.62),
    0,
  )
  return Math.min(28, (r.w - 8) / em, (r.h - 6) / 2.5)
}

export function PortfolioMap(props: {
  holdings: Holding[]
  onSelect: (symbol: string) => void
}) {
  let box: HTMLDivElement | undefined
  const [width, setWidth] = createSignal(0)
  onMount(() => {
    const ro = new ResizeObserver(([e]) => setWidth(e!.contentRect.width))
    ro.observe(box!)
    onCleanup(() => ro.disconnect())
  })

  const layout = createMemo(() => {
    const groups = new Map<string, Holding[]>()
    for (const h of props.holdings)
      groups.set(h.sector, [...(groups.get(h.sector) ?? []), h])

    const heads: { name: string; r: Rect }[] = []
    const tiles: { h: Holding; r: Rect }[] = []
    const area = { x: 0, y: 0, w: width(), h: HEIGHT }
    const sum = (hs: Holding[]) => hs.reduce((a, h) => a + h.value, 0)
    for (const { item, ...r } of squarify(
      [...groups],
      ([, hs]) => sum(hs),
      area,
    )) {
      // 공간이 있을 때만 그룹 이름 줄을 둔다
      const head = r.h > HEADER * 3 && r.w > 60
      if (head) heads.push({ name: item[0], r: { ...r, h: HEADER } })
      const inner = head ? { ...r, y: r.y + HEADER, h: r.h - HEADER } : r
      for (const t of squarify(item[1], (h) => h.value, inner))
        tiles.push({ h: t.item, r: t })
    }
    return { heads, tiles }
  })

  return (
    <section class="card" ref={remember('map')}>
      <h2>포트폴리오 맵 · 오늘</h2>
      <div
        class="treemap"
        ref={(e) => (box = e)}
        style={{ height: `${HEIGHT}px` }}
      >
        <Index each={layout().heads}>
          {(g) => (
            <div class="tm-head" style={pos(g().r)}>
              {g().name}
            </div>
          )}
        </Index>
        <Index each={layout().tiles}>
          {(t) => {
            const label = () =>
              t().h.market === 'US' ? t().h.symbol : t().h.name
            const font = () => fitFont(t().r, label())
            return (
              <div
                class="tm-tile"
                tabindex="0"
                onClick={() => props.onSelect(t().h.symbol)}
                onKeyDown={(e) =>
                  e.key === 'Enter' && props.onSelect(t().h.symbol)
                }
                style={{
                  ...pos(t().r),
                  background: fill(t().h.dailyRate),
                  'font-size': `${font()}px`,
                }}
                data-v={pct(t().h.dailyRate)}
                data-tip={`${t().h.name} · 비중 ${share(t().h.weight)}\n${won.format(t().h.value)}원 · 오늘 ${sWon(t().h.daily)}`}
              >
                {/* 안 들어가면 라벨 생략 — 값은 툴팁과 보유 종목 표에 있다 */}
                {font() >= 10 && (
                  <>
                    <b>{label()}</b>
                    {font() * 2.5 + 14 < t().r.h && (
                      <span>{pct(t().h.dailyRate)}</span>
                    )}
                  </>
                )}
              </div>
            )
          }}
        </Index>
      </div>
      <div class="tm-scale" aria-label="오늘 등락률 색 범례">
        {SCALE.map((v) => (
          <span style={{ background: fill(v / 100) }}>
            {v > 0 ? '+' : v < 0 ? '−' : ''}
            {Math.abs(v)}%
          </span>
        ))}
      </div>
    </section>
  )
}
