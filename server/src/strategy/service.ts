import type { StrategyState } from '@portfolio/client'
import { saveSetting, setting } from '../kit/settings.ts'

/** 저장된 전략 (처음엔 null → 웹이 보유 비중 · 템플릿에서 새로 만든다) */
export const load = () => setting<StrategyState>('strategies')

export const save = (s: StrategyState) => saveSetting('strategies', s)
