import { createSignal } from 'solid-js'

// 화면 테마. 'system' 은 OS 설정을 따른다. <html data-theme> 로 style.css 의 다크 토큰을 켠다.
// 첫 화면은 public/theme.js 가 같은 규칙으로 먼저 맞춘다 (깜빡임 방지)
export type Theme = 'system' | 'light' | 'dark'

const KEY = 'theme'
const system = matchMedia('(prefers-color-scheme: dark)')
const isDark = (t: Theme) => t === 'dark' || (t === 'system' && system.matches)

const saved = localStorage.getItem(KEY)
const [theme, setSaved] = createSignal<Theme>(
  saved === 'light' || saved === 'dark' ? saved : 'system',
)
/** 지금 다크인지 (캔버스 차트가 색을 다시 읽는 기준) */
const [dark, setDark] = createSignal(isDark(theme()))
export { dark, theme }

const apply = () => {
  document.documentElement.dataset.theme = isDark(theme()) ? 'dark' : 'light'
  setDark(isDark(theme()))
}
system.addEventListener('change', apply)
apply()

export function setTheme(t: Theme) {
  if (t === 'system') localStorage.removeItem(KEY)
  else localStorage.setItem(KEY, t)
  setSaved(t)
  apply()
}
