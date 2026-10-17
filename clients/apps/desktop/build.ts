// 메인 프로세스와 서버를 한 파일로 묶는다. 앱에는 node_modules 를 싣지 않고 (서버 런타임 의존성 0),
// Electron 의 Node 가 .ts 를 바로 읽지 못해서다
import { build } from 'esbuild'

await build({
  entryPoints: ['main.ts'],
  outfile: 'dist/main.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  external: ['electron', 'node:*'],
})
