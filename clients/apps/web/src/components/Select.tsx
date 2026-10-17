import { For, Show } from 'solid-js'
import './Select.css'

/** 브라우저가 select 를 꾸밀 수 있는지 (Chrome 135+). 안 되면 기본 select 에 이름만 보인다 */
const rich =
  typeof CSS !== 'undefined' && CSS.supports('appearance', 'base-select')

interface SelectOption<T extends string> {
  value: T
  label: string
  /** 목록에서 이름 아래 회색 한 줄 */
  detail?: string
  /** 이름 앞 색 점 */
  color?: string
}

const Content = (props: { o?: SelectOption<string>; detail?: boolean }) => (
  <Show when={props.o}>
    {(o) => (
      <>
        <Show when={o().color}>
          <span class="dot" style={{ background: o().color }} />
        </Show>
        <span class="label">{o().label}</span>
        <Show when={props.detail && o().detail}>
          <span class="detail">{o().detail}</span>
        </Show>
      </>
    )}
  </Show>
)

/**
 * 꾸민 select. 브라우저 기본 select (appearance: base-select) 라 키보드 · 글자 검색 ·
 * 바깥 클릭 닫기 · 스크린리더를 브라우저가 맡는다.
 * option 안 요소는 JSX 식으로 넣는다: 정적 템플릿에 두면 옛 HTML 파서가 option 안 태그를 지워
 * Solid 가 노드를 못 찾는다. 버튼 내용도 직접 그려 이름을 바꾸면 바로 반영된다 (selectedcontent 는 선택이 바뀔 때만 갱신)
 */
export function Select<T extends string>(props: {
  value: T
  options: SelectOption<T>[]
  onChange: (value: T) => void
  label: string
  class?: string
}) {
  const selected = () => props.options.find((o) => o.value === props.value)
  return (
    <select
      class={`select ${props.class ?? ''}`}
      aria-label={props.label}
      onChange={(e) => props.onChange(e.currentTarget.value as T)}
    >
      {rich && (
        <button>
          <Content o={selected()} />
        </button>
      )}
      <For each={props.options}>
        {(o) => (
          <option value={o.value} selected={o.value === props.value}>
            {rich ? <Content o={o} detail /> : o.label}
          </option>
        )}
      </For>
    </select>
  )
}
