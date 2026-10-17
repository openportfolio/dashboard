const cache = new Map<string, { at: number; v: Promise<unknown> }>()

/** Promise 를 캐시하므로 동시 요청은 한 번만 호출된다. 실패는 캐시하지 않음 */
export function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < ttlMs) return hit.v as Promise<T>
  const v = fn()
  cache.set(key, { at: Date.now(), v })
  v.catch(() => cache.get(key)?.v === v && cache.delete(key))
  return v
}

/** 계좌가 바뀌면 (키 변경) 그 계좌의 캐시를 버린다 */
export const forget = (...keys: string[]) =>
  keys.forEach((k) => cache.delete(k))
