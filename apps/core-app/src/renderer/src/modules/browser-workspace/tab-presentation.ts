import type { BrowserTabState } from '@talex-touch/utils/transport/sdk/domains/browser'

export const shortcuts = [
  {
    title: 'Google',
    url: 'https://www.google.com',
    icon: 'i-simple-icons-google',
    color: '#4285F4'
  },
  {
    title: 'GitHub',
    url: 'https://github.com',
    icon: 'i-simple-icons-github',
    color: 'currentColor'
  },
  { title: 'Figma', url: 'https://www.figma.com', icon: 'i-simple-icons-figma', color: '#F24E1E' },
  {
    title: 'Notion',
    url: 'https://www.notion.so',
    icon: 'i-simple-icons-notion',
    color: 'currentColor'
  },
  { title: '知乎', url: 'https://www.zhihu.com', icon: 'i-simple-icons-zhihu', color: '#0066FF' },
  {
    title: 'YouTube',
    url: 'https://www.youtube.com',
    icon: 'i-simple-icons-youtube',
    color: '#FF0000'
  }
]

export function localIcon(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '')
    return (
      shortcuts.find((site) => new URL(site.url).hostname.replace(/^www\./, '') === hostname)
        ?.icon ?? 'i-ri-global-line'
    )
  } catch {
    return 'i-ri-global-line'
  }
}

export function tabIcon(tab: BrowserTabState): string {
  if (tab.loading) return 'i-ri-loader-4-line'
  if (!tab.url) return 'i-ri-global-line'
  if (tab.url.startsWith('tuff://store')) return 'i-ri-store-2-line'
  if (tab.url.startsWith('tuff://setting')) return 'i-ri-settings-3-line'
  return localIcon(tab.url)
}
