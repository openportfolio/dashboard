import { listen } from './app.ts'
import { config } from './config.ts'

// pnpm dev · start · demo 의 서버 진입점. 앱(Electron)은 listen() 을 직접 부른다
const port = await listen(config.port)
console.log(`api http://127.0.0.1:${port}${config.demo ? ' (데모)' : ''}`)
