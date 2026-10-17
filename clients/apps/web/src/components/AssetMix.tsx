import type { Snapshot } from '@portfolio/client'
import { Index, Show } from 'solid-js'
import { colorScale, share, usd, won } from '../lib/ui'
import { remember, SkeletonCard } from './Skeleton'
import './AssetMix.css'

const assetColor = colorScale()

export function AssetMix(props: { snap?: Snapshot }) {
  return (
    <Show
      when={props.snap}
      fallback={
        <>
          <SkeletonCard id="mix" height={320} />
          <SkeletonCard id="currency" height={220} />
        </>
      }
    >
      {(s) => {
        const usdShare = () => {
          const { KRW, USD } = s().exposure
          return KRW + USD ? USD / (KRW + USD) : 0
        }
        return (
          <>
            <div class="card" ref={remember('mix')}>
              <h2>자산 구성</h2>
              <div class="stack">
                <Index each={s().assetClasses}>
                  {(c) => (
                    <div
                      tabindex="0"
                      style={{
                        flex: `${c().weight} 1 0`,
                        background: assetColor(c().name),
                      }}
                      data-v={share(c().weight)}
                      data-tip={`${c().name}\n${won.format(c().value)}원`}
                    />
                  )}
                </Index>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>자산군</th>
                    <th class="n">비중</th>
                    <th class="n">금액</th>
                  </tr>
                </thead>
                <tbody>
                  <Index each={s().assetClasses}>
                    {(c) => (
                      <tr>
                        <td>
                          <span
                            class="sw"
                            style={{ background: assetColor(c().name) }}
                          />
                          {c().name}
                        </td>
                        <td class="n">{share(c().weight)}</td>
                        <td class="n">{won.format(c().value)}</td>
                      </tr>
                    )}
                  </Index>
                </tbody>
              </table>
            </div>

            <div class="card" ref={remember('currency')}>
              <h2>통화 노출</h2>
              {/* 두 값의 비율이라 막대 하나(달러)와 같은 색 계열 트랙으로 표시 */}
              <div
                class="meter"
                tabindex="0"
                data-v={`달러 ${share(usdShare())}`}
                data-tip={`원화 ${share(1 - usdShare())}`}
              >
                <div style={{ width: share(usdShare()) }} />
              </div>
              <table>
                <thead>
                  <tr>
                    <th>통화</th>
                    <th class="n">비중</th>
                    <th class="n">원화 환산</th>
                    <th class="n">주문 가능 현금</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <span class="sw" style={{ background: 'var(--s1)' }} />
                      달러
                    </td>
                    <td class="n">{share(usdShare())}</td>
                    <td class="n">{won.format(s().exposure.USD)}</td>
                    <td class="n">{usd(s().cash.usd)}</td>
                  </tr>
                  <tr>
                    <td>
                      <span class="sw meter-track" />
                      원화
                    </td>
                    <td class="n">{share(1 - usdShare())}</td>
                    <td class="n">{won.format(s().exposure.KRW)}</td>
                    <td class="n">{won.format(s().cash.krw)}원</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )
      }}
    </Show>
  )
}
