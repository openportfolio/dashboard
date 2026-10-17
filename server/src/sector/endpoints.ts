import { performance } from './service.ts'

export const routes = {
  '/api/performance': () => performance(),
}
