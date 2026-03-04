import type { OmniPanelFeatureItemPayload } from '../../../../shared/events/omni-panel'
import Fuse from 'fuse.js'
import { pinyin } from 'pinyin-pro'

interface OmniPanelSearchDoc {
  item: OmniPanelFeatureItemPayload
  title: string
  subtitle: string
  pluginName: string
  pluginNamePinyinFull: string
  pluginNamePinyinFirst: string
  titlePinyinFull: string
  titlePinyinFirst: string
  subtitlePinyinFull: string
  subtitlePinyinFirst: string
}

function normalizeText(value: string | undefined): string {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function buildPinyinTokens(value: string): { full: string; first: string } {
  const raw = value.trim()
  if (!raw) {
    return { full: '', first: '' }
  }

  try {
    const full = pinyin(raw, { toneType: 'none' }).replace(/\s/g, '').toLowerCase()
    const first = pinyin(raw, { pattern: 'first', toneType: 'none' })
      .replace(/\s/g, '')
      .toLowerCase()
    return { full, first }
  } catch {
    return { full: '', first: '' }
  }
}

function createSearchDocs(features: OmniPanelFeatureItemPayload[]): OmniPanelSearchDoc[] {
  return features.map((item) => {
    const title = normalizeText(item.title)
    const subtitle = normalizeText(item.subtitle)
    const pluginName = normalizeText(item.pluginName)
    const titleTokens = buildPinyinTokens(title)
    const subtitleTokens = buildPinyinTokens(subtitle)
    const pluginTokens = buildPinyinTokens(pluginName)

    return {
      item,
      title,
      subtitle,
      pluginName,
      pluginNamePinyinFull: pluginTokens.full,
      pluginNamePinyinFirst: pluginTokens.first,
      titlePinyinFull: titleTokens.full,
      titlePinyinFirst: titleTokens.first,
      subtitlePinyinFull: subtitleTokens.full,
      subtitlePinyinFirst: subtitleTokens.first
    }
  })
}

export function filterOmniPanelFeatures(
  features: OmniPanelFeatureItemPayload[],
  keyword: string
): OmniPanelFeatureItemPayload[] {
  const normalizedKeyword = normalizeText(keyword)
  if (!normalizedKeyword) {
    return features
  }

  const docs = createSearchDocs(features)
  const fuse = new Fuse(docs, {
    includeScore: true,
    threshold: 0.36,
    ignoreLocation: true,
    minMatchCharLength: 1,
    keys: [
      { name: 'title', weight: 0.44 },
      { name: 'subtitle', weight: 0.14 },
      { name: 'pluginName', weight: 0.1 },
      { name: 'pluginNamePinyinFull', weight: 0.06 },
      { name: 'pluginNamePinyinFirst', weight: 0.04 },
      { name: 'titlePinyinFull', weight: 0.16 },
      { name: 'titlePinyinFirst', weight: 0.1 },
      { name: 'subtitlePinyinFull', weight: 0.04 },
      { name: 'subtitlePinyinFirst', weight: 0.02 }
    ]
  })

  return fuse.search(normalizedKeyword).map((result) => result.item.item)
}
