import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { docContentFileToAppRoute, type SupportedLocale } from './tuff-web-prerender-routes'

export type DocsSectionKey = 'guide' | 'dev'

export interface TuffWebNavItem {
  path: string
  slug: string
  section: DocsSectionKey | 'root'
  group: string
  title: string
  description: string
  tags: string[]
}

export interface TuffWebNavGroup {
  key: string
  title: string
  entryPath: string | null
  items: TuffWebNavItem[]
}

export interface TuffWebNavSection {
  key: DocsSectionKey
  entryPath: string
  standalone: TuffWebNavItem[]
  groups: TuffWebNavGroup[]
}

export interface TuffWebLocaleNavigation {
  locale: SupportedLocale
  sections: TuffWebNavSection[]
  items: TuffWebNavItem[]
}

const SECTION_ORDER: Record<string, string[]> = {
  dev: [
    'dev',
    'dev/getting-started',
    'dev/api',
    'dev/architecture',
    'dev/extensions',
    'dev/intelligence',
    'dev/release',
    'dev/tools',
    'dev/reference',
  ],
  'dev/getting-started': [
    'dev/getting-started',
    'dev/getting-started/overview',
    'dev/getting-started/quickstart',
    'dev/getting-started/plugin-workflow',
  ],
  'dev/api': [
    'dev/api',
    'dev/api/plugin-context',
    'dev/api/box',
    'dev/api/feature',
    'dev/api/quick-actions',
    'dev/api/search',
    'dev/api/clipboard',
    'dev/api/storage',
    'dev/api/temp-file',
    'dev/api/download',
    'dev/api/platform-capabilities',
    'dev/api/screenshot',
    'dev/api/power',
    'dev/api/account',
    'dev/api/intelligence',
    'dev/api/permission',
    'dev/api/i18n',
    'dev/api/transport',
    'dev/api/transport-internals',
    'dev/api/channel',
    'dev/api/bridge-hooks',
    'dev/api/event',
    'dev/api/keyboard',
    'dev/api/widget',
    'dev/api/division-box',
    'dev/api/flow-transfer',
    'dev/api/quickops',
    'dev/api/recommend',
  ],
  'dev/architecture': [
    'dev/architecture/app-tech-principles',
    'dev/architecture/module-map',
    'dev/architecture/corebox-system',
    'dev/architecture/corebox-and-views',
    'dev/architecture/search-engine',
    'dev/architecture/plugin-system',
    'dev/architecture/transport-events',
    'dev/architecture/ipc-events-detail',
    'dev/architecture/ipc-events-handlers',
    'dev/architecture/ipc-events-sdk-map',
    'dev/architecture/storage-and-db',
    'dev/architecture/division-box',
    'dev/architecture/intelligence-system',
    'dev/architecture/intelligence-module',
    'dev/architecture/device-idle-service',
  ],
  'dev/extensions': [
    'dev/extensions/layout',
    'dev/extensions/search-sorting',
    'dev/extensions/toast',
    'dev/extensions/cloud-sync',
    'dev/extensions/unplugin-export-plugin',
  ],
  'dev/intelligence': [
    'dev/intelligence',
    'dev/intelligence/configuration',
    'dev/intelligence/langchain-agent',
    'dev/intelligence/schema-migration',
    'dev/intelligence/capabilities',
    'dev/intelligence/troubleshooting',
  ],
  'dev/release': [
    'dev/release',
    'dev/release/publish',
    'dev/release/performance-persistence',
    'dev/release/migration',
  ],
  'dev/tools': [
    'dev/tools',
    'dev/tools/tuff-cli',
    'dev/tools/tuffex',
  ],
  'dev/reference': [
    'dev/reference',
    'dev/reference/manifest',
    'dev/reference/snippets',
    'dev/reference/examples',
  ],
  guide: [
    'guide/start',
    'guide/features',
    'guide/features/plugins',
    'guide/scenes',
    'guide/tips',
    'guide',
  ],
  'guide/features': [
    'guide/features/workspace',
    'guide/features/corebox-workflow',
    'guide/features/plugin-ecosystem',
    'guide/features/store',
    'guide/features/preview',
    'guide/features/quickops',
    'guide/features/recommended-plugins',
    'guide/features/search-freshness-benchmark',
    'guide/features/wallpaper',
  ],
  'guide/scenes': [
    'guide/scenes/student',
    'guide/scenes/creator',
    'guide/scenes/developer',
  ],
  'guide/tips': [
    'guide/tips',
    'guide/tips/intelligence-workflow',
    'guide/tips/intelligence-agent-playbook',
    'guide/tips/intelligence-prompts',
    'guide/tips/automation',
    'guide/tips/productivity',
    'guide/tips/faq',
  ],
}

