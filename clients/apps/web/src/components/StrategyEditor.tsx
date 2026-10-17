import type { Holding } from '@portfolio/client'
import { createSignal, For, Index, Show } from 'solid-js'
import {
  activeStrategy,
  addStrategy,
  duplicateStrategy,
  loaded,
  removeStrategy,
  updateStrategy,
} from '../lib/strategies'
import {
  ROLES,
  type Role,
  type Strategy,
  type StrategyAsset,
} from '../lib/strategy'
import { cents, usd } from '../lib/ui'
import { Select } from './Select'
import { StrategyStart } from './StrategyStart'
import './StrategyEditor.css'

/** 서버 /api/candles 검증과 같은 문자 (대문자로 바꿔 저장) */
const SYMBOL = /^[A-Z0-9.-]{1,12}$/

type NumberInput = InputEvent & { currentTarget: HTMLInputElement }
const num = (e: NumberInput) => e.currentTarget.valueAsNumber

/** % 입력칸. 값은 소수 (0.15 = 15%), 비우면 undefined. negative 면 음수만 받는다 */
function PercentField(props: {
  label: string
  value?: number
  negative?: boolean
  onChange: (v: number | undefined) => void
}) {
  return (
    <label>
      {props.label}{' '}
      <input
        class="num"
        type="number"
        min={props.negative ? undefined : 0}
        max={props.negative ? -1 : undefined}
        value={
          props.value === undefined ? '' : Math.round(props.value * 1000) / 10
        }
        onInput={(e) => {
          const v = num(e)
          props.onChange(Number.isNaN(v) ? undefined : v / 100)
        }}
      />
      %
    </label>
  )
}

// 시트는 머리글에 하나뿐이라 모듈에 둔다 (전략 탭의 '전략 만들기'에서도 연다)
let dialog: HTMLDialogElement | undefined
const [choosing, setChoosing] = createSignal(false)
/** 시트 열기. choose 면 새 전략 고르기부터 */
export const openEditor = (choose = false) => {
  setChoosing(choose)
  dialog?.showModal()
}

/**
 * 머리글의 '편집'(전략이 없으면 '전략 만들기') 버튼 + 시트(모달).
 * 지금 따르는 전략을 편집하고, 바꾸는 즉시 저장된다. 새 전략은 보유 비중 · 템플릿에서 고른다
 */
export function StrategyEditor(props: { holdings?: Holding[] }) {
  // Esc · 포커스 가두기 · 닫은 뒤 버튼으로 포커스 복귀는 브라우저(showModal)가 맡는다
  const close = () => dialog?.close()
  const picking = () => choosing() || !activeStrategy()
  return (
    <>
      <Show when={loaded()}>
        <button onClick={() => openEditor()}>
          {activeStrategy() ? '편집' : '전략 만들기'}
        </button>
      </Show>
      <dialog
        ref={(e) => (dialog = e)}
        class="sheet"
        aria-labelledby="sheet-title"
        // 시트 바깥(배경)을 누르면 닫는다. 바꾼 값은 이미 저장돼 있다
        onClick={(e) => e.target === dialog && close()}
      >
        <header class="sheet-head">
          <div>
            <div class="names">{picking() ? '새 전략' : '전략 편집'}</div>
            <h2 id="sheet-title">
              {picking() ? '어디서 시작할까요?' : activeStrategy()!.name}
            </h2>
          </div>
          <button class="done" onClick={close}>
            {picking() ? '닫기' : '완료'}
          </button>
        </header>
        <div class="sheet-body">
          <Show
            when={!picking() && activeStrategy()}
            fallback={
              <StrategyStart
                holdings={props.holdings}
                onPick={(draft) => {
                  addStrategy(draft)
                  setChoosing(false) // 고른 전략을 바로 고칠 수 있게
                }}
              />
            }
          >
            {(st) => (
              <Form
                strategy={st()}
                onNew={() => setChoosing(true)}
                onRemove={close}
              />
            )}
          </Show>
        </div>
      </dialog>
    </>
  )
}

