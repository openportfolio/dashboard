import type { Role, Strategy, StrategyState } from '@portfolio/client'
import { BadRequest } from '../exceptions.ts'
import { load, save } from './service.ts'

const SYMBOL = /^[A-Za-z0-9.-]{1,12}$/
const ROLES: Role[] = ['growth', 'switch', 'cushion', 'hold']

const fail = (what: string): never => {
  throw new BadRequest(`전략 값이 올바르지 않습니다: ${what}`)
}
const text = (v: unknown, max: number, what: string) =>
  typeof v === 'string' && v.length <= max ? v : fail(what)
const symbol = (v: unknown, what: string) =>
  typeof v === 'string' && SYMBOL.test(v) ? v : fail(what)
const num = (v: unknown, what: string) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fail(what)
const list = (v: unknown, max: number, what: string) =>
  Array.isArray(v) && v.length <= max ? (v as unknown[]) : fail(what)
const obj = (v: unknown, what: string) =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : fail(what)

function strategy(v: unknown): Strategy {
  const s = obj(v, '전략')
  const out: Strategy = {
    id: text(s.id, 64, 'id') || fail('id'),
    name: text(s.name, 100, '이름'),
    daily:
      num(s.daily, '매일 매수액') > 0
        ? (s.daily as number)
        : fail('매일 매수액'),
    assets: list(s.assets, 50, '종목').map((x) => {
      const a = obj(x, '종목')
      return {
        symbol: symbol(a.symbol, '심볼'),
        weight:
          num(a.weight, '비율') >= 0 ? (a.weight as number) : fail('비율'),
        role: ROLES.includes(a.role as Role) ? (a.role as Role) : fail('역할'),
        ...(a.group === undefined ? {} : { group: text(a.group, 30, '묶음') }),
      }
    }),
  }
  if (s.bear !== undefined) {
    const b = obj(s.bear, '하락장 룰')
    const steps = list(b.steps, 2, '단계').map((x) =>
      num(x, '단계') < 0 ? (x as number) : fail('단계'),
    )
    if (steps.length !== 2) fail('단계')
    out.bear = {
      market: symbol(b.market, '기준 종목'),
      steps: steps as [number, number],
    }
  }
  if (s.limits !== undefined) {
    const l = obj(s.limits, '한도')
    out.limits = {
      ...(l.single === undefined ? {} : { single: num(l.single, '한도') }),
      ...(l.groups === undefined
        ? {}
        : {
            groups: Object.fromEntries(
              Object.entries(obj(l.groups, '묶음 한도')).map(([k, x]) => [
                text(k, 30, '묶음'),
                num(x, '묶음 한도'),
              ]),
            ),
          }),
    }
  }
  return out
}

/** 신뢰 경계: 아는 필드만 골라 다시 만든다 (그대로 저장하지 않음) */
export function parseState(v: unknown): StrategyState {
  const s = obj(v, '본문')
  const strategies = list(s.list, 100, '목록').map(strategy)
  const ids = new Set(strategies.map((x) => x.id))
  if (ids.size !== strategies.length) fail('id 중복')
  const active = s.active === null ? null : text(s.active, 64, '지금 전략')
  return {
    list: strategies,
    active:
      active !== null && ids.has(active) ? active : (strategies[0]?.id ?? null),
    compare: list(s.compare, 100, '비교')
      .map((x) => text(x, 64, '비교'))
      .filter((x) => ids.has(x)),
    benchmarks: list(s.benchmarks, 10, '벤치마크').map((x) =>
      symbol(x, '벤치마크'),
    ),
  }
}

export const routes = {
  '/api/strategies': async () => load(),
}

export const writes = {
  '/api/strategies': async (body: unknown) => save(parseState(body)),
}
