import {
  api,
  type PricePoint,
  type SectorPerformance,
  type Snapshot,
  streamSnapshot,
} from '@portfolio/client'
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
} from 'solid-js'
import { AssetHistory } from './components/AssetHistory'
import { Backtest } from './components/Backtest'
import { AssetMix } from './components/AssetMix'
import { DividendIncome } from './components/DividendIncome'
import { HoldingsTable } from './components/HoldingsTable'
import { KpiRow } from './components/KpiRow'
import { PortfolioMap } from './components/PortfolioMap'
import { SectorExposure } from './components/SectorExposure'
import { SectorHeatmap } from './components/SectorHeatmap'
import { Select } from './components/Select'
import { SkeletonCard } from './components/Skeleton'
import { StockDetail } from './components/StockDetail'
import { Strategy } from './components/Strategy'
import { StrategyEditor } from './components/StrategyEditor'
import { ThemeToggle } from './components/ThemeToggle'
import { Tooltip } from './components/Tooltip'
import { Trades } from './components/Trades'
import {
  activeStrategy,
  setActive,
  strategies,
  strategyColor,
  syncError,
} from './lib/strategies'
import { colorOf, usd } from './lib/ui'
import './App.css'

type Tab = 'live' | 'assets' | 'strategy' | 'backtest' | 'trades'
const TABS: { key: Tab; label: string }[] = [
  { key: 'live', label: '실시간' },
  { key: 'assets', label: '자산 · 섹터' },
  { key: 'strategy', label: '전략' },
  { key: 'backtest', label: '백테스트' },
  { key: 'trades', label: '거래' },
]

