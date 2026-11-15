import { parseDocsMarkdownRoute } from '#shared/utils/docs-markdown'
import { readDocsMarkdownSource } from '../utils/docsMarkdownSource'

// Template pages are full-page compositions that an agent rebuilds from their source, so their raw
// Markdown opens with the constraints the page assumes. The text is inline on purpose: it is prompt
// material in two languages, not UI copy, and stays out of the locale catalogs.
const TEMPLATE_DOC_PATH = /^\/docs\/dev\/components\/template-[^/]+$/
const TEMPLATE_PREFACE = {
  zh: [
    '> **模板约束（文档站）**：下面的约定来自 Nexus 模板规范，改写或复刻本页时遵守。',
    '>',
    '> - 整页放进 `TemplateFrame`，由它负责展开、收起与尺寸。不要显式 import `Tx*` 组件，它们自动注册。',
    '> - 演示从 `@enter` 开始播放，不要放在 `onMounted` 里。',
    '> - 快捷键绑在模板根元素上，不绑 `window` 或 `document`。',
    '> - 反馈放在舞台内的 `TxToastPanel` 里。禁止 `toast()`、`clearToasts()`、`TxToastHost`、`TxTouchTip`、`TxBottomDialog` 与 `TxBlowDialog`。',
    '> - 完整规范见 `docs/engineering/specs/frontend/nexus-docs-templates.md`。',
  ].join('\n'),
  en: [
    '> **Template constraints (docs site)**: the rules below come from the Nexus template spec. Follow them when you rewrite or reproduce this page.',
    '>',
    '> - Put the whole page inside `TemplateFrame`, which owns expand, collapse and sizing. Do not import `Tx*` components explicitly; they are auto-registered.',
    '> - Start scripted playback from `@enter`, never from `onMounted`.',
    '> - Bind keyboard shortcuts on the template root, never on `window` or `document`.',
    '> - Show feedback in a `TxToastPanel` inside the stage. Do not use `toast()`, `clearToasts()`, `TxToastHost`, `TxTouchTip`, `TxBottomDialog` or `TxBlowDialog`.',
    '> - The full rules are in `docs/engineering/specs/frontend/nexus-docs-templates.md`.',
  ].join('\n'),
} as const
const FRONTMATTER_BLOCK = /^---\r?\n[\s\S]*?\r?\n---\r?\n/

/** Puts the preface after the frontmatter, so the page's metadata still parses first. */
function withTemplatePreface(source: string, locale: 'en' | 'zh') {
  const frontmatter = source.match(FRONTMATTER_BLOCK)?.[0] ?? ''
  const body = source.slice(frontmatter.length).replace(/^\r?\n+/, '')
  const head = frontmatter ? `${frontmatter}\n` : ''
  return `${head}${TEMPLATE_PREFACE[locale]}\n\n${body}`
}

/**
 * Serves the Markdown source of a docs page at `/<locale>/docs/<path>.md`.
 *
 * Middleware rather than a route file because the URL ends in a literal suffix after a
 * catch-all segment, which the route matcher cannot express. The pathname test below is a
 * single regex, the same cost as the neighbouring legacy-redirect middleware.
 *
 * Every one of these URLs is prerendered into a static file, so in production Pages answers
 * from disk and this handler never runs. It stays in the Worker only to answer development
 * requests; there the filesystem is present. If it is ever reached in a deployed Worker the
 * source read returns `null` and the answer is a 404, never a guess.
 */
export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)
  const route = parseDocsMarkdownRoute(url.pathname)
  if (!route)
    return

  const source = await readDocsMarkdownSource(route.path, route.locale)
  if (source === null)
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })

  setHeader(event, 'Content-Type', 'text/markdown; charset=utf-8')
  return TEMPLATE_DOC_PATH.test(route.path) ? withTemplatePreface(source, route.locale) : source
})
