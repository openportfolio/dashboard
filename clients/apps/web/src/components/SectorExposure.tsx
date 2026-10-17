import type { Sector } from '@portfolio/client'
import { createMemo, Index, Show } from 'solid-js'
import { colorOf, OTHER, share, won } from '../lib/ui'
import { remember } from './Skeleton'
import './SectorExposure.css'

const MIN = 0.01 // 1% 미만은 '기타'로 접는다
const light = (c: string) => `color-mix(in oklab, ${c} 38%, var(--surface))`

export function SectorExposure(props: {
  sectors: Sector[]
  etfAsOf: Record<string, string>
}) {
  const rows = createMemo(() => {
    const big = props.sectors.filter((s) => s.weight >= MIN)
    const small = props.sectors.filter((s) => s.weight < MIN)
    if (!small.length) return big
    const sum = (f: 'value' | 'weight' | 'direct' | 'etf') =>
      small.reduce((a, s) => a + s[f], 0)
    return [
      ...big,
      {
        name: `기타 ${small.length}개`,
        value: sum('value'),
        weight: sum('weight'),
        direct: sum('direct'),
        etf: sum('etf'),
        symbols: small.map((s) => s.name),
        etfs: [],
      },
    ]
  })
  const max = createMemo(() => Math.max(0.0001, ...rows().map((r) => r.weight)))
  const color = (r: Sector) =>
    r.name.startsWith('기타 ') ? OTHER : colorOf(r.name)
  const asOf = () =>
    Object.entries(props.etfAsOf)
      .map(([symbol, date]) => `${symbol} ${date}`)
      .join(' · ')

  return (
    <section class="card" ref={remember('sectors')}>
      <h2>섹터 노출</h2>
      <p class="sub">
        GICS 기준, 주식 평가금액 대비. ETF 는 SEC 공시 보유종목으로 펼쳤습니다.
      </p>
      <div class="legend" style={{ 'margin-bottom': '10px' }}>
        <span>
          <span class="sw" style={{ background: 'var(--ink2)' }} />
          직접 보유
        </span>
        <span>
          <span class="sw" style={{ background: light('var(--ink2)') }} />
          ETF 경유
        </span>
      </div>
      <div class="xbars">
        <Index each={rows()}>
          {(r) => {
            const w = (v: number) =>
              `${((v / r().value) * r().weight * 100) / max()}%`
            return (
              <div
                class="xbar"
                tabindex="0"
                data-v={share(r().weight)}
                data-tip={[
                  `${r().name} · ${won.format(r().value)}원`,
                  r().direct &&
                    `직접 ${won.format(r().direct)}원 (${r().symbols.join(', ')})`,
                  r().etf &&
                    `ETF ${won.format(r().etf)}원 (${r().etfs.join(', ')})`,
                  r().name.startsWith('기타 ') && r().symbols.join(', '),
                ]
                  .filter(Boolean)
                  .join('\n')}
              >
                <span class="nm">{r().name}</span>
                <div class="xtrack">
                  {r().direct > 0 && (
                    <div
                      style={{ width: w(r().direct), background: color(r()) }}
                    />
                  )}
                  {r().etf > 0 && (
                    <div
                      style={{
                        width: w(r().etf),
                        background: light(color(r())),
                      }}
                    />
                  )}
                </div>
                <span class="xval">{share(r().weight)}</span>
              </div>
            )
          }}
        </Index>
      </div>

      <details class="table-view">
        <summary>표로 보기</summary>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>섹터</th>
                <th class="n">비중</th>
                <th class="n">금액</th>
                <th class="n">직접 보유</th>
                <th class="n">ETF 경유</th>
              </tr>
            </thead>
            <tbody>
              <Index each={props.sectors}>
                {(s) => (
                  <tr>
                    <td>
                      {s().name}
                      <div class="names">
                        {[
                          ...s().symbols,
                          ...s().etfs.map((e) => `${e}(ETF)`),
                        ].join(', ')}
                      </div>
                    </td>
                    <td class="n">{share(s().weight)}</td>
                    <td class="n">{won.format(s().value)}</td>
                    <td class="n">
                      {s().direct ? won.format(s().direct) : '–'}
                    </td>
                    <td class="n">{s().etf ? won.format(s().etf) : '–'}</td>
                  </tr>
                )}
              </Index>
            </tbody>
          </table>
        </div>
        <Show when={asOf()}>
          <p class="names">ETF 보유종목 공시 기준일 (N-PORT): {asOf()}</p>
        </Show>
      </details>
    </section>
  )
}
