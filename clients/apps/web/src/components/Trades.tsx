import { api, type Snapshot } from '@portfolio/client'
import { createMemo, createResource, createSignal, Index, Show } from 'solid-js'
import { load } from '../lib/load'
import {
  capitalGains,
  DEDUCTION,
  fxOn,
  RATE,
  taxOf,
  unrealized,
} from '../lib/tax'
import { dir, money, qty, sWon, won } from '../lib/ui'
import { remember, SkeletonCard } from './Skeleton'
import './Trades.css'

const when = (t: number) =>
  new Date(t).toLocaleString('ko-KR', {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

/** 해외주식 양도소득세 추정 + 체결 내역 */
export function Trades(props: { snap?: Snapshot }) {
  const [data] = createResource(async () => {
    const [fills, fx] = await Promise.all([
      api('/api/fills'),
      load('/api/candles', 'KRW=X'),
    ])
    return { fills, fx }
  })
  const year = String(new Date().getFullYear())
  const name = (symbol: string) =>
    props.snap?.holdings.find((h) => h.symbol === symbol)?.name ?? symbol

  const tax = createMemo(() => {
    const d = data()
    if (!d) return
    const g = capitalGains(d.fills, fxOn(d.fx))
    const gain = g.years.get(year)?.gain ?? 0
    const u = props.snap && unrealized(props.snap.holdings, g.held)
    return { ...g, gain, u }
  })
  /** 매수 기록 없이 판 몫 (0.01주 미만은 소수점 반올림 찌꺼기라 뺀다) */
  const unmatched = () =>
    [...(tax()?.unmatched ?? [])].filter(([, q]) => q >= 0.01)
  const [shown, setShown] = createSignal(30)
  const recent = () => [...(data()?.fills ?? [])].reverse().slice(0, shown())

  return (
    <Show
      when={!data.error}
      fallback={<p class="err">{String(data.error?.message ?? data.error)}</p>}
    >
      <Show
        when={tax()}
        fallback={
          <>
            <SkeletonCard id="tax" height={420} />
            <SkeletonCard id="fills" height={760} />
          </>
        }
      >
        {(t) => {
          const sold = () => [...(t().years.get(year)?.bySymbol ?? [])]
          const now = () =>
            t().u ? taxOf(t().gain + t().u!.gain) - taxOf(t().gain) : 0
          return (
            <>
              <section class="card" ref={remember('tax')}>
                <h2>해외주식 양도소득세 · {year}년</h2>
                <p class="sub">
                  한 해 실현 손익에서 {won.format(DEDUCTION / 10_000)}만원을
                  빼고 {RATE * 100}%. 다음 해 5월에 신고합니다.
                </p>
                <div class="tax-sum">
                  <div>
                    <div class="label">올해 실현 손익</div>
                    <b class={dir(t().gain)}>{sWon(t().gain)}</b>
                  </div>
                  <div>
                    <div class="label">공제 남은 한도</div>
                    <b>
                      {won.format(
                        Math.max(0, DEDUCTION - Math.max(0, t().gain)),
                      )}
                      원
                    </b>
                  </div>
                  <div>
                    <div class="label">예상 세금</div>
                    <b>{won.format(taxOf(t().gain))}원</b>
                  </div>
                  <Show when={t().u}>
                    {(u) => (
                      <div>
                        <div class="label">지금 모두 팔면</div>
                        <b class={dir(u().gain)}>{sWon(u().gain)}</b>
                        <div class="names">세금 {won.format(now())}원 더</div>
                      </div>
                    )}
                  </Show>
                </div>
                <Show when={sold().length}>
                  <div class="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>올해 판 종목</th>
                          <th class="n">수량</th>
                          <th class="n">양도가</th>
                          <th class="n">취득가</th>
                          <th class="n">손익</th>
                        </tr>
                      </thead>
                      <tbody>
                        <Index each={sold()}>
                          {(x) => (
                            <tr>
                              <td>{name(x()[0])}</td>
                              <td class="n">{qty(x()[1].qty)}</td>
                              <td class="n">{won.format(x()[1].proceeds)}</td>
                              <td class="n">{won.format(x()[1].cost)}</td>
                              <td
                                class={`n ${dir(x()[1].proceeds - x()[1].cost)}`}
                              >
                                {sWon(x()[1].proceeds - x()[1].cost)}
                              </td>
                            </tr>
                          )}
                        </Index>
                      </tbody>
                    </table>
                  </div>
                </Show>
                <div class="table-scroll">
                  <table class="tax-years">
                    <thead>
                      <tr>
                        <th>연도</th>
                        <th class="n">실현 손익</th>
                        <th class="n">세금 (추정)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <Index
                        each={[...t().years].sort(([a], [b]) =>
                          b.localeCompare(a),
                        )}
                      >
                        {(y) => (
                          <tr>
                            <td>{y()[0]}</td>
                            <td class={`n ${dir(y()[1].gain)}`}>
                              {sWon(y()[1].gain)}
                            </td>
                            <td class="n">
                              {won.format(taxOf(y()[1].gain))}원
                            </td>
                          </tr>
                        )}
                      </Index>
                    </tbody>
                  </table>
                </div>
                <p class="names">
                  선입선출, 취득 · 양도 모두 결제일 환율 (Yahoo KRW=X 종가라
                  신고용 기준환율과 조금 다를 수 있음), 수수료 반영. 토스 Open
                  API 로 조회되는 주문만 셉니다
                  <Show when={data()!.fills[0]}>
                    {(f) =>
                      ` (${new Date(f().at).toISOString().slice(0, 10)} 부터 ${data()!.fills.length}건)`
                    }
                  </Show>
                  .
                  <Show when={unmatched().length}>
                    {' '}
                    매수 기록 없이 판 몫은 뺐습니다:{' '}
                    {unmatched()
                      .map(([s, q]) => `${name(s)} ${qty(q)}주`)
                      .join(', ')}
                    .
                  </Show>
                  <Show when={t().u?.rows.some((r) => r.missing > 1e-6)}>
                    {' '}
                    매수 기록보다 많이 가진 종목은 기록분만 셉니다:{' '}
                    {t()
                      .u!.rows.filter((r) => r.missing > 1e-6)
                      .map((r) => `${r.holding.name} ${qty(r.missing)}주`)
                      .join(', ')}
                    .
                  </Show>{' '}
                  세무 신고용이 아닌 참고용입니다.
                </p>
              </section>

              <section class="card" ref={remember('fills')}>
                <h2>체결 내역</h2>
                <p class="sub">최근 순. 소수점 매수도 한 건씩 나옵니다.</p>
                <div class="table-scroll">
                  <table class="fills">
                    <thead>
                      <tr>
                        <th>체결</th>
                        <th>종목</th>
                        <th />
                        <th class="n">수량</th>
                        <th class="n">체결가</th>
                        <th class="n">금액</th>
                        <th class="n">수수료</th>
                      </tr>
                    </thead>
                    <tbody>
                      <Index each={recent()}>
                        {(f) => (
                          <tr>
                            <td class="names">{when(f().at)}</td>
                            <td>{name(f().symbol)}</td>
                            <td>
                              <span
                                class="side"
                                classList={{ sell: f().side === 'SELL' }}
                              >
                                {f().side === 'BUY' ? '매수' : '매도'}
                              </span>
                            </td>
                            <td class="n">{qty(f().quantity)}</td>
                            <td class="n">{money(f().price, f().currency)}</td>
                            <td class="n">{money(f().amount, f().currency)}</td>
                            <td class="n">
                              {f().commission
                                ? money(f().commission, f().currency)
                                : '–'}
                            </td>
                          </tr>
                        )}
                      </Index>
                    </tbody>
                  </table>
                </div>
                <Show when={shown() < (data()?.fills.length ?? 0)}>
                  <div class="filters">
                    <button onClick={() => setShown(shown() + 100)}>
                      더 보기 ({won.format(data()!.fills.length - shown())}건
                      남음)
                    </button>
                  </div>
                </Show>
              </section>
            </>
          )
        }}
      </Show>
    </Show>
  )
}
