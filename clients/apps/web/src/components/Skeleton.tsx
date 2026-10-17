import { onCleanup } from 'solid-js'
import './Skeleton.css'

// 다 그려진 요소의 높이를 기억해 두고, 다음 로딩 때 스켈레톤 높이로 쓴다.
// 보유 종목 수처럼 내용에 따라 높이가 달라도 새로고침 때 화면이 밀리지 않는다
const KEY = 'skeleton-height:'

/** 기억한 높이 (처음이면 fallback) */
export const remembered = (id: string, fallback: number) =>
  Number(localStorage.getItem(KEY + id)) || fallback

/** ref 로 쓴다: <section ref={remember('holdings')}> */
export const remember = (id: string) => (el: HTMLElement) => {
  const ro = new ResizeObserver(() => {
    if (el.offsetHeight) localStorage.setItem(KEY + id, String(el.offsetHeight))
  })
  ro.observe(el)
  onCleanup(() => ro.disconnect())
}

/** 로딩 자리표시 */
export function Skeleton(props: { height: number; width?: string }) {
  return (
    <div
      class="skeleton"
      role="status"
      aria-label="불러오는 중"
      style={{ height: `${props.height}px`, width: props.width }}
    />
  )
}

/** 카드 하나 크기의 스켈레톤. id 는 실제 카드의 remember(id) 와 같게 */
export const SkeletonCard = (props: { id: string; height: number }) => (
  <section
    class="card skeleton-card"
    role="status"
    aria-label="불러오는 중"
    style={{ height: `${remembered(props.id, props.height)}px` }}
  >
    <div class="skeleton" style={{ height: '18px', width: '30%' }} />
    <div class="skeleton" />
  </section>
)
