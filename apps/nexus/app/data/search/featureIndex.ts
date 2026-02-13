import {
  extensionHighlights,
  featureCards,
  heroHighlights,
  testingHighlights,
} from '~/data/tuffHeroContent'
import { tuffSdkItems } from '~/data/tuffSdkItems'

export interface FeatureSearchItem {
  id: string
  titleKey: string
  descriptionKey?: string
  icon?: string
  path: string
  searchTokens?: string[]
}

function extractKeySegment(key: string, fallback: string) {
  const match = key.match(/\.([^.]+)\.title$/)
  return match?.[1] ?? fallback
}

const HERO_HIGHLIGHT_PATHS: Record<string, string> = {
  'landing.hero.highlights.integrations.title': '/#integrations',
  'landing.hero.highlights.workspace.title': '/#built-for-you',
  'landing.hero.highlights.focus.title': '/#ai-overview',
}

const SDK_DOCS_MAP: Record<string, string> = {
  'box-sdk': 'box',
  'clipboard-sdk': 'clipboard',
  'tempfile-sdk': 'temp-file',
  'storage-sdk': 'storage',
  'download-sdk': 'download',
  'platform-capabilities-sdk': 'platform-capabilities',
  'account-sdk': 'account',
  'channel-sdk': 'channel',
  'feature-sdk': 'feature',
  'divisionbox-sdk': 'division-box',
  'flow-sdk': 'flow-transfer',
  'intelligence-sdk': 'intelligence',
}

const heroHighlightItems: FeatureSearchItem[] = heroHighlights
  .map((item) => {
    const path = HERO_HIGHLIGHT_PATHS[item.titleKey]
    if (!path)
      return null
    return {
      id: `hero-${extractKeySegment(item.titleKey, item.titleKey)}`,
      titleKey: item.titleKey,
      descriptionKey: item.descriptionKey,
      icon: item.icon,
      path,
    }
  })
  .filter((item): item is FeatureSearchItem => Boolean(item))

const featureCardItems: FeatureSearchItem[] = featureCards.map(item => ({
  id: `feature-${extractKeySegment(item.titleKey, item.titleKey)}`,
  titleKey: item.titleKey,
  descriptionKey: item.descriptionKey,
  icon: item.icon,
  path: '/#features',
}))

const extensionItems: FeatureSearchItem[] = extensionHighlights.map(item => ({
  id: `extension-${extractKeySegment(item.titleKey, item.titleKey)}`,
  titleKey: item.titleKey,
  descriptionKey: item.descriptionKey,
  icon: 'i-carbon-code',
  path: '/#ecosystem',
}))

const testingItems: FeatureSearchItem[] = testingHighlights.map(item => ({
  id: `testing-${extractKeySegment(item.titleKey, item.titleKey)}`,
  titleKey: item.titleKey,
  descriptionKey: item.descriptionKey,
  icon: 'i-carbon-rocket',
  path: '/#waitlist',
}))

const sdkItems: FeatureSearchItem[] = tuffSdkItems.flatMap((item) => {
  const slug = SDK_DOCS_MAP[item.id]
  if (!slug)
    return []
  return [
    {
      id: item.id,
      titleKey: item.title,
      descriptionKey: item.description,
      icon: item.icon,
      path: `/docs/dev/api/${slug}`,
      searchTokens: [item.tag, slug, 'sdk'],
    },
  ]
})

export const featureSearchItems: FeatureSearchItem[] = [
  ...heroHighlightItems,
  ...featureCardItems,
  ...extensionItems,
  ...testingItems,
  ...sdkItems,
]
