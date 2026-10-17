// 분류표. 토스 API 에는 GICS 가 없어서 직접 관리한다.
// 미국 대·중형주(S&P 500 + 중형 400)는 universe.ts 가 SPDR 보유종목으로 자동 분류하고,
// 그 밖의 종목(국내 등)만 STOCK_SECTOR 에 직접 넣는다. 없으면 '미분류'

export const UNMAPPED = '미분류'

/** GICS 11개 섹터 → S&P 500 섹터 ETF (SPDR). 섹터 성과의 기준이자 섹터별 종목 목록의 출처 */
export const GICS: Record<string, string> = {
  정보기술: 'XLK',
  '커뮤니케이션 서비스': 'XLC',
  경기소비재: 'XLY',
  필수소비재: 'XLP',
  헬스케어: 'XLV',
  금융: 'XLF',
  산업재: 'XLI',
  에너지: 'XLE',
  소재: 'XLB',
  유틸리티: 'XLU',
  부동산: 'XLRE',
}

/** GICS 영문명 → 한글 (MDY 보유종목 파일의 Sector 열) */
export const GICS_EN: Record<string, string> = {
  'Information Technology': '정보기술',
  'Communication Services': '커뮤니케이션 서비스',
  'Consumer Discretionary': '경기소비재',
  'Consumer Staples': '필수소비재',
  'Health Care': '헬스케어',
  Financials: '금융',
  Industrials: '산업재',
  Energy: '에너지',
  Materials: '소재',
  Utilities: '유틸리티',
  'Real Estate': '부동산',
}

/** 자동 분류가 안 되는 개별주식 → GICS 섹터 (자동 분류보다 우선) */
export const STOCK_SECTOR: Record<string, string> = {
  '005930': '정보기술', // 삼성전자
  '000660': '정보기술', // SK하이닉스
}

/** ETF → 추종 대상별 묶음 (자산 구성·포트폴리오 맵용. 섹터 노출은 보유종목으로 펼쳐서 계산) */
export const ETF_CLASS: Record<string, string> = {
  VOO: 'S&P500 ETF',
  SPY: 'S&P500 ETF',
  IVV: 'S&P500 ETF',
  SPLG: 'S&P500 ETF',
  QQQ: '나스닥100 ETF',
  QQQM: '나스닥100 ETF',
  VTI: '미국 전체 ETF',
  DIA: '다우 ETF',
  SCHD: '미국 배당 ETF',
  VYM: '미국 배당 ETF',
  DGRO: '미국 배당 ETF',
  JEPI: '커버드콜 ETF',
  JEPQ: '커버드콜 ETF',
  SOXX: '반도체 ETF',
  SMH: '반도체 ETF',
  TQQQ: '레버리지 ETF',
  SOXL: '레버리지 ETF',
  SGOV: '단기국채 ETF',
  BIL: '단기국채 ETF',
  SHV: '단기국채 ETF',
  TLT: '장기국채 ETF',
}
