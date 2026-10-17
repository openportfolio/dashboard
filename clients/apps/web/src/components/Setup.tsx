import { put, type Setup as SetupState } from '@portfolio/client'
import { createSignal, Show } from 'solid-js'
import './Setup.css'

/** 연결 화면 (처음이거나 ?setup): 토스 Open API 키 · SEC 연락처. 서버가 토스에 물어보고 맞을 때만 저장한다 */
export function Setup(props: { state: SetupState }) {
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal<string>()

  async function submit(e: SubmitEvent) {
    e.preventDefault()
    const f = new FormData(e.currentTarget as HTMLFormElement)
    setBusy(true)
    setError()
    try {
      await put('/api/setup', {
        clientId: String(f.get('clientId')),
        clientSecret: String(f.get('clientSecret')),
        contact: String(f.get('contact')),
      })
      location.replace('/')
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <main class="setup">
      <form class="card" onSubmit={submit}>
        <h1>토스증권 연결</h1>
        <p class="sub">
          <a
            href="https://openapi.tossinvest.com"
            target="_blank"
            rel="noreferrer"
          >
            토스증권 Open API
          </a>{' '}
          에서 발급한 키를 넣으세요. 발급 때 등록한 IP(이 컴퓨터가 인터넷에
          나가는 주소)에서만 동작합니다.
        </p>
        <Show
          when={props.state.keys !== 'env'}
          fallback={
            <p class="err">
              server/.env 의 키를 쓰고 있습니다. 화면에서 넣으려면 .env 의
              TOSS_CLIENT_ID · TOSS_CLIENT_SECRET 를 지우고 서버를 다시 켜세요.
            </p>
          }
        >
          <label>
            Client ID
            <input
              name="clientId"
              class="text"
              required
              autocomplete="off"
              spellcheck={false}
            />
          </label>
          <label>
            Client Secret
            <input
              name="clientSecret"
              type="password"
              class="text"
              required
              autocomplete="off"
            />
          </label>
          <label>
            <span>
              연락처 이메일 <span class="muted">(선택)</span>
            </span>
            <input
              name="contact"
              type="email"
              class="text"
              value={props.state.contact ?? ''}
            />
            <small class="muted">
              ETF 를 보유종목까지 펼칠 때 SEC 에 밝히는 연락처
            </small>
          </label>
          <Show when={error()}>
            <p class="err" role="alert">
              {error()}
            </p>
          </Show>
          <button disabled={busy()}>{busy() ? '확인 중…' : '연결'}</button>
          <small class="muted">
            키는 이 컴퓨터에만 저장됩니다 (앱은 OS 키체인으로 암호화).
          </small>
        </Show>
        <Show when={props.state.keys}>
          <a href="/">돌아가기</a>
        </Show>
      </form>
    </main>
  )
}
