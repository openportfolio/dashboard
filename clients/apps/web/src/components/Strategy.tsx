import { api, type Snapshot } from '@portfolio/client'
import { createMemo, createResource, Index, Show } from 'solid-js'
import { activeStrategy, addStrategy, loaded } from '../lib/strategies'
import {
  allocate,
  type Allocation,
  drawdown,
  stageLabels,
  stageOf,
  stageWeights,
  type Strategy as StrategyDef,
  targets,
} from '../lib/strategy'
import { cents, pct, share, usd, won, ymd } from '../lib/ui'
import { remember, Skeleton, SkeletonCard } from './Skeleton'
import { openEditor } from './StrategyEditor'
import { StrategyStart } from './StrategyStart'
import './Strategy.css'

/** 현재 비중 막대 + 목표(한도) 눈금. scale = 막대 끝에 해당하는 비중 */
function Goal(props: {
  value: number
  mark: number
  scale: number
  over?: boolean
  label: string
}) {
  return (
    <div class="goal" role="img" aria-label={props.label}>
      <i style={{ left: `${(props.mark / props.scale) * 100}%` }} />
      <div
        classList={{ over: props.over }}
        style={{ width: `${Math.min(1, props.value / props.scale) * 100}%` }}
      />
    </div>
  )
}

/** 목표 비중 대비 현재 비중 · 매도 없이 맞추려면 더 사야 할 금액 */
function Targets(props: {
  snap: Snapshot
  a: Allocation
  strategy: StrategyDef
}) {
  const st = () => props.strategy
  const s = () => props.snap
  const a = () => props.a
  const toUsd = (krw: number) => usd(Math.round(krw / s().fx))
  const scale = () =>
    Math.max(0.01, ...a().rows.flatMap((r) => [r.weight, r.target])) * 1.15
  return (
    <section class="card" ref={remember('strategy-goals')}>
      <h2>목표 비중</h2>
      <p class="sub">
        전략 종목 합 {toUsd(a().total)} 기준. 추가 매수는 팔지 않고 목표 비중에
        맞추는 금액입니다.
      </p>
      <div class="table-scroll">
        <table class="goals">
          <thead>
            <tr>
              <th>종목</th>
              <th />
              <th class="n">현재</th>
              <th class="n">목표</th>
              <th class="n">평가금액</th>
              <th class="n">추가 매수</th>
            </tr>
          </thead>
          <tbody>
            <Index each={a().rows}>
              {(r) => (
                <tr>
                  <td>
                    {r().name}
                    <div class="names">
                      {[r().name !== r().symbol && r().symbol, r().group]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </td>
                  <td class="bar">
                    <Goal
                      value={r().weight}
                      mark={r().target}
                      scale={scale()}
                      label={`현재 ${share(r().weight)}, 목표 ${share(r().target)}`}
                    />
                  </td>
                  <td class="n">{share(r().weight)}</td>
                  <td class="n">{share(r().target)}</td>
                  <td class="n">{toUsd(r().value)}</td>
                  <td class="n">
                    {r().topUp >= s().fx ? '+' + toUsd(r().topUp) : '–'}
                  </td>
                </tr>
              )}
            </Index>
          </tbody>
          <tfoot>
            <Index each={a().groups}>
              {(g) => (
                <tr>
                  <td>{g().name} 합계</td>
                  <td />
                  <td class="n">{share(g().weight)}</td>
                  <td class="n">{share(g().target)}</td>
                  <td colspan="2" />
                </tr>
              )}
            </Index>
          </tfoot>
        </table>
      </div>
      <p class="names">
        <Show
          when={a().total > 0}
          fallback="아직 이 전략의 종목을 보유하지 않았습니다."
        >
          추가 매수 합계 {toUsd(a().topUp)} · 매일 {usd(st().daily)} 로{' '}
          {Math.ceil(a().topUp / s().fx / st().daily)}일
        </Show>
        <Show when={a().outside.length}>
          <br />
          전략 외 보유 (계산 제외):{' '}
          {a()
            .outside.map((h) => `${h.name} ${won.format(h.value)}원`)
            .join(' · ')}
        </Show>
      </p>
    </section>
  )
}

/** 하락장 단계와 오늘 살 금액 (단계별 비중 × 매일 매수액) */
function TodayPlan(props: {
  snap: Snapshot
  strategy: StrategyDef
  stage: number
  dd?: ReturnType<typeof drawdown>
  /** 하락장 기준 종목 시세 조회 실패 */
  error?: unknown
}) {
  const st = () => props.strategy
  const s = () => props.snap
  const dd = () => props.dd
  const stage = () => props.stage
  const base = createMemo(() => targets(st()))
  const today = createMemo(() => stageWeights(st(), stage()))
  return (
    <section class="card" ref={remember('strategy-plan')}>
      <h2>{st().bear ? '하락장 단계 · 오늘 매수' : '오늘 매수'}</h2>
      <Show when={st().bear}>
        {(b) => (
          <>
            <Show
              when={!props.error}
              fallback={
                <p class="err">
                  {b().market} 시세 조회 실패 (기본 계획 표시):{' '}
                  {String(
                    (props.error as Error | undefined)?.message ?? props.error,
                  )}
                </p>
              }
            >
              <Show
                when={dd()}
                fallback={<Skeleton height={46} width="240px" />}
              >
                {(d) => (
                  <div class="drawdown">
                    <span class="big">{pct(d().rate)}</span>
                    <span class="muted">
                      {b().market} 1년 고점 {usd(d().peak.v)} ({ymd(d().peak.t)}
                      ) 대비
                    </span>
                  </div>
                )}
              </Show>
            </Show>
            <ol class="stages">
              <Index each={stageLabels(b().steps)}>
                {(x, i) => (
                  <li aria-current={i === stage() ? 'step' : undefined}>
                    <b>{x().label}</b> {x().rule}
                  </li>
                )}
              </Index>
            </ol>
          </>
        )}
      </Show>
      <table>
        <thead>
          <tr>
            <th>종목</th>
            {/* 기본 비율과 다른 단계일 때만 비교 열 */}
            <Show when={stage()}>
              <th class="n">기본</th>
            </Show>
            <th class="n">오늘</th>
          </tr>
        </thead>
        <tbody>
          <Index each={st().assets}>
            {(x) => {
              const b = () => base()[x().symbol]! * st().daily
              const t = () => today()[x().symbol]! * st().daily
              return (
                <tr>
                  <td>{x().symbol}</td>
                  <Show when={stage()}>
                    <td class="n muted">{cents(b())}</td>
                  </Show>
                  <td
                    class="n"
                    classList={{
                      changed: Math.abs(t() - b()) >= 0.005,
                    }}
                  >
                    {cents(t())}
                  </td>
                </tr>
              )
            }}
          </Index>
        </tbody>
      </table>
      <p class="names">
        달러 주문 가능 현금 {usd(s().cash.usd)} · 매수{' '}
        {Math.floor(s().cash.usd / st().daily)}일분
      </p>
    </section>
  )
}

/** 매도 허용 트리거: 개별주 하나 · 묶음 합계가 한도를 넘었는지 */
function Switches(props: { a: Allocation; strategy: StrategyDef }) {
  const st = () => props.strategy
  const a = () => props.a
  const switches = () => [
    ...(st().limits?.single && a().single
      ? [
          {
            label: `개별주 최대 · ${a().single!.name}`,
            value: a().single!.weight,
            limit: st().limits!.single!,
          },
        ]
      : []),
    ...a().groups.flatMap((g) =>
      g.limit
        ? [{ label: `${g.name} 합계`, value: g.weight, limit: g.limit }]
        : [],
    ),
  ]
  const triggered = () => switches().some((x) => x.value > x.limit)
  return (
    <section class="card" ref={remember('strategy-switch')}>
      <h2>비상 스위치</h2>
      <Show
        when={switches().length}
        fallback={<p class="sub">매도 허용 한도가 없습니다.</p>}
      >
        <p class="sub">하나라도 한도를 넘으면 매도를 허용합니다.</p>
        <Index each={switches()}>
          {(x) => (
            <div class="switch">
              <div class="switch-head">
                <span>{x().label}</span>
                <span>
                  <b>{share(x().value)}</b>
                  <span class="muted"> / {share(x().limit)}</span>
                </span>
              </div>
              <Goal
                value={x().value}
                mark={x().limit}
                scale={Math.max(x().limit, x().value) * 1.25}
                over={x().value > x().limit}
                label={`${share(x().value)}, 한도 ${share(x().limit)}`}
              />
            </div>
          )}
        </Index>
        <p classList={{ muted: !triggered() }}>
          {triggered() ? (
            <b>한도 초과: 매도 허용 구간</b>
          ) : (
            '정상: 매도하지 않습니다'
          )}
        </p>
      </Show>
    </section>
  )
}

/** 지금 따르는 전략 점검: 목표 비중 · 하락장 단계별 오늘 매수 · 매도 허용 트리거 */
export function Strategy(props: { snap?: Snapshot }) {
  const [market] = createResource(
    () => activeStrategy()?.bear?.market,
    (symbol) => api('/api/candles', { symbol, range: '1y' }),
  )
  const dd = () => {
    const p = market.error ? undefined : market()
    return activeStrategy()?.bear && p?.length ? drawdown(p) : undefined
  }
  const stage = () => {
    const b = activeStrategy()?.bear
    return b && dd() ? stageOf(b.steps, dd()!.rate) : 0
  }
  // 부를 때마다 새 노드 (두 곳의 fallback 이 같은 노드를 나눠 쓰지 않게)
  const skeleton = () => (
    <>
      <SkeletonCard id="strategy-goals" height={640} />
      <div class="layout">
        <div class="col">
          <SkeletonCard id="strategy-plan" height={560} />
        </div>
        <div class="col">
          <SkeletonCard id="strategy-switch" height={260} />
        </div>
      </div>
    </>
  )

  return (
    <Show when={loaded()} fallback={skeleton()}>
      <Show
        when={activeStrategy()}
        fallback={
          // 전략이 아직 없는 사용자: 보유 비중이나 템플릿에서 시작
          <section class="card">
            <h2>전략 만들기</h2>
            <p class="sub">
              전략은 종목별 목표 비율과 매일 매수액입니다. 고른 뒤 바로 고칠 수
              있습니다.
            </p>
            <StrategyStart
              holdings={props.snap?.holdings}
              onPick={(draft) => {
                addStrategy(draft)
                openEditor()
              }}
            />
          </section>
        }
      >
        {(st) => (
          <Show when={props.snap} fallback={skeleton()}>
            {(s) => {
              const a = createMemo(() => allocate(s().holdings, st()))
              return (
                <>
                  <Targets snap={s()} a={a()} strategy={st()} />
                  <div class="layout">
                    <div class="col">
                      <TodayPlan
                        snap={s()}
                        strategy={st()}
                        stage={stage()}
                        dd={dd()}
                        error={market.error}
                      />
                    </div>
                    <div class="col">
                      <Switches a={a()} strategy={st()} />
                    </div>
                  </div>
                </>
              )
            }}
          </Show>
        )}
      </Show>
    </Show>
  )
}