const GROUP_LABELS: Record<string, { en: string, zh: string }> = {
  'guide/features': { en: 'Features', zh: '核心功能' },
  'guide/features/plugins': { en: 'Official Plugins', zh: '官方插件' },
  'guide/scenes': { en: 'Scenarios', zh: '使用场景' },
  'guide/tips': { en: 'Tips & Workflows', zh: '进阶技巧' },
  'dev/getting-started': { en: 'Getting Started', zh: '快速开始' },
  'dev/api': { en: 'Plugin SDK & APIs', zh: '插件 SDK 与 API' },
  'dev/architecture': { en: 'Architecture', zh: '系统架构' },
  'dev/extensions': { en: 'Extensions', zh: '扩展能力' },
  'dev/intelligence': { en: 'Intelligence', zh: 'AI 智能' },
  'dev/release': { en: 'Release & Distribution', zh: '发布与分发' },
  'dev/tools': { en: 'Tools', zh: '开发工具' },
  'dev/reference': { en: 'Reference', zh: '参考手册' },
}

function walkFiles(dir: string): string[] {
  if (!existsSync(dir))
    return []
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory())
      out.push(...walkFiles(full))
    else if (st.isFile())
      out.push(full)
  }
  return out
}

function unquote(value: string): string {
  const trimmed = value.trim()
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith('\'') && trimmed.endsWith('\'')))
    return trimmed.slice(1, -1)
  return trimmed
}

