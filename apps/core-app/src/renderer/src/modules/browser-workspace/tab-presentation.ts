import type { BrowserTabState } from '@talex-touch/utils/transport/sdk/domains/browser'

export interface BrowserShortcutItem {
  title: string
  url: string
  icon: string
  color: string
}

export const shortcuts: readonly BrowserShortcutItem[] = [
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
  {
    title: 'Figma',
    url: 'https://www.figma.com',
    icon: 'i-simple-icons-figma',
    color: '#F24E1E'
  },
  {
    title: 'Claude',
    url: 'https://claude.ai',
    icon: 'i-simple-icons-claude',
    color: '#D97757'
  },
  {
    title: 'ChatGPT',
    url: 'https://chatgpt.com',
    icon: 'i-simple-icons-openai',
    color: 'currentColor'
  },
  {
    title: 'Gemini',
    url: 'https://gemini.google.com',
    icon: 'i-simple-icons-googlegemini',
    color: '#8E75B2'
  }
]

interface KnownSitePresentation {
  icon: string
  color: string
}

/**
 * Extra well-known host icons so recent history cards and tabs keep crisp brand marks
 * even for sites that are no longer pinned in the 6 top shortcuts.
 */
const EXTRA_SITE_PRESENTATION: Readonly<Record<string, KnownSitePresentation>> = {
  'anthropic.com': { icon: 'i-simple-icons-claude', color: '#D97757' },
  'openai.com': { icon: 'i-simple-icons-openai', color: 'currentColor' },
  'youtube.com': { icon: 'i-simple-icons-youtube', color: '#FF0000' },
  'youtu.be': { icon: 'i-simple-icons-youtube', color: '#FF0000' },
  'zhihu.com': { icon: 'i-simple-icons-zhihu', color: '#0066FF' },
  'notion.so': { icon: 'i-simple-icons-notion', color: 'currentColor' },
  'bilibili.com': { icon: 'i-simple-icons-bilibili', color: '#00A1D6' },
  'x.com': { icon: 'i-simple-icons-x', color: 'currentColor' },
  'twitter.com': { icon: 'i-simple-icons-x', color: 'currentColor' }
}

const FALLBACK_TAB_ICONS = [
  'i-ri-loader-4-line',
  'i-ri-global-line',
  'i-ri-store-2-line',
  'i-ri-settings-3-line',
  'i-ri-file-code-line'
] as const

/**
 * Every icon class this `.ts` module can return, wired into `apps/core-app/uno.config.ts`
 * so UnoCSS always generates its CSS instead of leaving empty icon boxes at runtime.
 */
export const BROWSER_TAB_ICON_CLASSES: readonly string[] = Object.freeze(
  Array.from(
    new Set([
      ...shortcuts.map((site) => site.icon),
      ...Object.values(EXTRA_SITE_PRESENTATION).map((site) => site.icon),
      ...FALLBACK_TAB_ICONS
    ])
  )
)

function normalizeHostname(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

function findSitePresentation(url: string): KnownSitePresentation | null {
  const hostname = normalizeHostname(url)
  if (!hostname) return null

  const shortcutMatch = shortcuts.find((site) => normalizeHostname(site.url) === hostname)
  if (shortcutMatch) {
    return { icon: shortcutMatch.icon, color: shortcutMatch.color }
  }

  if (Object.hasOwn(EXTRA_SITE_PRESENTATION, hostname)) {
    return EXTRA_SITE_PRESENTATION[hostname]!
  }

  for (const [domain, presentation] of Object.entries(EXTRA_SITE_PRESENTATION)) {
    if (hostname.endsWith(`.${domain}`)) {
      return presentation
    }
  }

  return null
}

export function localIcon(url: string): string {
  return findSitePresentation(url)?.icon ?? 'i-ri-global-line'
}

export function localIconColor(url: string): string | undefined {
  const color = findSitePresentation(url)?.color
  return color && color !== 'currentColor' ? color : undefined
}

export function formatSiteHost(url: string): string {
  return normalizeHostname(url) ?? url
}

export function tabIcon(tab: BrowserTabState): string {
  if (tab.loading) return 'i-ri-loader-4-line'
  if (!tab.url) return 'i-ri-global-line'
  if (tab.url.startsWith('tuff://store')) return 'i-ri-store-2-line'
  if (tab.url.startsWith('tuff://setting')) return 'i-ri-settings-3-line'
  if (tab.url.startsWith('tuff://preview')) return 'i-ri-file-code-line'
  return localIcon(tab.url)
}
