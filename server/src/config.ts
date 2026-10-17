export const config = {
  tossClientId: process.env.TOSS_CLIENT_ID ?? '',
  tossClientSecret: process.env.TOSS_CLIENT_SECRET ?? '',
  /** 토스 대신 가짜 계좌 (integrations/demo.ts) */
  demo: process.env.DEMO === '1',
  port: Number(process.env.PORT ?? 8000),
  /** 기록 DB 폴더. 없으면 server/data (앱은 OS 사용자 데이터 폴더) */
  dataDir: process.env.DATA_DIR ?? '',
  /** 빌드한 웹 폴더. 주면 API 와 같은 주소로 화면도 내보낸다 (앱) */
  webDir: process.env.WEB_DIR ?? '',
  // SEC EDGAR 는 연락처가 든 User-Agent 를 요구한다 (예: 'portfolio-dashboard you@example.com'). 없으면 화면에서 넣은 연락처
  secUserAgent: process.env.SEC_USER_AGENT ?? '',
}
