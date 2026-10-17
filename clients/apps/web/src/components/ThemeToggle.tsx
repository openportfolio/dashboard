import { type Theme, setTheme, theme } from '../lib/theme'

const NEXT: Record<Theme, Theme> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
}
const NAME: Record<Theme, string> = {
  system: '시스템 설정',
  light: '라이트',
  dark: '다크',
}
const ICON: Record<Theme, string> = {
  // 반쯤 찬 원 · 해 · 달
  system: 'M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2Zm0 1.5v9a4.5 4.5 0 0 1 0-9Z',
  light:
    'M8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM7.25 1h1.5v2h-1.5Zm0 12h1.5v2h-1.5ZM1 7.25h2v1.5H1Zm12 0h2v1.5h-2ZM2.7 3.76l1.06-1.06 1.42 1.42-1.06 1.06Zm8.12 8.12 1.06-1.06 1.42 1.42-1.06 1.06ZM2.7 12.24l1.42-1.42 1.06 1.06-1.42 1.42Zm8.12-8.12 1.42-1.42 1.06 1.06-1.42 1.42Z',
  dark: 'M6.2 1.6A6.5 6.5 0 1 0 14.4 9.8 5.2 5.2 0 0 1 6.2 1.6Z',
}

/** 시스템 설정 → 라이트 → 다크 순으로 바꾼다 */
export function ThemeToggle() {
  const label = () => `테마: ${NAME[theme()]} (누르면 ${NAME[NEXT[theme()]]})`
  return (
    <button
      class="icon-btn"
      aria-label={label()}
      title={label()}
      onClick={() => setTheme(NEXT[theme()])}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path d={ICON[theme()]} fill="currentColor" fill-rule="evenodd" />
      </svg>
    </button>
  )
}
