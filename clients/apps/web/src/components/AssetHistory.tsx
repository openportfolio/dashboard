import { api } from '@portfolio/client'
import { createResource, Show } from 'solid-js'
import { won, ymd } from '../lib/ui'
import { LineChart } from './LineChart'

/** 거래일별 총 자산. 탭을 열 때마다 다시 받는다 (하루 한 점이라 실시간 갱신은 불필요) */
export function AssetHistory() {
  const [data] = createResource(() => api('/api/history'))
  // 첫 기록 대비 오르면 빨강, 내리면 파랑
  const up = () => {
    const p = data() ?? []
    return p.length < 2 || p.at(-1)!.v >= p[0]!.v
  }

  return (
    <section class="card">
      <h2>자산 추이</h2>
      <p class="sub">
        거래일(오전 8시 경계)마다 마지막 총 자산. 입출금 포함, 대시보드를 켠
        날만 기록.
      </p>
      <Show
        when={!data.error}
        fallback={
          <p class="err">{String(data.error?.message ?? data.error)}</p>
        }
      >
        <LineChart
          points={data() ?? []}
          loading={data.loading}
          height={200}
          axis
          label="거래일별 총 자산"
          color={`var(--${up() ? 'up' : 'down'})`}
          format={(v) => won.format(v) + '원'}
          time={ymd}
        />
      </Show>
    </section>
  )
}
