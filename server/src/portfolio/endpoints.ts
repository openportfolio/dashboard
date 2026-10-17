import { history, todayFlow } from './history.ts'
import { snapshot } from './service.ts'

export const routes = {
  '/api/snapshot': () => snapshot(),
  '/api/flow': async () => todayFlow(),
  '/api/history': async () => history(),
}
