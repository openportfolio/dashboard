import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

// 5173은 다른 프로젝트와 겹치기 쉬워 고정 포트 사용
export default defineConfig({
  plugins: [solid()],
  server: {
    port: 5280,
    strictPort: true,
    // PORT: 셸에서 준 API 서버 포트를 따라간다 (PORT=8001 pnpm dev)
    proxy: { '/api': `http://127.0.0.1:${process.env.PORT ?? 8000}` },
  },
})
