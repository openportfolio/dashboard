import type { PricePoint, Snapshot } from '@portfolio/client'
import { type JSX, Show } from 'solid-js'
import { dir, hhmm, pct, sWon, won } from '../lib/ui'
import { LineChart } from './LineChart'
import { remember, remembered, Skeleton } from './Skeleton'
import './KpiRow.css'

function Kpi(props: {
  label: string
  /** 없으면 스켈레톤 */
  value?: string
  rate?: number
  note?: string
  hero?: boolean
  children?: JSX.Element
}) {
  return (
    <div class="card kpi" classList={{ hero: props.hero }}>
      <div class="kpi-text">
        <div class="label">{props.label}</div>
        <div class="value">
          {/* ch = 이 칸 숫자 글꼴의 한 자 폭. 글자 간격을 좁힌 실제 금액 폭에 맞춘 값 (총 자산 ≈ 11.5자).
              % 로 주면 로딩 중엔 라벨 폭 기준이라 쪼그라든다 */}
          {props.value ?? (
            <Skeleton
              height={props.hero ? 52 : 34}
              width={props.hero ? '11.5ch' : '9ch'}
            />
          )}
        </div>
        {props.rate !== undefined && (
          <div class={`delta ${dir(props.rate)}`}>{pct(props.rate)}</div>
        )}
        {props.note && <div class="delta muted">{props.note}</div>}
        {/* 총 자산은 아래 정렬이라, 로딩 중에도 메모 줄 자리를 채워야 금액이 같은 높이에 온다 */}
        {props.hero && !props.value && (
          <div class="delta">
            <Skeleton height={18} width="100%" />
          </div>
        )}
      </div>
      {props.children}
    </div>
  )
}

export function KpiRow(props: { snap?: Snapshot; flow: PricePoint[] }) {
  // 오늘 흐름 색: 첫 기록 대비 오르면 빨강, 내리면 파랑
  const flowUp = () =>
    props.flow.length < 2 || props.flow.at(-1)!.v >= props.flow[0]!.v

  return (
    <Show
      when={props.snap}
      fallback={
        <section
          class="kpis"
          style={{ height: `${remembered('kpis', 140)}px` }}
        >
          <Kpi hero label="총 자산" />
          <Kpi label="총 손익" />
          <Kpi label="오늘 손익" />
        </section>
      }
    >
      {(s) => (
        <section class="kpis" ref={remember('kpis')}>
          <Kpi
            hero
            label="총 자산"
            value={won.format(s().assets) + '원'}
            note={`주식 ${won.format(s().total)}원 · 현금 ${won.format(s().assets - s().total)}원 · 1 USD = ${s().fx.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원`}
          >
            <div class="kpi-spark">
              <div class="label">오늘 흐름</div>
              <LineChart
                points={props.flow}
                height={64}
                label="오늘 총 자산 흐름"
                color={`var(--${flowUp() ? 'up' : 'down'})`}
                format={(v) => won.format(v) + '원'}
                time={hhmm}
              />
            </div>
          </Kpi>
          <Kpi
            label="총 손익"
            value={sWon(s().pnl)}
            rate={s().pnlRate}
            note={`주가 ${sWon(s().pricePnl)} · 환율 ${sWon(s().pnl - s().pricePnl)}`}
          />
          <Kpi label="오늘 손익" value={sWon(s().daily)} rate={s().dailyRate} />
        </section>
      )}
    </Show>
  )
}
