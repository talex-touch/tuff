import type { H3Event } from 'h3'
import { queryCollection } from '@nuxt/content/server'
import { toDocsMarkdownPath } from '#shared/utils/docs-markdown'
import { cacheDocsContent } from '../utils/docsContentCache'

/**
 * `/llms.txt`: the component docs as an index for AI agents, in the llms.txt convention.
 *
 * Built from each page's frontmatter when the cache misses, so the template list follows the
 * pages instead of a hand-kept copy. Every entry links the page's raw Markdown source
 * (`<page>.md`), the file an agent should read rather than the rendered HTML.
 */

const COMPONENT_DOC_PREFIX = '/docs/dev/components/'
const OVERVIEW_PATH = `${COMPONENT_DOC_PREFIX}index`
const SUITE_SUFFIX = '-suite'
const TEMPLATE_PREFIX = `${COMPONENT_DOC_PREFIX}template-`

// The frontmatter category decides a template's group; the order here is the docs index's order.
const TEMPLATE_GROUPS = [
  { category: 'TemplateApp', heading: 'App shells' },
  { category: 'TemplateContent', heading: 'Content' },
  { category: 'TemplateAi', heading: 'AI apps' },
  { category: 'TemplateData', heading: 'Data & flow' },
]

interface LlmsDocEntry {
  /** The canonical `/docs/...` path, without the locale suffix. */
  docPath: string
  title: string
  description: string
  category: string | null
}

function parseDocMeta(meta: unknown): Record<string, unknown> {
  let value = meta
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    }
    catch {
      return {}
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

// Nuxt Content keeps a page's frontmatter on the row or inside its `meta` JSON, depending on the
// page, so each field is read from both, the same way the sidebar endpoint does.
function firstText(...values: unknown[]) {
  const found = values.find(value => typeof value === 'string' && value.trim())
  return typeof found === 'string' ? found : ''
}

const resolveLlmsDocEntries = cacheDocsContent(async (event: H3Event) => {
  const docs = await queryCollection(event, 'docs')
    .where('path', 'LIKE', `${COMPONENT_DOC_PREFIX}%.en`)
    .all()

  return docs
    .filter(item => typeof item?.path === 'string')
    .map<LlmsDocEntry>((item) => {
      const record = item as unknown as Record<string, unknown>
      const meta = parseDocMeta(record.meta)
      return {
        docPath: String(item.path).replace(/\.en$/, ''),
        title: firstText(record.title, meta.title) || String(item.path),
        description: firstText(record.description, meta.description),
        category: firstText(record.category, meta.category) || null,
      }
    })
    .sort((a, b) => a.docPath.localeCompare(b.docPath))
}, {
  name: 'docs-llms-txt',
  getKey: () => 'locale:en',
  // The component docs collection is never legitimately empty.
  treatEmptyAsUnavailable: true,
})

function buildEntryLine(entry: LlmsDocEntry, origin: string) {
  const url = new URL(toDocsMarkdownPath(entry.docPath, 'en'), origin).href
  return entry.description
    ? `- [${entry.title}](${url}): ${entry.description}`
    : `- [${entry.title}](${url})`
}

function buildLlmsText(entries: LlmsDocEntry[], origin: string) {
  const line = (entry: LlmsDocEntry) => buildEntryLine(entry, origin)
  const overview = entries.filter(entry => entry.docPath === OVERVIEW_PATH)
  const suites = entries.filter(entry =>
    entry.docPath.startsWith(COMPONENT_DOC_PREFIX) && entry.docPath.endsWith(SUITE_SUFFIX),
  )
  const templates = entries.filter(entry => entry.docPath.startsWith(TEMPLATE_PREFIX))
  const groups = [
    ...TEMPLATE_GROUPS.map(group => ({
      heading: group.heading,
      items: templates.filter(entry => entry.category === group.category),
    })),
    {
      heading: 'Other',
      items: templates.filter(entry => !TEMPLATE_GROUPS.some(group => group.category === entry.category)),
    },
  ]

  const lines = [
    '# Tuffex component docs',
    '',
    '> Tuffex (`@talex-touch/tuffex`) is the Vue 3 component library behind CoreBox, plugin surfaces, and the Nexus docs site. Each link points to the raw Markdown source of a page.',
    '',
    '## Overview',
    ...overview.map(line),
    '',
    '## Suites',
    ...suites.map(line),
    '',
    '## Templates',
    '',
    'Full-page compositions of existing components. They exist only in the docs and are not importable components.',
  ]
  for (const group of groups) {
    if (!group.items.length)
      continue
    lines.push('', `### ${group.heading}`, ...group.items.map(line))
  }
  return `${lines.join('\n')}\n`
}

export default defineEventHandler(async (event) => {
  const entries = await resolveLlmsDocEntries(event)
  setHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
  return buildLlmsText(entries, getRequestURL(event).origin)
})
