import { api, put, type Strategy, type StrategyState } from '@portfolio/client'
import { createSignal } from 'solid-js'
import { BENCHMARKS } from './strategy'

// 전략 목록은 서버 DB 에 하나로 저장한다 (어느 기기에서 열어도 같다).
// 화면에는 바꾸는 즉시 반영하고, 서버 저장은 0.4초 모아서 한 번 (편집기는 글자마다 바뀐다)

const EMPTY: StrategyState = {
  list: [],
  active: null,
  compare: [],
  benchmarks: BENCHMARKS.map((b) => b.symbol),
}
const [state, setState] = createSignal(EMPTY)
/** 서버에서 한 번이라도 읽었는지 (그 전엔 '전략 없음' 화면을 띄우지 않는다) */
const [loaded, setLoaded] = createSignal(false)
const [syncError, setSyncError] = createSignal<string>()
export { loaded, syncError }

let timer: ReturnType<typeof setTimeout> | undefined
const flush = () =>
  put('/api/strategies', state()).then(
    () => setSyncError(),
    (e: Error) => setSyncError(`전략 저장 실패: ${e.message}`),
  )
const save = (next: StrategyState) => {
  setState(next)
  clearTimeout(timer)
  timer = setTimeout(() => {
    timer = undefined
    flush()
  }, 400)
}

/** 서버에서 다시 읽는다 */
async function load() {
  try {
    const server = await api('/api/strategies')
    if (timer) return // 저장 대기 중이면 화면 쪽이 최신
    setState(server ?? EMPTY)
    setLoaded(true)
  } catch (e) {
    setSyncError(`전략을 불러오지 못했습니다: ${(e as Error).message}`)
  }
}
load()
// 다른 기기에서 고쳤을 수 있으니 탭으로 돌아오면 다시 읽는다
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') load()
})

export const strategies = () => state().list

/** 전략 목록 순서대로 고정 색. 빨강·파랑(등락)과 벤치마크 색(주황·초록·남색)은 피한다 */
const COLORS = ['var(--ink)', 'var(--s5)', 'var(--s6)', 'var(--s4)']
export const strategyColor = (id: string) =>
  COLORS[
    Math.max(
      0,
      state().list.findIndex((s) => s.id === id),
    ) % COLORS.length
  ]!

/** 지금 따르는 전략 (전략이 없으면 undefined) */
export const activeStrategy = (): Strategy | undefined =>
  state().list.find((s) => s.id === state().active) ?? state().list[0]
export const compared = () =>
  state().list.filter((s) => state().compare.includes(s.id))
export const benchmarks = () =>
  BENCHMARKS.filter((b) => state().benchmarks.includes(b.symbol))

export const setActive = (id: string) => save({ ...state(), active: id })

const toggle = (xs: string[], x: string) =>
  xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]
export const toggleCompare = (id: string) =>
  save({ ...state(), compare: toggle(state().compare, id) })
export const toggleBenchmark = (symbol: string) =>
  save({ ...state(), benchmarks: toggle(state().benchmarks, symbol) })

export const updateStrategy = (id: string, patch: Partial<Strategy>) =>
  save({
    ...state(),
    list: state().list.map((s) => (s.id === id ? { ...s, ...patch } : s)),
  })

/** 새 전략으로 추가해 지금 따르는 전략 · 비교 대상으로 삼는다 */
export function addStrategy(draft: Omit<Strategy, 'id'>) {
  const s = { ...structuredClone(draft), id: crypto.randomUUID() }
  save({
    ...state(),
    list: [...state().list, s],
    active: s.id,
    compare: [...state().compare, s.id],
  })
  return s.id
}

/** id 는 addStrategy 가 새로 붙인다 */
export function duplicateStrategy(id: string) {
  const src = state().list.find((s) => s.id === id)!
  return addStrategy({ ...src, name: `${src.name} 사본` })
}

/** 마지막 하나도 지울 수 있다 (그러면 '전략 만들기' 화면) */
export function removeStrategy(id: string) {
  const list = state().list.filter((s) => s.id !== id)
  save({
    ...state(),
    list,
    active: state().active === id ? (list[0]?.id ?? null) : state().active,
    compare: state().compare.filter((x) => x !== id),
  })
}
