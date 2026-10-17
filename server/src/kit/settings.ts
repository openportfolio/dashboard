import { db } from './db.ts'

// 설정 한 줄씩 (key → JSON): 전략 · 토스 키 · 연락처
let ready = false
const open = () => {
  const d = db()
  if (!ready) {
    d.exec(`CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`)
    ready = true
  }
  return d
}

export function setting<T>(key: string): T | null {
  const row = open()
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(key) as { value: string } | undefined
  return row ? (JSON.parse(row.value) as T) : null
}

export function saveSetting(key: string, value: unknown) {
  open()
    .prepare('INSERT OR REPLACE INTO settings VALUES (?, ?)')
    .run(key, JSON.stringify(value))
}
