// 첫 화면부터 테마를 맞춘다 (깜빡임 방지). 규칙은 src/lib/theme.ts 와 같다.
// 따로 둔 파일이라 앱의 CSP(script-src 'self')에 걸리지 않는다
try {
  const t = localStorage.getItem('theme')
  const dark =
    t === 'dark' ||
    (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
} catch {}
