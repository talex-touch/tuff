export interface PageSearchItem {
  id: string
  titleKey: string
  descriptionKey?: string
  path: string
  icon?: string
  searchTokens?: string[]
}

export const pageSearchItems: PageSearchItem[] = [
  {
    id: 'page-docs',
    titleKey: 'nav.doc',
    path: '/docs',
    icon: 'i-carbon-document',
    searchTokens: ['docs', 'developer', 'documentation', '文档', '开发', '指南'],
  },
  {
    id: 'page-guide',
    titleKey: 'nav.tutorial',
    path: '/docs/guide/start',
    icon: 'i-carbon-book',
    searchTokens: ['guide', 'tutorial', '入门', '教程', '上手'],
  },
  {
    id: 'page-market',
    titleKey: 'nav.market',
    descriptionKey: 'market.hero.subtitle',
    path: '/market',
    icon: 'i-carbon-store',
    searchTokens: ['market', 'plugin', '插件', 'marketplace'],
  },
  {
    id: 'page-updates',
    titleKey: 'updates.title',
    descriptionKey: 'updates.subtitle',
    path: '/updates',
    icon: 'i-carbon-download',
    searchTokens: ['updates', 'download', 'release', '更新', '下载'],
  },
  {
    id: 'page-pricing',
    titleKey: 'pricing.title',
    descriptionKey: 'pricing.subtitle',
    path: '/pricing',
    icon: 'i-carbon-currency-dollar',
    searchTokens: ['pricing', 'plan', 'price', '订阅', '定价'],
  },
  {
    id: 'page-license',
    titleKey: 'license.title',
    descriptionKey: 'license.description',
    path: '/license',
    icon: 'i-carbon-document-blank',
    searchTokens: ['license', 'terms', '协议', '条款', '服务条款'],
  },
  {
    id: 'page-privacy',
    titleKey: 'privacy.title',
    descriptionKey: 'privacy.description',
    path: '/privacy',
    icon: 'i-carbon-shield',
    searchTokens: ['privacy', 'policy', '隐私', '隐私政策'],
  },
  {
    id: 'page-protocol',
    titleKey: 'protocol.title',
    descriptionKey: 'protocol.description',
    path: '/protocol',
    icon: 'i-carbon-bookmark',
    searchTokens: ['protocol', 'license', '协议', '使用许可'],
  },
]
