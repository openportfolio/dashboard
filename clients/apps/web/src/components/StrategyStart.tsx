import type { Holding } from '@portfolio/client'
import { For, Show } from 'solid-js'
import { fromHoldings, type Strategy, TEMPLATES } from '../lib/strategy'
import './StrategyStart.css'

/** 새 전략의 출발점 고르기: 지금 보유 비중 또는 템플릿 */
export function StrategyStart(props: {
  holdings?: Holding[]
  onPick: (draft: Omit<Strategy, 'id'>) => void
}) {
  const mine = () => props.holdings && fromHoldings(props.holdings)
  return (
    <div class="start">
      <Show when={mine()}>
        {(m) => (
          <button class="choice" onClick={() => props.onPick(m())}>
            <b>지금 보유 비중으로</b>
            <span>
              미국 종목 {m().assets.length}개를 지금 평가금액 비율대로
            </span>
          </button>
        )}
      </Show>
      <For each={TEMPLATES}>
        {(t) => (
          <button class="choice" onClick={() => props.onPick(t.strategy)}>
            <b>{t.strategy.name}</b>
            <span>{t.help}</span>
          </button>
        )}
      </For>
    </div>
  )
}
