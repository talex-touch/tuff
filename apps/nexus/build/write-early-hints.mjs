import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CLOUDFLARE_HEADERS_MAX_LINE_LENGTH, publicPrerenderRoutes } from './nexus-static-routes.mjs'

/**
 * Writes `Link` headers for the assets every page in a route family needs first, so Cloudflare
 * Pages can send them as `103 Early Hints` before the HTML itself is ready.
 *
 * Pages turns `preload`/`preconnect` `Link` headers in `_headers` into Early Hints. The browser
 * then starts fetching the entry stylesheet and script during the HTML round trip instead of
 * after parsing the head — on the 1–2 s round trips measured from CN that is one hop off the
 * first paint of every page. The file names are hashed per build, so they are read from the
 * prerendered HTML here rather than written into config.
 *
 * A family's hints are the assets common to every sample page in it: the entry script, the
 * entry stylesheet and the layout stylesheet. Anything page-specific stays out, because a hint
 * for an asset a page does not use is a download it pays for anyway.
 *
 * Two facts about the file format decide the shape of the output:
 * - Pages keys header rules by pattern, so a second `/en/docs/*` block replaces the first
 *   instead of adding to it. The `Link` line is merged into the block nitro already wrote for
 *   that pattern (the docs cache window lives there); only patterns nitro did not write get a
 *   block of their own, under the marker.
 * - A line over 2 000 characters is dropped, silently in production. The landing page links
 *   thirty-odd stylesheets, so `formatLinkHeader` adds entries in document order and stops
 *   before the value would cross the cap.
 */
export const earlyHintFamilies = [
  ...publicPrerenderRoutes.map(route => ({
    pattern: route,
    samples: [route === '/' ? 'index.html' : `${route.replace(/^\//, '')}.html`],
  })),
  { pattern: '/en/docs/*', samples: ['en/docs.html', 'en/docs/dev/components/button.html', 'en/docs/guide/start.html'] },
  { pattern: '/zh/docs/*', samples: ['zh/docs.html', 'zh/docs/dev/components/button.html', 'zh/docs/guide/start.html'] },
]

const ENTRY_SCRIPT_RE = /<script[^>]*\btype="module"[^>]*\bsrc="(\/_nuxt\/[^"]+\.js)"/
const STYLESHEET_RE = /<link\b(?=[^>]*\brel="stylesheet")[^>]*\bhref="(\/_nuxt\/[^"]+\.css)"/g

/** Pages measures the trimmed line, `Link: ` included. */
const MAX_LINK_VALUE_LENGTH = CLOUDFLARE_HEADERS_MAX_LINE_LENGTH - 'Link: '.length

export function extractEarlyHintTargets(html) {
  const entry = html.match(ENTRY_SCRIPT_RE)?.[1] ?? null
  const styles = Array.from(html.matchAll(STYLESHEET_RE), match => match[1])
  return { entry, styles }
}

/** Assets shared by every sample: entry script if all agree, stylesheets present in all. */
export function intersectEarlyHintTargets(targets) {
  if (!targets.length)
    return { entry: null, styles: [] }
  const [first, ...rest] = targets
  const entry = rest.every(target => target.entry === first.entry) ? first.entry : null
  const styles = first.styles.filter(style => rest.every(target => target.styles.includes(style)))
  return { entry, styles }
}

/**
 * Every entry carries `crossorigin` because Nuxt renders its `<link>` and `<script>` tags with
 * it: a preload whose credentials mode differs from the tag's is never matched to it, and the
 * browser downloads the file a second time. Entries go in document order — entry script, entry
 * stylesheet, layout sheets — and stop before the next one would push the value over the limit.
 */
export function formatLinkHeader({ entry, styles }, maxLength = MAX_LINK_VALUE_LENGTH) {
  const parts = []
  if (entry)
    parts.push(`<${entry}>; rel=modulepreload; crossorigin`)
  for (const style of styles)
    parts.push(`<${style}>; rel=preload; as=style; crossorigin`)
  let value = ''
  for (const part of parts) {
    const next = value ? `${value}, ${part}` : part
    if (next.length > maxLength)
      break
    value = next
  }
  return value
}

export function renderEarlyHintBlocks(distRoot, families = earlyHintFamilies) {
  const blocks = []
  for (const family of families) {
    const targets = []
    for (const sample of family.samples) {
      const file = join(distRoot, sample)
      if (!existsSync(file))
        continue
      targets.push(extractEarlyHintTargets(readFileSync(file, 'utf8')))
    }
    if (!targets.length)
      continue
    const link = formatLinkHeader(intersectEarlyHintTargets(targets))
    if (!link)
      continue
    blocks.push({ pattern: family.pattern, link })
  }
  return blocks
}

export const EARLY_HINTS_MARKER = '# nexus: early hints (build/write-early-hints.mjs)'

/**
 * Folds the hints into `_headers`. A pattern nitro already wrote gets its `Link` line inside
 * that block; the rest get a block each under the marker. `Link` is owned by this step: any
 * existing `Link` line is dropped and rewritten, so running twice yields the same file.
 */
export function mergeEarlyHintBlocks(source, blocks) {
  const linkByPattern = new Map(blocks.map(block => [block.pattern, block.link]))
  const markerIndex = source.indexOf(EARLY_HINTS_MARKER)
  const base = markerIndex === -1 ? source : source.slice(0, markerIndex)
  const lines = []
  const merged = new Set()
  let current = null

  const closeBlock = () => {
    if (current && linkByPattern.has(current)) {
      let end = lines.length
      while (end > 0 && !lines[end - 1].trim())
        end -= 1
      lines.splice(end, 0, `  Link: ${linkByPattern.get(current)}`)
      merged.add(current)
    }
    current = null
  }

  for (const rawLine of base.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line && /^\s/.test(rawLine)) {
      if (!/^link:/i.test(line))
        lines.push(rawLine)
      continue
    }
    if (line && !line.startsWith('#')) {
      closeBlock()
      current = line
    }
    lines.push(rawLine)
  }
  closeBlock()
  while (lines.length && !lines[lines.length - 1].trim())
    lines.pop()

  const appended = blocks.filter(block => !merged.has(block.pattern))
  const sections = [lines.join('\n')]
  if (appended.length)
    sections.push(`${EARLY_HINTS_MARKER}\n${appended.map(block => `${block.pattern}\n  Link: ${block.link}`).join('\n')}`)
  return `${sections.filter(Boolean).join('\n\n')}\n`
}

export function writeEarlyHints(distRoot) {
  const headersPath = join(distRoot, '_headers')
  const existing = existsSync(headersPath) ? readFileSync(headersPath, 'utf8') : ''
  const blocks = renderEarlyHintBlocks(distRoot)
  if (!blocks.length)
    throw new Error('[nexus-early-hints] no prerendered HTML found to derive Link headers from')
  writeFileSync(headersPath, mergeEarlyHintBlocks(existing, blocks))
  return blocks
}

const currentFile = fileURLToPath(import.meta.url)
if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  const distRoot = resolve(dirname(currentFile), '..', 'dist')
  const blocks = writeEarlyHints(distRoot)
  console.log(`[nexus-early-hints] wrote Link headers for ${blocks.length} route families`)
}
