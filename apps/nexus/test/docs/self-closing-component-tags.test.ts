import type { MDCElement, MDCNode, MDCParseOptions, MDCRoot } from '@nuxtjs/mdc'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parseMarkdown } from '@nuxtjs/mdc/runtime'
import { describe, expect, it, vi } from 'vitest'
import { remarkCloseComponentTags } from '~/utils/remark-close-component-tags'

/**
 * A component tag the HTML parser leaves open swallows every block after it, and a component
 * without a slot renders none of them. `<TuffDocSourceLink />` did this on 80 component pages:
 * the "使用场景" / "相关组件" / "自定义" sections and the trailing notes after the source link
 * never rendered, while every other gate stayed green (`check:mdc-fences` only sees `:::` runs).
 *
 * `remarkCloseComponentTags` fixes it inside the content pipeline. This guard parses the real
 * pages with the remark plugins `nuxt.config.ts` hands to @nuxt/content, so it fails if the
 * plugin is unregistered, stops running, or meets a tag form it does not close.
 */

const nexusRoot = join(import.meta.dirname, '../..')
const docsRoot = join(nexusRoot, 'content/docs')
const componentDocsRoot = join(docsRoot, 'dev/components')

/** Pages whose sections after the source link went missing (reported 2026-09-26). */
const SPOT_CHECK_PAGES = ['fusion-surface', 'choice-card', 'button'].flatMap(slug =>
  (['zh', 'en'] as const).map(locale => `${slug}.${locale}.mdc`))

type RemarkPlugins = NonNullable<NonNullable<MDCParseOptions['remark']>['plugins']>

interface ContentMarkdownConfig {
  remarkPlugins: RemarkPlugins
  toc?: MDCParseOptions['toc']
}

let contentMarkdownConfig: Promise<ContentMarkdownConfig> | undefined

function loadContentMarkdownConfig() {
  contentMarkdownConfig ??= (async () => {
    vi.stubGlobal('defineNuxtConfig', (config: unknown) => config)
    const { default: config } = await import('../../nuxt.config')
    return (config as { content: { build: { markdown: ContentMarkdownConfig } } }).content.build.markdown
  })()
  return contentMarkdownConfig
}

/** What @nuxt/content's markdown transformer passes to MDC; `configured: false` is MDC alone. */
async function parseDoc(source: string, { configured = true } = {}) {
  const markdown = await loadContentMarkdownConfig()
  const { body } = await parseMarkdown(source, {
    highlight: false,
    toc: markdown.toc,
    remark: { plugins: configured ? markdown.remarkPlugins : {} },
  })
  return body
}

function isElement(node: MDCNode): node is MDCElement {
  return node.type === 'element'
}

function textOf(node: MDCNode): string {
  if (node.type === 'text')
    return node.value
  return isElement(node) ? node.children.map(textOf).join('') : ''
}

/**
 * Everything that reads as swallowed: a source link with content inside it, or a heading that is
 * not a child of the root. No docs page nests a heading on purpose; if one ever needs to, give it
 * an explicit exception here rather than loosening the rule.
 */
function findSwallowedContent(body: MDCRoot): string[] {
  const problems: string[] = []
  const visit = (node: MDCElement, ancestors: string[]) => {
    if (node.tag === 'tuff-doc-source-link' && node.children.length)
      problems.push(`<${node.tag}> holds ${node.children.filter(isElement).map(child => `<${child.tag}>`).join(' ')}`)
    if (/^h[1-6]$/.test(node.tag) && ancestors.length)
      problems.push(`<${node.tag}> "${textOf(node).trim()}" is nested in <${ancestors.join('> <')}>`)
    for (const child of node.children.filter(isElement))
      visit(child, [...ancestors, node.tag])
  }
  for (const node of body.children.filter(isElement))
    visit(node, [])
  return problems
}

/**
 * `## ` headings that follow the first source link in the file, outside code fences, or `null`
 * when the page has no source link on a line of its own.
 */
function headingsAfterSourceLink(source: string): string[] | null {
  const lines = source.split('\n')
  const start = lines.findIndex(line => line.trimStart().startsWith('<TuffDocSourceLink'))
  if (start === -1)
    return null

  const headings: string[] = []
  let inFence = false
  for (const line of lines.slice(start + 1)) {
    if (/^\s*(?:```|~~~)/.test(line))
      inFence = !inFence
    else if (!inFence && /^##\s/.test(line))
      headings.push(line.replace(/^##\s+/, '').trim())
  }
  return headings
}

function rootHeadings(body: MDCRoot): string[] {
  return body.children.filter(isElement).filter(node => node.tag === 'h2').map(node => textOf(node).trim())
}

function walkDocs(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry)
    if (statSync(fullPath).isDirectory())
      return walkDocs(fullPath)
    return /\.mdc?$/.test(entry) ? [fullPath] : []
  })
}

describe('self-closing component tags in docs', () => {
  it('registers remarkCloseComponentTags with @nuxt/content, fingerprinted by its file', async () => {
    const { remarkPlugins } = await loadContentMarkdownConfig()
    const entry = remarkPlugins['remark-close-component-tags']
    expect(entry && entry.instance).toBe(remarkCloseComponentTags)

    // @nuxt/content's parse cache sees a function by its own source only. Without the revision,
    // an edit to the plugin's helpers would leave every cached page parsed by the old code.
    const plugin = readFileSync(join(nexusRoot, 'app/utils/remark-close-component-tags.ts'))
    expect(entry && entry.options).toEqual({ revision: createHash('sha256').update(plugin).digest('hex').slice(0, 12) })
  })

  it.each(SPOT_CHECK_PAGES)('%s renders the sections after its source link', async (fileName) => {
    const source = readFileSync(join(componentDocsRoot, fileName), 'utf8')
    const expected = headingsAfterSourceLink(source) ?? []
    expect(expected.length, 'the page no longer has a section after a <TuffDocSourceLink /> line; pick another page').toBeGreaterThan(0)

    // Control: MDC alone still swallows them, so this check can fail.
    const unfixed = await parseDoc(source, { configured: false })
    expect(rootHeadings(unfixed)).not.toEqual(expect.arrayContaining(expected))

    const body = await parseDoc(source)
    expect(rootHeadings(body)).toEqual(expect.arrayContaining(expected))
    expect(findSwallowedContent(body)).toEqual([])
  })

  it('no docs page loses content to an unclosed component tag', async () => {
    const files = walkDocs(docsRoot)
    expect(files.length).toBeGreaterThan(400)

    const problems: string[] = []
    for (const file of files) {
      const body = await parseDoc(readFileSync(file, 'utf8'))
      for (const problem of findSwallowedContent(body))
        problems.push(`${relative(nexusRoot, file)}: ${problem}`)
    }
    expect(problems).toEqual([])
  }, 120_000)
})
