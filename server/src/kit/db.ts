import { mkdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { config } from '../config.ts'

// server/data/portfolio.db (gitignore), 앱은 DATA_DIR. 계좌 데이터라 폴더는 본인만 읽게 (0700)
const DIR = config.dataDir
  ? pathToFileURL(config.dataDir + '/')
  : new URL('../../data/', import.meta.url)
let conn: DatabaseSync | undefined

/** 처음 부를 때 연다. 테이블은 쓰는 모듈이 CREATE TABLE IF NOT EXISTS 로 만든다 */
export function db() {
  if (conn) return conn
  // 데모는 실제 기록을 건드리지 않게 메모리에
  if (config.demo) return (conn = new DatabaseSync(':memory:'))
  mkdirSync(DIR, { recursive: true, mode: 0o700 })
  return (conn = new DatabaseSync(new URL('portfolio.db', DIR)))
}