function Form(props: {
  strategy: Strategy
  onNew: () => void
  onRemove: () => void
}) {
  const s = () => props.strategy
  const set = (patch: Partial<Strategy>) => updateStrategy(s().id, patch)
  const setAsset = (i: number, patch: Partial<StrategyAsset>) =>
    set({
      assets: s().assets.map((a, j) => (j === i ? { ...a, ...patch } : a)),
    })
  const total = () => s().assets.reduce((a, x) => a + x.weight, 0)
  const groups = () => [
    ...new Set(s().assets.flatMap((a) => (a.group ? [a.group] : []))),
  ]
  const [symbol, setSymbol] = createSignal('')
  const add = (e: SubmitEvent) => {
    e.preventDefault()
    const sym = symbol().trim().toUpperCase()
    if (!SYMBOL.test(sym) || s().assets.some((a) => a.symbol === sym)) return
    set({ assets: [...s().assets, { symbol: sym, weight: 0, role: 'hold' }] })
    setSymbol('')
  }
  const setStep = (i: 0 | 1, v: number | undefined) => {
    const b = s().bear!
    if (!(v! < 0)) return
    const steps: [number, number] = [...b.steps]
    steps[i] = v!
    set({ bear: { ...b, steps } })
  }
  // 0 이하나 빈칸이면 한도 없음
  const positive = (v: number | undefined) => (v! > 0 ? v : undefined)

  return (
    <div class="editor">
      <div class="filters">
        <label>
          이름{' '}
          <input
            class="text"
            value={s().name}
            onInput={(e) => set({ name: e.currentTarget.value })}
          />
        </label>
        <label>
          매일 ${' '}
          <input
            class="num"
            type="number"
            min="1"
            value={s().daily}
            onInput={(e) => num(e) > 0 && set({ daily: num(e) })}
          />
        </label>
      </div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>종목</th>
              <th class="n">비율 %</th>
              <th>묶음</th>
              <th>하락장 역할</th>
              <th class="n">일 매수</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <Index each={s().assets}>
              {(a, i) => (
                <tr>
                  <td>{a().symbol}</td>
                  <td class="n">
                    <input
                      class="num"
                      type="number"
                      min="0"
                      step="1"
                      aria-label={`${a().symbol} 비율 (%)`}
                      value={a().weight}
                      onInput={(e) =>
                        setAsset(i, { weight: Math.max(0, num(e) || 0) })
                      }
                    />
                  </td>
                  <td>
                    <input
                      class="text short"
                      aria-label={`${a().symbol} 묶음`}
                      placeholder="–"
                      value={a().group ?? ''}
                      onInput={(e) =>
                        setAsset(i, {
                          group: e.currentTarget.value.trim() || undefined,
                        })
                      }
                    />
                  </td>
                  <td>
                    <Select
                      label={`${a().symbol} 하락장 역할`}
                      value={a().role}
                      onChange={(role) => setAsset(i, { role })}
                      options={(
                        Object.entries(ROLES) as [Role, (typeof ROLES)[Role]][]
                      ).map(([value, r]) => ({
                        value,
                        label: r.label,
                        detail: r.help,
                      }))}
                    />
                  </td>
                  <td class="n">
                    {cents(total() ? (s().daily * a().weight) / total() : 0)}
                  </td>
                  <td>
                    <button
                      class="icon-btn"
                      aria-label={`${a().symbol} 빼기`}
                      onClick={() =>
                        set({ assets: s().assets.filter((_, j) => j !== i) })
                      }
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              )}
            </Index>
          </tbody>
          <tfoot>
            <tr>
              <td>합계</td>
              <td class="n">{total()}%</td>
              <td colspan="2" />
              <td class="n">{usd(s().daily)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <form class="filters" onSubmit={add}>
        <input
          class="text short"
          aria-label="추가할 종목 심볼"
          placeholder="예: VOO"
          value={symbol()}
          onInput={(e) => setSymbol(e.currentTarget.value)}
        />
        <button type="submit">종목 추가</button>
      </form>

      <fieldset>
        <legend>하락장 룰</legend>
        <label>
          <input
            type="checkbox"
            checked={!!s().bear}
            onChange={(e) =>
              set({
                bear: e.currentTarget.checked
                  ? { market: 'QQQ', steps: [-0.2, -0.3] }
                  : undefined,
              })
            }
          />{' '}
          적용
        </label>
        <Show when={s().bear}>
          {(b) => (
            <>
              <label>
                기준 종목 1년 고점 대비{' '}
                <input
                  class="text short"
                  aria-label="하락장 기준 종목"
                  value={b().market}
                  onChange={(e) => {
                    const m = e.currentTarget.value.trim().toUpperCase()
                    if (SYMBOL.test(m)) set({ bear: { ...b(), market: m } })
                  }}
                />
              </label>
              <PercentField
                label="2단계"
                negative
                value={b().steps[0]}
                onChange={(v) => setStep(0, v)}
              />
              <PercentField
                label="3단계"
                negative
                value={b().steps[1]}
                onChange={(v) => setStep(1, v)}
              />
            </>
          )}
        </Show>
      </fieldset>

      <fieldset>
        <legend>매도 허용 한도 (비워 두면 없음)</legend>
        <PercentField
          label="개별주 하나"
          value={s().limits?.single}
          onChange={(v) =>
            set({ limits: { ...s().limits, single: positive(v) } })
          }
        />
        <For each={groups()}>
          {(g) => (
            <PercentField
              label={`${g} 합계`}
              value={s().limits?.groups?.[g]}
              onChange={(v) =>
                set({
                  limits: {
                    ...s().limits,
                    groups: {
                      ...s().limits?.groups,
                      [g]: positive(v),
                    } as Record<string, number>,
                  },
                })
              }
            />
          )}
        </For>
      </fieldset>

      <div class="filters">
        {/* 새 전략은 바로 따르는 전략이 되고 백테스트 비교에도 들어간다 */}
        <button onClick={() => duplicateStrategy(s().id)}>
          복제해서 새 전략
        </button>
        <button onClick={() => props.onNew()}>새 전략…</button>
        <button
          onClick={() => {
            if (!confirm(`'${s().name}' 전략을 지울까요?`)) return
            removeStrategy(s().id)
            props.onRemove() // 남은 전략이 대신 열리지 않게 닫는다
          }}
        >
          삭제
        </button>
      </div>
    </div>
  )
}