export function extractFrontmatterAndHeading(raw: string): {
  frontmatter: Record<string, unknown>
  headingTitle: string | null
  firstParagraph: string
} {
  const frontmatter: Record<string, unknown> = {}
  let body = raw

  if (raw.startsWith('---')) {
    const endIdx = raw.indexOf('\n---', 3)
    if (endIdx !== -1) {
      const fmBlock = raw.slice(3, endIdx)
      body = raw.slice(endIdx + 4)
      let currentArrayKey: string | null = null

      for (const line of fmBlock.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#'))
          continue
        if (currentArrayKey && /^-\s+/.test(trimmed)) {
          const arr = Array.isArray(frontmatter[currentArrayKey]) ? (frontmatter[currentArrayKey] as string[]) : []
          frontmatter[currentArrayKey] = [...arr, unquote(trimmed.replace(/^-\s+/, ''))]
          continue
        }
        currentArrayKey = null
        const sep = trimmed.indexOf(':')
        if (sep <= 0)
          continue
        const key = trimmed.slice(0, sep).trim()
        const val = trimmed.slice(sep + 1).trim()
        if (!val) {
          frontmatter[key] = []
          currentArrayKey = key
          continue
        }
        if (val === 'true') {
          frontmatter[key] = true
          continue
        }
        if (val === 'false') {
          frontmatter[key] = false
          continue
        }
        if (val.startsWith('[') && val.endsWith(']')) {
          const inner = val.slice(1, -1).trim()
          frontmatter[key] = inner ? inner.split(',').map(unquote).filter(Boolean) : []
          continue
        }
        frontmatter[key] = unquote(val)
      }
    }
  }

  let headingTitle: string | null = null
  let firstParagraph = ''
  let inCodeFence = false
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed.startsWith('```') || trimmed.startsWith(':::')) {
      inCodeFence = !inCodeFence
      continue
    }
    if (inCodeFence || !trimmed)
      continue
    if (!headingTitle && /^#\s+/.test(trimmed)) {
      headingTitle = trimmed.replace(/^#\s+/, '').trim()
      continue
    }
    if (!firstParagraph && !trimmed.startsWith('#') && !trimmed.startsWith('|') && !trimmed.startsWith('- ') && !trimmed.startsWith('<')) {
      firstParagraph = trimmed.replace(/^>\s*/, '').replace(/[`*_[\]]/g, '').slice(0, 180)
    }
    if (headingTitle && firstParagraph)
      break
  }

  return { frontmatter, headingTitle, firstParagraph }
}

function fallbackTitleFromSlug(slug: string, locale: SupportedLocale): string {
  if (!slug)
    return locale === 'zh' ? '文档首页' : 'Documentation'
  const leaf = slug.split('/').filter(Boolean).pop() ?? slug
  return leaf
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, ch => ch.toUpperCase())
}

function resolveGroupKey(slug: string): { section: DocsSectionKey | 'root', group: string } {
  if (!slug || (!slug.startsWith('guide') && !slug.startsWith('dev')))
    return { section: 'root', group: 'root' }

  const section: DocsSectionKey = slug.startsWith('guide') ? 'guide' : 'dev'
  if (slug === 'guide' || slug === 'dev')
    return { section, group: '' }

  if (slug === 'guide/start')
    return { section: 'guide', group: '' }

  if (slug.startsWith('guide/features/plugins'))
    return { section: 'guide', group: 'guide/features/plugins' }

  const parts = slug.split('/')
  if (parts.length >= 2) {
    const prefix2 = `${parts[0]}/${parts[1]}`
    if (GROUP_LABELS[prefix2] || parts.length >= 3)
      return { section, group: prefix2 }
  }

  return { section, group: '' }
}

function sortBySectionOrder(items: TuffWebNavItem[], orderKey: string): TuffWebNavItem[] {
  const order = SECTION_ORDER[orderKey] ?? []
  const orderMap = new Map(order.map((slug, idx) => [slug, idx]))
  return [...items].sort((a, b) => {
    const ai = orderMap.has(a.slug) ? orderMap.get(a.slug)! : Number.POSITIVE_INFINITY
    const bi = orderMap.has(b.slug) ? orderMap.get(b.slug)! : Number.POSITIVE_INFINITY
    if (ai !== bi)
      return ai - bi
    return a.title.localeCompare(b.title)
  })
}

export function buildTuffWebNavigationFromDisk(
  contentDocsDir: string,
  locale: SupportedLocale,
): TuffWebLocaleNavigation {
  const rawItems: TuffWebNavItem[] = []

  for (const file of walkFiles(contentDocsDir)) {
    const rel = relative(contentDocsDir, file)
    const mapped = docContentFileToAppRoute(rel)
    if (!mapped || mapped.locale !== locale)
      continue

    const raw = readFileSync(file, 'utf8')
    const { frontmatter, headingTitle, firstParagraph } = extractFrontmatterAndHeading(raw)
    const title = (typeof frontmatter.title === 'string' && frontmatter.title.trim())
      || headingTitle
      || fallbackTitleFromSlug(mapped.slug, locale)
    const description = (typeof frontmatter.description === 'string' && frontmatter.description.trim())
      || firstParagraph
      || ''
    const tags = Array.isArray(frontmatter.tags)
      ? frontmatter.tags.filter((t): t is string => typeof t === 'string' && Boolean(t.trim()))
      : []

    const { section, group } = resolveGroupKey(mapped.slug)
    rawItems.push({
      path: mapped.route,
      slug: mapped.slug,
      section,
      group,
      title,
      description,
      tags,
    })
  }

  const buildSection = (sectionKey: DocsSectionKey): TuffWebNavSection => {
    const sectionItems = rawItems.filter(item => item.section === sectionKey)
    const standalone = sortBySectionOrder(
      sectionItems.filter(item => !item.group),
      sectionKey,
    )

    const groupBuckets = new Map<string, TuffWebNavItem[]>()
    for (const item of sectionItems) {
      if (!item.group)
        continue
      const list = groupBuckets.get(item.group) ?? []
      list.push(item)
      groupBuckets.set(item.group, list)
    }

    const groupOrder = SECTION_ORDER[sectionKey] ?? []
    const groupOrderMap = new Map(groupOrder.map((key, idx) => [key, idx]))

    const groups: TuffWebNavGroup[] = [...groupBuckets.entries()]
      .sort(([a], [b]) => {
        const ai = groupOrderMap.has(a) ? groupOrderMap.get(a)! : Number.POSITIVE_INFINITY
        const bi = groupOrderMap.has(b) ? groupOrderMap.get(b)! : Number.POSITIVE_INFINITY
        if (ai !== bi)
          return ai - bi
        return a.localeCompare(b)
      })
      .map(([groupKey, list]) => {
        const sorted = sortBySectionOrder(list, groupKey)
        const groupIndexItem = sorted.find(item => item.slug === groupKey)
        const labelPair = GROUP_LABELS[groupKey]
        const title = labelPair
          ? labelPair[locale]
          : (groupIndexItem?.title ?? fallbackTitleFromSlug(groupKey, locale))
        return {
          key: groupKey,
          title,
          entryPath: groupIndexItem?.path ?? sorted[0]?.path ?? null,
          items: sorted,
        }
      })

    return {
      key: sectionKey,
      entryPath: sectionKey === 'guide' ? `/${locale}/docs/guide/start` : `/${locale}/docs/dev`,
      standalone,
      groups,
    }
  }

  const sections: TuffWebNavSection[] = [
    buildSection('guide'),
    buildSection('dev'),
  ]

  const orderedItems: TuffWebNavItem[] = []
  const seen = new Set<string>()
  const pushUnique = (item: TuffWebNavItem) => {
    if (seen.has(item.path))
      return
    seen.add(item.path)
    orderedItems.push(item)
  }

  for (const rootItem of rawItems.filter(i => i.section === 'root').sort((a, b) => a.slug.localeCompare(b.slug)))
    pushUnique(rootItem)
  for (const section of sections) {
    for (const item of section.standalone)
      pushUnique(item)
    for (const group of section.groups) {
      for (const item of group.items)
        pushUnique(item)
    }
  }

  return {
    locale,
    sections,
    items: orderedItems,
  }
}
