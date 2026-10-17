import type { PricePoint } from '@portfolio/client'
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  untrack,
} from 'solid-js'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { dark } from '../lib/theme'
import { Skeleton } from './Skeleton'
import './LineChart.css'

// 캔버스는 CSS 변수를 모르니 지금 테마의 실제 색을 읽어 넘기고, 테마(dark)가 바뀌면 다시 만든다

/** 'var(--up)' → '#ff3b30' */
const resolve = (c: string) => {
  const m = /^var\((--[\w-]+)\)$/.exec(c)
  return m
    ? getComputedStyle(document.documentElement).getPropertyValue(m[1]!).trim()
    : c
}
/** #rrggbb + 투명도 → rgba() (토큰이 아닌 색이면 그대로) */
const alpha = (c: string, a: number) => {
  if (!/^#[0-9a-f]{6}$/i.test(c)) return c
  const n = parseInt(c.slice(1), 16)
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

/**
 * 시계열 선 차트 (uPlot, 캔버스). 2px 선 + 아래로 옅어지는 면 + 끝점.
 * axis=false 면 스파크라인 (눈금 없음). axis 면 끌어서 확대, 더블클릭으로 되돌린다.
 * compare 는 같은 기간의 비교 시계열 (툴팁에 같은 날 값). 좌우 화살표로 점을 옮길 수 있다
 */
export function LineChart(props: {
  points: PricePoint[]
  height: number
  color: string
  format: (v: number) => string
  time: (t: number) => string
  refLine?: { v: number; label: string }
  compare?: { points: PricePoint[]; label: string; color: string }[]
  /** 점이 없을 때 '쌓이는 중' 대신 스켈레톤 */
  loading?: boolean
  axis?: boolean
  /** 로그 눈금 (밑 2: 눈금 하나가 두 배). 값이 모두 양수여야 한다 */
  log?: boolean
  label: string
}) {
  let box: HTMLDivElement | undefined
  let plot: HTMLDivElement | undefined
  let u: uPlot | undefined
  let key = ''
  const [width, setWidth] = createSignal(0)
  /** 커서가 가리키는 점 (data 인덱스 · 툴팁 x 위치) */
  const [hover, setHover] = createSignal<{ i: number; x: number }>()
  onMount(() => {
    const ro = new ResizeObserver(([e]) => setWidth(e!.contentRect.width))
    ro.observe(box!)
    onCleanup(() => ro.disconnect())
  })
  onCleanup(() => u?.destroy())

  // 비교 시계열과 날짜를 맞춘 표: [t[], 본 시계열[], 비교1[], …] (없는 날은 null)
  const data = createMemo((): uPlot.AlignedData => {
    const table = (ps: PricePoint[]): uPlot.AlignedData => [
      ps.map((p) => p.t),
      ps.map((p) => p.v),
    ]
    const cmp = props.compare ?? []
    return cmp.length
      ? uPlot.join([table(props.points), ...cmp.map((c) => table(c.points))])
      : table(props.points)
  })
  const ok = () => props.points.length >= 2

  // 기준선(평단 등)이 데이터 범위에서 멀면 축에 넣지 않는다 (선이 납작해짐) — 가장자리에 화살표로만 표시
  const range = (lo: number | null, hi: number | null): uPlot.Range.MinMax => {
    if (lo == null || hi == null) return [0, 1]
    const ref = props.refLine?.v
    const span = hi - lo || Math.abs(hi) || 1
    if (ref !== undefined && ref >= lo - span && ref <= hi + span)
      [lo, hi] = [Math.min(lo, ref), Math.max(hi, ref)]
    const margin = (hi - lo || Math.abs(hi) || 1) * 0.08
    return [lo - margin, hi + margin]
  }

  const build = (w: number): uPlot.Options => {
    const token = (name: string) => resolve(`var(${name})`)
    const colors = [
      props.color,
      ...(props.compare ?? []).map((c) => c.color),
    ].map(resolve)
    const main = colors[0]!
    const surface = token('--surface')
    const muted = token('--muted')
    const mono = token('--mono')
    const font = `11px ${mono}`
    const px = uPlot.pxRatio
    // 눈금 글자 폭만큼 축 자리를 잡는다 ('130,943,329원' 처럼 길어도 안 잘리게)
    const fit: uPlot.Axis.Size = (self, values, i, cycle) => {
      if (cycle > 1) return (self.axes[i] as { _size?: number })._size ?? 0
      self.ctx.font = font
      const long = (values ?? []).reduce(
        (x, v) => (v.length > x.length ? v : x),
        '',
      )
      return Math.ceil(self.ctx.measureText(long).width + 12)
    }
    // 마지막 점
    const dot = (self: uPlot) => {
      const [xs, ys] = self.data as [number[], (number | null)[]]
      let i = ys.length - 1
      while (i >= 0 && ys[i] == null) i--
      if (i < 0) return
      const { ctx } = self
      ctx.beginPath()
      ctx.arc(
        self.valToPos(xs[i]!, 'x', true),
        self.valToPos(ys[i]!, 'y', true),
        4 * px,
        0,
        Math.PI * 2,
      )
      ctx.fillStyle = main
      ctx.fill()
      ctx.lineWidth = 2 * px
      ctx.strokeStyle = surface
      ctx.stroke()
    }
    const refLine = (self: uPlot) => {
      const ref = props.refLine
      if (!ref) return
      const { ctx } = self
      const { left, top, width, height } = self.bbox
      const [lo, hi] = [self.scales.y!.min!, self.scales.y!.max!]
      ctx.font = `${11 * px}px ${mono}`
      ctx.fillStyle = muted
      ctx.textAlign = 'right'
      const right = left + width - 4 * px
      if (ref.v >= lo && ref.v <= hi) {
        const y = self.valToPos(ref.v, 'y', true)
        ctx.strokeStyle = token('--axis')
        ctx.lineWidth = px
        ctx.setLineDash([4 * px, 3 * px])
        ctx.beginPath()
        ctx.moveTo(left, y)
        ctx.lineTo(left + width, y)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.fillText(ref.label, right, y - 4 * px)
      } else
        ctx.fillText(
          `${ref.label} ${ref.v < lo ? '↓' : '↑'}`,
          right,
          ref.v < lo ? top + height - 4 * px : top + 12 * px,
        )
    }
    return {
      width: w,
      height: props.height,
      ms: 1,
      legend: { show: false },
      padding: props.axis ? [10, 0, 0, 4] : [6, 6, 4, 2],
      cursor: {
        y: false,
        drag: { x: !!props.axis, y: false },
        points: {
          size: 9,
          width: 2,
          fill: (_, i) => colors[i - 1]!,
          stroke: () => surface,
        },
      },
      scales: {
        x: { time: true },
        y: props.log
          ? {
              distr: 3,
              log: 2,
              range: (_, lo, hi) => uPlot.rangeLog(lo!, hi!, 2, true),
            }
          : { range: (_, lo, hi) => range(lo, hi) },
      },
      axes: props.axis
        ? [
            {
              stroke: muted,
              font,
              size: 26, // 기본 50px 은 날짜 한 줄에 비해 아래가 빈다
              space: 110,
              grid: { show: false },
              ticks: { show: false },
              values: (_, ts) => ts.map((t) => props.time(t)),
            },
            {
              side: 1,
              stroke: muted,
              font,
              size: fit,
              grid: { stroke: token('--grid'), width: 1 },
              ticks: { show: false },
              // 로그 눈금은 라벨을 안 달 작은 눈금을 null 로 준다
              values: (_, vs) =>
                vs.map((v) => (v == null ? '' : props.format(v))),
            },
          ]
        : [{ show: false }, { show: false }],
      series: [
        {},
        {
          stroke: main,
          width: 2,
          points: { show: false },
          // 선 아래 면: 위에서 아래로 옅어진다
          fill: (self) => {
            const g = self.ctx.createLinearGradient(
              0,
              self.bbox.top,
              0,
              self.bbox.top + self.bbox.height,
            )
            g.addColorStop(0, alpha(main, 0.22))
            g.addColorStop(1, alpha(main, 0))
            return g
          },
        },
        ...colors.slice(1).map((c) => ({
          stroke: c,
          width: 1.5,
          spanGaps: true,
          points: { show: false },
        })),
      ],
      hooks: {
        // uPlot 은 마지막으로 정한 선 · 면 색을 기억해 다시 안 정한다. 훅이 바꾼 ctx 를 안 되돌리면
        // 다음 그리기(1초 갱신)부터 선이 점 테두리 색(흰색)으로 그려진다
        draw: [refLine, dot].map((f) => (self: uPlot) => {
          self.ctx.save()
          f(self)
          self.ctx.restore()
        }),
        setCursor: [
          (self) => {
            const i = self.cursor.idx
            setHover(
              i == null
                ? undefined
                : {
                    i,
                    x:
                      self.over.offsetLeft +
                      self.valToPos(self.data[0][i]!, 'x'),
                  },
            )
          },
        ],
      },
    }
  }

  // 색 · 축 · 비교 시계열 구성이 바뀌면 새로 만들고, 값만 바뀌면 (1초 갱신) setData
  createEffect(() => {
    const d = data()
    const w = width()
    const k = [
      dark(),
      props.axis,
      props.log,
      props.color,
      ...(props.compare ?? []).map((c) => c.color),
    ].join('|')
    if (!ok() || !w) {
      u?.destroy()
      u = undefined
      setHover()
      return
    }
    if (u && k === key) {
      if (u.width !== w || u.height !== props.height)
        u.setSize({ width: w, height: props.height })
      u.setData(d)
      return
    }
    u?.destroy()
    key = k
    u = new uPlot(
      untrack(() => build(w)),
      d,
      plot!,
    )
  })

  // 키보드: 좌우 화살표로 점 이동 (포커스하면 마지막 점)
  const moveTo = (i: number) =>
    u?.setCursor({ left: u.valToPos(u.data[0][i]!, 'x'), top: 0 })
  const onKey = (e: KeyboardEvent) => {
    if (!u || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
    const n = u.data[0].length
    const i = hover()?.i ?? n - 1
    moveTo(Math.max(0, Math.min(n - 1, i + (e.key === 'ArrowRight' ? 1 : -1))))
    e.preventDefault()
  }
  // 터치: 손가락을 따라 커서 이동 (uPlot 은 마우스 이벤트만 듣는다)
  const onTouch = (e: PointerEvent) => {
    if (!u || e.pointerType === 'mouse') return
    u.setCursor({
      left: e.clientX - u.over.getBoundingClientRect().left,
      top: 0,
    })
  }

  // 툴팁은 십자선 오른쪽에, 넘치면 왼쪽에, 그래도 넘치면(좁은 화면) 차트 왼쪽 끝에 맞춘다
  // 폭은 그려진 뒤에야 알 수 있어 ResizeObserver 로 잰다 (그리기 전에 위치를 다시 잡는다)
  const [tipW, setTipW] = createSignal(0)
  const measureTip = (el: HTMLDivElement) => {
    const ro = new ResizeObserver(() => setTipW(el.offsetWidth))
    ro.observe(el)
    onCleanup(() => ro.disconnect())
  }
  const tipLeft = (x: number) =>
    x + 10 + tipW() <= width() ? x + 10 : Math.max(0, x - 10 - tipW())

  const tip = () => {
    const h = hover()
    if (!h) return
    const d = data()
    const v = (s: number) => d[s]?.[h.i] as number | null | undefined
    return {
      x: h.x,
      main: v(1),
      t: d[0][h.i]!,
      compare: (props.compare ?? []).flatMap((c, j) => {
        const cv = v(j + 2)
        return cv == null ? [] : [{ ...c, v: cv }]
      }),
    }
  }

  return (
    <div
      class="lc"
      ref={(e) => (box = e)}
      tabindex={ok() ? 0 : undefined}
      role="img"
      aria-label={props.label}
      onKeyDown={onKey}
      onFocus={() => u && moveTo(u.data[0].length - 1)}
      onBlur={() => u?.setCursor({ left: -10, top: -10 })}
      onPointerMove={onTouch}
      // 빈 차트는 한 줄 안내만 (빈 상자를 차트 높이만큼 남기지 않는다)
      style={{
        height:
          ok() || props.loading || !width() ? `${props.height}px` : undefined,
      }}
    >
      <div ref={(e) => (plot = e)} />
      <Show when={!ok()}>
        {props.loading ? (
          <Skeleton height={props.height} />
        ) : (
          <div class="lc-empty muted">데이터가 쌓이는 중…</div>
        )}
      </Show>
      <Show when={tip()}>
        {(t) => (
          <div
            class="lc-tip"
            ref={measureTip}
            style={{ left: `${tipLeft(t().x)}px`, top: '10px' }}
          >
            <b>{t().main == null ? '–' : props.format(t().main!)}</b>
            <For each={t().compare}>
              {(c) => (
                <span>
                  <i class="sw" style={{ background: c.color }} />
                  {c.label} {props.format(c.v)}
                </span>
              )}
            </For>
            <span>{props.time(t().t)}</span>
          </div>
        )}
      </Show>
    </div>
  )
}