export function App() {
  const [snap, setSnap] = createSignal<Snapshot>()
  const [perf, setPerf] = createSignal<SectorPerformance[]>([])
  const [flow, setFlow] = createSignal<PricePoint[]>([])
  const [errors, setErrors] = createSignal<Record<string, string>>({})
  const [live, setLive] = createSignal(false)
  // 탭은 ?tab=, 상세 패널 종목은 #심볼 로 URL 에 남긴다 (새로고침해도 유지)
  const [tab, setTab] = createSignal<Tab>(
    TABS.find((t) => t.key === new URLSearchParams(location.search).get('tab'))
      ?.key ?? 'live',
  )
  const [selected, setSelected] = createSignal(
    decodeURIComponent(location.hash.slice(1)),
  )
  const syncUrl = () =>
    history.replaceState(
      null,
      '',
      location.pathname +
        (tab() === 'live' ? '' : `?tab=${tab()}`) +
        (selected() ? `#${encodeURIComponent(selected())}` : ''),
    )
  const select = (symbol: string) => {
    setSelected(symbol)
    syncUrl()
  }
  const openTab = (t: Tab) => {
    setTab(t)
    syncUrl()
  }
  // 탭 키보드: 좌우 화살표로 이동 (WAI-ARIA tabs 패턴)
  const onTabKey = (e: KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const next =
      TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]!
    openTab(next.key)
    document.getElementById(`tab-${next.key}`)?.focus()
  }

  // 출처별로 관리해야 snapshot 수신(초 단위)이 다른 에러를 지우지 않는다
  const setErr = (src: string, e?: unknown) =>
    setErrors((prev) => {
      const next = { ...prev }
      if (e) next[src] = e instanceof Error ? e.message : String(e)
      else delete next[src]
      return next
    })

  // 전략 불러오기 · 저장 실패도 같은 오류 줄에
  createEffect(() => setErr('strategies', syncError()))

  const exposure = createMemo(
    () => new Map(snap()?.sectors.map((s) => [s.name, s.weight])),
  )
  const detail = createMemo(() =>
    snap()?.holdings.find((h) => h.symbol === selected()),
  )

  // 오늘 흐름: 서버 기록에 실시간 값을 1분 단위로 이어 붙인다
  const appendFlow = (s: Snapshot) =>
    setFlow((f) => {
      const t = s.at - (s.at % 60_000)
      const point = { t, v: s.assets }
      // 탭을 켜 둔 채 거래일(08:00 KST)이 바뀌면 어제 점은 버린다 (서버 history.ts dayStart 와 같은 경계)
      const start = t - ((t + 3_600_000) % 86_400_000)
      const today = f.filter((p) => p.t >= start)
      return today.at(-1)?.t === t
        ? [...today.slice(0, -1), point]
        : [...today, point]
    })

  async function loadPerf() {
    try {
      setPerf(await api('/api/performance'))
      setErr('performance')
    } catch (e) {
      setErr('performance', e)
    }
  }

  onMount(() => {
    api('/api/flow')
      .then((f) =>
        setFlow((cur) => [
          ...f.filter((p) => p.t < (cur[0]?.t ?? Infinity)),
          ...cur,
        ]),
      )
      .catch((e) => setErr('flow', e))
    const unsubscribe = streamSnapshot({
      onData: (s) => {
        s.sectors.forEach((x) => colorOf(x.name)) // 큰 섹터부터 색 배정
        setSnap(s)
        appendFlow(s)
        setErr('snapshot')
      },
      onFailure: (message) => setErr('snapshot', message),
      onConnected: setLive,
    })
    loadPerf()
    const slow = setInterval(loadPerf, 600_000)
    const onHash = () => setSelected(decodeURIComponent(location.hash.slice(1)))
    addEventListener('hashchange', onHash)
    onCleanup(() => {
      unsubscribe()
      clearInterval(slow)
      removeEventListener('hashchange', onHash)
    })
  })

  return (
    <main>
      <header>
        <h1>
          <img src="/favicon.svg" alt="" width="28" height="28" />
          OpenPortfolio
        </h1>
        <div class="header-right">
          <Show
            when={snap()}
            fallback={<span class="muted">불러오는 중…</span>}
          >
            {(s) => (
              <span class="muted" classList={{ live: live() }}>
                {live() ? '실시간' : '재연결 중…'} ·{' '}
                <time class="clock">
                  {new Date(s().at).toLocaleTimeString('ko-KR')}
                </time>
              </span>
            )}
          </Show>
          {/* 지금 따르는 전략 (전략 탭의 기준) · 그 전략 편집 */}
          <div class="filters">
            <Show when={activeStrategy()}>
              {(a) => (
                <Select
                  label="지금 따르는 전략"
                  class="strategy-select"
                  value={a().id}
                  onChange={setActive}
                  options={strategies().map((x) => ({
                    value: x.id,
                    label: x.name,
                    color: strategyColor(x.id),
                    detail: [
                      `${x.assets.length}종목`,
                      `매일 ${usd(x.daily)}`,
                      x.bear && '하락장 룰',
                    ]
                      .filter(Boolean)
                      .join(' · '),
                  }))}
                />
              )}
            </Show>
            <StrategyEditor holdings={snap()?.holdings} />
          </div>
          <ThemeToggle />
        </div>
      </header>

      <Show when={Object.keys(errors()).length}>
        <div class="err">
          {Object.values(errors()).join('\n')}
          {/* 키가 틀렸거나 IP 가 바뀌면 여기서 다시 넣는다 */}
          <Show when={errors().snapshot}>
            {' '}
            <a href="?setup">키 다시 입력</a>
          </Show>
        </div>
      </Show>

      <KpiRow snap={snap()} flow={flow()} />

      <div class="tabs segmented" role="tablist" aria-label="화면">
        <For each={TABS}>
          {(t, i) => (
            <button
              role="tab"
              id={`tab-${t.key}`}
              aria-selected={tab() === t.key}
              aria-controls={`panel-${t.key}`}
              tabindex={tab() === t.key ? 0 : -1}
              onClick={() => openTab(t.key)}
              onKeyDown={(e) => onTabKey(e, i())}
            >
              {t.label}
            </button>
          )}
        </For>
      </div>

      <Switch>
        <Match when={tab() === 'live'}>
          <section
            class="panel"
            role="tabpanel"
            id="panel-live"
            aria-labelledby="tab-live"
          >
            <Show
              when={snap()}
              fallback={
                <>
                  <SkeletonCard id="map" height={520} />
                  <SkeletonCard id="holdings" height={680} />
                </>
              }
            >
              {(s) => (
                <>
                  <PortfolioMap holdings={s().holdings} onSelect={select} />
                  <HoldingsTable holdings={s().holdings} onSelect={select} />
                </>
              )}
            </Show>
          </section>
        </Match>
        <Match when={tab() === 'assets'}>
          <section
            class="panel"
            role="tabpanel"
            id="panel-assets"
            aria-labelledby="tab-assets"
          >
            <AssetHistory />
            <div class="layout">
              <div class="col">
                <Show
                  when={snap()}
                  fallback={<SkeletonCard id="sectors" height={420} />}
                >
                  {(s) => (
                    <SectorExposure
                      sectors={s().sectors}
                      etfAsOf={s().etfAsOf}
                    />
                  )}
                </Show>
              </div>
              <div class="col">
                <AssetMix snap={snap()} />
              </div>
            </div>
            <DividendIncome snap={snap()} />
            <SectorHeatmap perf={perf()} exposure={exposure()} />
          </section>
        </Match>
        <Match when={tab() === 'strategy'}>
          <section
            class="panel"
            role="tabpanel"
            id="panel-strategy"
            aria-labelledby="tab-strategy"
          >
            <Strategy snap={snap()} />
          </section>
        </Match>
        <Match when={tab() === 'backtest'}>
          <section
            class="panel"
            role="tabpanel"
            id="panel-backtest"
            aria-labelledby="tab-backtest"
          >
            <Backtest />
          </section>
        </Match>
        <Match when={tab() === 'trades'}>
          <section
            class="panel"
            role="tabpanel"
            id="panel-trades"
            aria-labelledby="tab-trades"
          >
            <Trades snap={snap()} />
          </section>
        </Match>
      </Switch>

      <Show when={detail()}>
        {(h) => <StockDetail holding={h()} onClose={() => select('')} />}
      </Show>
      <Tooltip />
    </main>
  )
}
