import type { PricePoint, Snapshot } from '@portfolio/client'
import { db } from '../kit/db.ts'

// 스냅샷을 조회할 때(대시보드를 켠 동안)만 기록한다 → 안 켠 날은 빈다.
// 서버가 혼자 주기 조회하면 같은 키를 쓰는 다른 도구의 토큰을 끊을 수 있어 뺐다

/** 하루는 08:00 KST 에 넘긴다. 미국 정규장(~06:00 KST) 마감 뒤, 국내 장(넥스트레이드 08:00) 시작 전 */
export const tradingDay = (t: number) =>
  new Date(t + (9 - 8) * 3_600_000).toISOString().slice(0, 10)
/** t 가 속한 거래일의 시작 시각 (08:00 KST) */
export const dayStart = (t: number) => t - ((t + 3_600_000) % 86_400_000)

let ready = false
const open = () => {
  const d = db()
  if (ready) return d
  d.exec(`CREATE TABLE IF NOT EXISTS daily (
    day TEXT PRIMARY KEY,
    at INTEGER NOT NULL,
    snapshot TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS flow (
    t INTEGER PRIMARY KEY,
    v REAL NOT NULL
  )`)
  ready = true
  return d
}

/** 거래일마다 마지막 스냅샷 하나만 남긴다 (= 그날 종가). 전체를 남겨야 나중에 종목·섹터별 추이도 낼 수 있다 */
export function record(s: Snapshot) {
  open()
    .prepare('INSERT OR REPLACE INTO daily VALUES (?, ?, ?)')
    .run(tradingDay(s.at), s.at, JSON.stringify(s))
}

/** 거래일별 총 자산, 오래된 순. t 를 기록 시각이 아니라 거래일로 둬야 08:00 전 기록이 다음 날로 안 찍힌다 */
export const history = () =>
  open()
    .prepare(
      `SELECT unixepoch(day) * 1000 AS t, json_extract(snapshot, '$.assets') AS v
       FROM daily ORDER BY day`,
    )
    .all() as unknown as PricePoint[]

/** 총 자산 흐름 1분 단위 (t = 분의 시작). 같은 분은 마지막 값으로 덮어쓴다 */
export function recordFlow(p: PricePoint) {
  open().prepare('INSERT OR REPLACE INTO flow VALUES (?, ?)').run(p.t, p.v)
}

/** 오늘(거래일) 총 자산 흐름 */
export const todayFlow = () =>
  open()
    .prepare('SELECT t, v FROM flow WHERE t >= ? ORDER BY t')
    .all(dayStart(Date.now())) as unknown as PricePoint[]
