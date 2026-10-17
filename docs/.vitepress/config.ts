import { defineConfig } from 'vitepress'

// GitHub Pages 는 /<저장소 이름>/ 아래에 올라간다 (.github/workflows/docs.yml)
const base = process.env.DOCS_BASE ?? '/'

export default defineConfig({
  lang: 'ko-KR',
  title: 'OpenPortfolio',
  description: '내 컴퓨터에서 돌리는 토스증권 포트폴리오 대시보드',
  base,
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}logo.svg` }],
  ],
  cleanUrls: true,
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: '가이드', link: '/setup' },
      { text: '계산 방법', link: '/calculations' },
    ],
    sidebar: [
      { text: '시작하기', items: [{ text: '설치와 설정', link: '/setup' }] },
      {
        text: '사용',
        items: [
          { text: '화면 안내', link: '/guide' },
          { text: '계산 방법', link: '/calculations' },
        ],
      },
    ],
    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '검색', buttonAriaLabel: '검색' },
          modal: {
            noResultsText: '결과 없음',
            resetButtonTitle: '지우기',
            displayDetails: '자세히',
            backButtonTitle: '닫기',
            socialLinks: [
              {
                icon: 'github',
                link: 'https://github.com/openportfolio/dashboard',
              },
            ],
            footer: {
              selectText: '열기',
              navigateText: '이동',
              closeText: '닫기',
            },
          },
        },
      },
    },
    outline: { label: '이 페이지' },
    docFooter: { prev: '이전', next: '다음' },
    darkModeSwitchLabel: '다크 모드',
    lightModeSwitchTitle: '라이트 모드로',
    darkModeSwitchTitle: '다크 모드로',
    sidebarMenuLabel: '메뉴',
    returnToTopLabel: '맨 위로',
    socialLinks: [
      { icon: 'github', link: 'https://github.com/openportfolio/dashboard' },
    ],
    footer: {
      message: 'MIT License',
    },
  },
})
