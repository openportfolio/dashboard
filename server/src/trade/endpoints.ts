import { fills } from './service.ts'

export const routes = {
  '/api/fills': () => fills(),
}
