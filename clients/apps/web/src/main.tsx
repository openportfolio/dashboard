import { api } from '@portfolio/client'
import { render } from 'solid-js/web'
// 전역 CSS 를 먼저: 컴포넌트 CSS(각 컴포넌트가 import)가 뒤에 와서 덮어쓸 수 있게
import './style.css'
import { App } from './App'
import { Setup } from './components/Setup'

const root = document.getElementById('app')!
// 키가 없거나(처음) ?setup 으로 오면 연결 화면. API 서버가 꺼져 있으면 대시보드가 오류를 보여 준다
api('/api/setup').then(
  (s) =>
    render(
      () =>
        !s.keys || location.search === '?setup' ? <Setup state={s} /> : <App />,
      root,
    ),
  () => render(() => <App />, root),
)
