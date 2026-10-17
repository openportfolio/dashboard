import { createSignal, onCleanup, onMount } from 'solid-js'
import './Tooltip.css'

/** data-v(값, 강조) + data-tip(라벨) 속성이 있는 요소에 뜨는 툴팁. 마우스·키보드 포커스 공통 */
export function Tooltip() {
  const [tip, setTip] = createSignal<{
    v: string
    label: string
    x: number
    y: number
  }>()
  let el: HTMLDivElement | undefined

  const show = (e: Event) => {
    const t = (e.target as Element | null)?.closest?.<HTMLElement>('[data-tip]')
    if (!t) return setTip(undefined)
    const b = t.getBoundingClientRect()
    const [x, y] =
      e instanceof PointerEvent
        ? [e.clientX, e.clientY]
        : [b.left + b.width / 2, b.top]
    setTip({ v: t.dataset.v ?? '', label: t.dataset.tip ?? '', x, y })
  }
  const hide = () => setTip(undefined)

  onMount(() => {
    document.addEventListener('pointermove', show)
    document.addEventListener('focusin', show)
    document.addEventListener('focusout', hide)
    onCleanup(() => {
      document.removeEventListener('pointermove', show)
      document.removeEventListener('focusin', show)
      document.removeEventListener('focusout', hide)
    })
  })

  // display:none 이면 크기가 0 이라 위치 계산이 틀어지므로 visibility 로 숨긴다
  return (
    <div
      id="tip"
      ref={(e) => (el = e)}
      style={{
        visibility: tip() ? 'visible' : 'hidden',
        left: `${Math.min((tip()?.x ?? 0) + 12, innerWidth - (el?.offsetWidth ?? 0) - 8)}px`,
        top: `${Math.max(8, (tip()?.y ?? 0) - (el?.offsetHeight ?? 0) - 12)}px`,
      }}
    >
      <b>{tip()?.v}</b>
      <div>{tip()?.label}</div>
    </div>
  )
}
