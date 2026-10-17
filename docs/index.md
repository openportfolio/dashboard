---
layout: home
hero:
  name: OpenPortfolio
  text: 토스증권 포트폴리오 대시보드
  tagline: 내 컴퓨터에서 돌리는 실시간 잔고 · 섹터 노출 · 전략 점검 · 백테스트 · 양도세 추정
  actions:
    - theme: brand
      text: 시작하기
      link: /setup
    - theme: alt
      text: 화면 둘러보기
      link: /guide
  image:
    src: /logo.svg
    alt: OpenPortfolio
features:
  - title: 실시간
    details: 체결마다 1초 단위로 총자산 · 손익 · 포트폴리오 맵이 바뀐다.
  - title: GICS 섹터 노출
    details: ETF 는 SEC 공시 보유종목까지 펼쳐서 실제 섹터 비중을 본다.
  - title: 전략 점검
    details: 목표 비중 · 하락장 단계 · 매도 한도와 지금 보유의 차이, 오늘 살 금액.
  - title: 백테스트
    details: 매일 적립식, 원화 · 달러, 배당 재투자, 상장 전은 같은 지수 종목으로.
  - title: 양도세 추정
    details: 선입선출 · 결제일 환율 · 250만원 공제로 올해 세금과 '지금 모두 팔면'.
  - title: 키 없이 데모
    details: pnpm demo 하나로 실제 가격으로 지은 가짜 계좌가 뜬다.
---

<img class="shot" src="./images/hero.webp" alt="실시간 탭 (데모 계좌)" />

<style>
.shot {
  margin: 48px auto 0;
  max-width: 1152px;
  width: calc(100% - 48px);
  border-radius: 12px;
  box-shadow: var(--vp-shadow-3);
}
</style>
