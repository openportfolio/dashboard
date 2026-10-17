// 비밀 값(토스 Secret)을 저장하기 전에 감싼다. 앱(Electron)은 OS 키체인(safeStorage)으로 암호화하는 걸 끼우고,
// 브라우저 모드(pnpm dev)는 끼우지 않아 평문 그대로 (server/.env 와 같은 수준)
interface Sealer {
  seal(plain: string): string
  open(sealed: string): string
}

let current: Sealer | null = null
export const useSealer = (s: Sealer) => {
  current = s
}

/** 저장할 모양: 끼운 게 있으면 암호화 */
export const seal = <T>(v: T, s = current): T | { sealed: string } =>
  s ? { sealed: s.seal(JSON.stringify(v)) } : v

/** 저장된 모양 → 값. 암호화돼 있는데 풀 수 없으면 null (키체인이 바뀜 · 다른 기기) → 연결 화면에서 다시 넣는다 */
export function unseal<T extends object>(
  v: T | { sealed: string } | null,
  s = current,
): T | null {
  if (!v || !('sealed' in v)) return v
  if (!s) return null
  try {
    return JSON.parse(s.open(v.sealed)) as T
  } catch {
    return null
  }
}
