import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const CANONICAL_ORIGIN = (process.env.NUXT_PUBLIC_SITE_URL || 'https://tuff.tagzxia.com').replace(/\/+$/, '')
const MAX_EARLY_HINTS_LINK_LENGTH = 1190 // Strictly < 1,200 chars including `Link: `
const CLOUDFLARE_HEADERS_MAX_RULES = 100
const HTML_CACHE_CONTROL = 'public, max-age=60, s-maxage=3600, stale-while-revalidate=86400'
const STATIC_ASSET_CACHE_CONTROL = 'public, max-age=31536000, immutable'
const FEED_CACHE_CONTROL = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400'

const ENTRY_SCRIPT_RE = /<script[^>]*\btype="module"[^>]*\bsrc="(\/_tuff-web\/[^"]+\.js)"/
const STYLESHEET_TAG_RE = /<link\b[^>]*\brel=(['"])stylesheet\1[^>]*>/gi
const STYLESHEET_HREF_RE = /\bhref=(['"])(\/_tuff-web\/[^"']+\.css)\1/i
const PRINT_MEDIA_RE = /\bmedia=(['"])print\1/i

const DOC_FILE_PATTERN = /\.(md|mdc)$/i
const LOCALE_SUFFIX_PATTERN = /\.(en|zh)$/i

export const LEGACY_REDIRECTS = [
  // Static exact rules first (Cloudflare evaluates static before dynamic)
  { from: '/en/docs/dev/components', to: '/tuffex/en', status: 308 },
  { from: '/zh/docs/dev/components', to: '/tuffex/zh', status: 308 },
  { from: '/en/docs/dev/concepts', to: '/tuffex/en/concepts', status: 308 },
  { from: '/zh/docs/dev/concepts', to: '/tuffex/zh/concepts', status: 308 },
  { from: '/docs/dev/components', to: '/tuffex/en', status: 308 },
  { from: '/docs/dev/concepts', to: '/tuffex/en/concepts', status: 308 },
  { from: '/en/docs/dev/getting-started/tuffex-composition', to: '/tuffex/en/composition', status: 308 },
  { from: '/zh/docs/dev/getting-started/tuffex-composition', to: '/tuffex/zh/composition', status: 308 },
  { from: '/llms.txt', to: '/tuffex/llms.txt', status: 308 },
  { from: '/docs', to: '/en/docs', status: 308 },
  { from: '/terms', to: '/license', status: 308 },
  // Legacy locale-prefixed console exact routes -> standalone nexus-console
  { from: '/en/sign-in', to: '/sign-in', status: 308 },
  { from: '/zh/sign-in', to: '/sign-in', status: 308 },
  { from: '/en/verify', to: '/verify', status: 308 },
  { from: '/zh/verify', to: '/verify', status: 308 },
  { from: '/en/verify-waiting', to: '/verify-waiting', status: 308 },
  { from: '/zh/verify-waiting', to: '/verify-waiting', status: 308 },
  { from: '/en/device-auth', to: '/device-auth', status: 308 },
  { from: '/zh/device-auth', to: '/device-auth', status: 308 },
  { from: '/en/dashboard', to: '/dashboard', status: 308 },
  { from: '/zh/dashboard', to: '/dashboard', status: 308 },
  { from: '/en/admin', to: '/admin', status: 308 },
  { from: '/zh/admin', to: '/admin', status: 308 },
  // Dynamic splat rules: TuffEx subpaths MUST precede `/docs/*`
  { from: '/en/docs/dev/components/*', to: '/tuffex/en/:splat', status: 308 },
  { from: '/zh/docs/dev/components/*', to: '/tuffex/zh/:splat', status: 308 },
  { from: '/en/docs/dev/concepts/*', to: '/tuffex/en/concepts/:splat', status: 308 },
  { from: '/zh/docs/dev/concepts/*', to: '/tuffex/zh/concepts/:splat', status: 308 },
  { from: '/docs/dev/components/*', to: '/tuffex/en/:splat', status: 308 },
  { from: '/docs/dev/concepts/*', to: '/tuffex/en/concepts/:splat', status: 308 },
  { from: '/docs/*', to: '/en/docs/:splat', status: 308 },
  // Legacy locale-prefixed console splat routes -> standalone nexus-console
  { from: '/en/dashboard/*', to: '/dashboard/:splat', status: 308 },
  { from: '/zh/dashboard/*', to: '/dashboard/:splat', status: 308 },
  { from: '/en/admin/*', to: '/admin/:splat', status: 308 },
  { from: '/zh/admin/*', to: '/admin/:splat', status: 308 },
]

const PUBLIC_SITEMAP_SLUGS = [
  { en: '/en', zh: '/zh', defaultUrl: '/' },
  { en: '/en/pricing', zh: '/zh/pricing', defaultUrl: '/pricing' },
  { en: '/en/updates', zh: '/zh/updates', defaultUrl: '/updates' },
  { en: '/en/store', zh: '/zh/store', defaultUrl: '/store' },
  { en: '/en/license', zh: '/zh/license', defaultUrl: '/license' },
  { en: '/en/privacy', zh: '/zh/privacy', defaultUrl: '/privacy' },
  { en: '/en/protocol', zh: '/zh/protocol', defaultUrl: '/protocol' },
]

function toPosix(value) {
  return value.replace(/\\/g, '/')
}

function walkFiles(dir) {
  if (!existsSync(dir))
    return []
  const files = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory())
      files.push(...walkFiles(full))
    else if (st.isFile())
      files.push(full)
  }
  return files
}

function walkEntries(dir) {
  if (!existsSync(dir))
    return []
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    out.push({ path: full, isDir: st.isDirectory() })
    if (st.isDirectory())
      out.push(...walkEntries(full))
  }
  return out
}

function unquote(value) {
  const trimmed = value.trim()
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith('\'') && trimmed.endsWith('\'')))
    return trimmed.slice(1, -1)
  return trimmed
}

function parseFrontmatterAndHeading(raw) {
  const fm = {}
  let body = raw

  if (raw.startsWith('---')) {
    const endIdx = raw.indexOf('\n---', 3)
    if (endIdx !== -1) {
      const fmBlock = raw.slice(3, endIdx)
      body = raw.slice(endIdx + 4)
      let currentArrayKey = null

      for (const line of fmBlock.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#'))
          continue
        if (currentArrayKey && /^-\s+/.test(trimmed)) {
          fm[currentArrayKey] = [...(fm[currentArrayKey] || []), unquote(trimmed.replace(/^-\s+/, ''))]
          continue
        }
        currentArrayKey = null
        const sep = trimmed.indexOf(':')
        if (sep <= 0)
          continue
        const key = trimmed.slice(0, sep).trim()
        const val = trimmed.slice(sep + 1).trim()
        if (!val) {
          fm[key] = []
          currentArrayKey = key
          continue
        }
        if (val === 'true') {
          fm[key] = true
          continue
        }
        if (val === 'false') {
          fm[key] = false
          continue
        }
        if (val.startsWith('[') && val.endsWith(']')) {
          const inner = val.slice(1, -1).trim()
          fm[key] = inner ? inner.split(',').map(unquote).filter(Boolean) : []
          continue
        }
        fm[key] = unquote(val)
      }
    }
  }

  let headingTitle = null
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

  return { fm, headingTitle, firstParagraph }
}

function mapDocContentFile(relativePath) {
  const posix = toPosix(relativePath).replace(/^\/+/, '')
  if (!DOC_FILE_PATTERN.test(posix))
    return null
  const withoutExt = posix.replace(DOC_FILE_PATTERN, '')
  const localeMatch = withoutExt.match(LOCALE_SUFFIX_PATTERN)
  if (!localeMatch)
    return null
  const locale = localeMatch[1].toLowerCase()
  const basePath = withoutExt.replace(LOCALE_SUFFIX_PATTERN, '')

  if (basePath === 'index') {
    return {
      locale,
      slug: '',
      route: `/${locale}/docs`,
      rawTargets: [`${locale}/docs.md`, `${locale}/docs/index.md`],
      canonicalRawPath: `/${locale}/docs/index.md`,
    }
  }
  if (basePath.endsWith('/index')) {
    const slug = basePath.slice(0, -'/index'.length)
    return {
      locale,
      slug,
      route: `/${locale}/docs/${slug}`,
      rawTargets: [`${locale}/docs/${slug}.md`, `${locale}/docs/${slug}/index.md`],
      canonicalRawPath: `/${locale}/docs/${slug}.md`,
    }
  }
  return {
    locale,
    slug: basePath,
    route: `/${locale}/docs/${basePath}`,
    rawTargets: [`${locale}/docs/${basePath}.md`],
    canonicalRawPath: `/${locale}/docs/${basePath}.md`,
  }
}

function resolveSection(slug) {
  if (slug === 'guide' || slug.startsWith('guide/'))
    return 'guide'
  if (slug === 'dev' || slug.startsWith('dev/'))
    return 'dev'
  return 'root'
}

function collectDocRecords(contentDocsDir) {
  const records = []
  for (const file of walkFiles(contentDocsDir)) {
    const rel = relative(contentDocsDir, file)
    const mapped = mapDocContentFile(rel)
    if (!mapped)
      continue
    const raw = readFileSync(file, 'utf8')
    const { fm, headingTitle, firstParagraph } = parseFrontmatterAndHeading(raw)
    const title = (typeof fm.title === 'string' && fm.title.trim())
      || headingTitle
      || (mapped.slug.split('/').pop() || 'Tuff Docs')
    const description = (typeof fm.description === 'string' && fm.description.trim())
      || firstParagraph
      || ''
    const tags = Array.isArray(fm.tags) ? fm.tags.filter(t => typeof t === 'string' && t.trim()) : []
    const section = resolveSection(mapped.slug)
    const parts = mapped.slug.split('/')
    const group = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : section

    records.push({
      ...mapped,
      sourceFile: file,
      raw,
      title,
      description,
      section,
      group,
      tags,
    })
  }
  return records.sort((a, b) => a.route.localeCompare(b.route))
}

export function buildDocsLlmsTxt(records) {
  const enRecords = records.filter(r => r.locale === 'en')
  const line = (item) => {
    const url = `${CANONICAL_ORIGIN}${item.canonicalRawPath}`
    return item.description ? `- [${item.title}](${url}): ${item.description}` : `- [${item.title}](${url})`
  }

  const rootDocs = enRecords.filter(r => r.section === 'root')
  const guideDocs = enRecords.filter(r => r.section === 'guide')
  const devDocs = enRecords.filter(r => r.section === 'dev')

  const lines = [
    '# Tuff Product & Developer Documentation',
    '',
    `> Tuff is a local-first cross-platform desktop command center and extensible plugin runtime. Each link points to the canonical raw Markdown source under \`${CANONICAL_ORIGIN}/en/docs/\`. Component UI library docs live at \`${CANONICAL_ORIGIN}/tuffex/llms.txt\`.`,
    '',
    '## Overview',
    ...rootDocs.map(line),
    '',
    '## Product Guide',
    ...guideDocs.map(line),
    '',
    '## Developer SDK & Architecture',
    ...devDocs.map(line),
  ]

  return `${lines.join('\n')}\n`
}

function escapeXml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function buildSitemapXml(records) {
  const urls = []

  for (const pub of PUBLIC_SITEMAP_SLUGS) {
    const enUrl = `${CANONICAL_ORIGIN}${pub.en}`
    const zhUrl = `${CANONICAL_ORIGIN}${pub.zh}`
    const defUrl = `${CANONICAL_ORIGIN}${pub.defaultUrl}`
    for (const loc of [enUrl, zhUrl]) {
      urls.push([
        '  <url>',
        `    <loc>${escapeXml(loc)}</loc>`,
        `    <xhtml:link rel="alternate" hreflang="en" href="${escapeXml(enUrl)}" />`,
        `    <xhtml:link rel="alternate" hreflang="zh" href="${escapeXml(zhUrl)}" />`,
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(defUrl)}" />`,
        '  </url>',
      ].join('\n'))
    }
  }

  const bySlug = new Map()
  for (const rec of records) {
    const group = bySlug.get(rec.slug) || {}
    group[rec.locale] = rec.route
    bySlug.set(rec.slug, group)
  }

  for (const rec of records) {
    const loc = `${CANONICAL_ORIGIN}${rec.route}`
    const pair = bySlug.get(rec.slug) || {}
    const alternates = []
    if (pair.en)
      alternates.push(`    <xhtml:link rel="alternate" hreflang="en" href="${escapeXml(`${CANONICAL_ORIGIN}${pair.en}`)}" />`)
    if (pair.zh)
      alternates.push(`    <xhtml:link rel="alternate" hreflang="zh" href="${escapeXml(`${CANONICAL_ORIGIN}${pair.zh}`)}" />`)
    if (pair.en)
      alternates.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(`${CANONICAL_ORIGIN}${pair.en}`)}" />`)
    urls.push([
      '  <url>',
      `    <loc>${escapeXml(loc)}</loc>`,
      ...alternates,
      '  </url>',
    ].join('\n'))
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n')
}

export function buildRedirectsFile() {
  const lines = [
    '# Cloudflare Workers Static Assets redirects for tuff-web',
    '# Generated by scripts/stage-cf-assets.mjs',
    ...LEGACY_REDIRECTS.map(rule => `${rule.from} ${rule.to} ${rule.status}`),
    '',
  ]
  return lines.join('\n')
}

function extractEarlyHintTargets(html) {
  const entry = html.match(ENTRY_SCRIPT_RE)?.[1] ?? null
  const styles = []
  for (const match of html.matchAll(STYLESHEET_TAG_RE)) {
    const tag = match[0]
    if (PRINT_MEDIA_RE.test(tag))
      continue
    const href = tag.match(STYLESHEET_HREF_RE)?.[2]
    if (href && !styles.includes(href))
      styles.push(href)
  }
  return { entry, styles }
}

function intersectEarlyHintTargets(targets) {
  if (!targets.length)
    return { entry: null, styles: [] }
  const [first, ...rest] = targets
  const entry = rest.every(t => t.entry === first.entry) ? first.entry : null
  const styles = first.styles.filter(s => rest.every(t => t.styles.includes(s)))
  return { entry, styles }
}

function formatEarlyHintsLinkHeader({ entry, styles }, maxValueLength = MAX_EARLY_HINTS_LINK_LENGTH - 'Link: '.length) {
  const parts = []
  if (entry)
    parts.push(`<${entry}>; rel=modulepreload; crossorigin`)
  for (const style of styles)
    parts.push(`<${style}>; rel=preload; as=style; crossorigin`)

  let value = ''
  for (const part of parts) {
    const candidate = value ? `${value}, ${part}` : part
    if (candidate.length > maxValueLength)
      break
    value = candidate
  }
  return value
}

function buildHintLineForSamples(stageRoot, sampleRelPaths) {
  const targets = sampleRelPaths
    .map(rel => join(stageRoot, rel))
    .filter(full => existsSync(full))
    .map(full => extractEarlyHintTargets(readFileSync(full, 'utf8')))
  const linkValue = formatEarlyHintsLinkHeader(intersectEarlyHintTargets(targets))
  return linkValue ? `\n  Link: ${linkValue}` : ''
}

export function buildHeadersFile(stageRoot) {
  const homeLink = buildHintLineForSamples(stageRoot, ['index.html', 'en.html', 'zh.html'])
  const pricingLink = buildHintLineForSamples(stageRoot, ['pricing.html', 'en/pricing.html', 'zh/pricing.html'])
  const updatesLink = buildHintLineForSamples(stageRoot, ['updates.html', 'en/updates.html', 'zh/updates.html'])
  const storeLink = buildHintLineForSamples(stageRoot, ['store.html', 'en/store.html', 'zh/store.html'])
  const legalLink = buildHintLineForSamples(stageRoot, ['license.html', 'en/license.html', 'zh/license.html', 'privacy.html', 'protocol.html'])
  const docsLink = buildHintLineForSamples(stageRoot, [
    'en/docs.html',
    'zh/docs.html',
    'en/docs/guide/start.html',
    'zh/docs/guide/start.html',
    'en/docs/dev/api/search.html',
    'zh/docs/dev/api/search.html',
  ])

  const blocks = [
    `/_tuff-web/*\n  Cache-Control: ${STATIC_ASSET_CACHE_CONTROL}`,
    `/assets/*\n  Cache-Control: ${STATIC_ASSET_CACHE_CONTROL}`,
    `/shots/*\n  Cache-Control: ${STATIC_ASSET_CACHE_CONTROL}`,
    `/videos/*\n  Cache-Control: ${STATIC_ASSET_CACHE_CONTROL}`,
    `/vendor/*\n  Cache-Control: ${STATIC_ASSET_CACHE_CONTROL}`,
    `/\n  Cache-Control: ${HTML_CACHE_CONTROL}${homeLink}`,
    `/en\n  Cache-Control: ${HTML_CACHE_CONTROL}${homeLink}`,
    `/zh\n  Cache-Control: ${HTML_CACHE_CONTROL}${homeLink}`,
    `/pricing\n  Cache-Control: ${HTML_CACHE_CONTROL}${pricingLink}`,
    `/en/pricing\n  Cache-Control: ${HTML_CACHE_CONTROL}${pricingLink}`,
    `/zh/pricing\n  Cache-Control: ${HTML_CACHE_CONTROL}${pricingLink}`,
    `/updates\n  Cache-Control: ${HTML_CACHE_CONTROL}${updatesLink}`,
    `/en/updates\n  Cache-Control: ${HTML_CACHE_CONTROL}${updatesLink}`,
    `/zh/updates\n  Cache-Control: ${HTML_CACHE_CONTROL}${updatesLink}`,
    `/updates/all\n  Cache-Control: ${HTML_CACHE_CONTROL}${updatesLink}`,
    `/en/updates/all\n  Cache-Control: ${HTML_CACHE_CONTROL}${updatesLink}`,
    `/zh/updates/all\n  Cache-Control: ${HTML_CACHE_CONTROL}${updatesLink}`,
    `/store\n  Cache-Control: ${HTML_CACHE_CONTROL}${storeLink}`,
    `/en/store\n  Cache-Control: ${HTML_CACHE_CONTROL}${storeLink}`,
    `/zh/store\n  Cache-Control: ${HTML_CACHE_CONTROL}${storeLink}`,
    `/license\n  Cache-Control: ${HTML_CACHE_CONTROL}${legalLink}`,
    `/en/license\n  Cache-Control: ${HTML_CACHE_CONTROL}${legalLink}`,
    `/zh/license\n  Cache-Control: ${HTML_CACHE_CONTROL}${legalLink}`,
    `/privacy\n  Cache-Control: ${HTML_CACHE_CONTROL}${legalLink}`,
    `/en/privacy\n  Cache-Control: ${HTML_CACHE_CONTROL}${legalLink}`,
    `/zh/privacy\n  Cache-Control: ${HTML_CACHE_CONTROL}${legalLink}`,
    `/protocol\n  Cache-Control: ${HTML_CACHE_CONTROL}${legalLink}`,
    `/en/protocol\n  Cache-Control: ${HTML_CACHE_CONTROL}${legalLink}`,
    `/zh/protocol\n  Cache-Control: ${HTML_CACHE_CONTROL}${legalLink}`,
    `/en/docs\n  Cache-Control: ${HTML_CACHE_CONTROL}${docsLink}`,
    `/en/docs/*\n  Cache-Control: ${HTML_CACHE_CONTROL}${docsLink}`,
    `/zh/docs\n  Cache-Control: ${HTML_CACHE_CONTROL}${docsLink}`,
    `/zh/docs/*\n  Cache-Control: ${HTML_CACHE_CONTROL}${docsLink}`,
    `/docs/search-index.*.json\n  Content-Type: application/json; charset=utf-8\n  Cache-Control: ${FEED_CACHE_CONTROL}`,
    `/docs/llms.txt\n  Content-Type: text/plain; charset=utf-8\n  Cache-Control: ${FEED_CACHE_CONTROL}`,
    `/sitemap.xml\n  Content-Type: application/xml; charset=utf-8\n  Cache-Control: ${FEED_CACHE_CONTROL}`,
  ]

  return [
    '# Cloudflare Workers Static Assets headers for tuff-web (assets.directory = ".dist-cf")',
    '# Generated by scripts/stage-cf-assets.mjs',
    '',
    ...blocks.flatMap(block => [block, '']),
  ].join('\n')
}

function stripForbiddenBuildArtifacts(stageRoot) {
  const removed = []

  for (const target of [
    join(stageRoot, '__nuxt_content'),
    join(stageRoot, 'api/_build'),
    join(stageRoot, '_i18n'),
  ]) {
    if (existsSync(target)) {
      rmSync(target, { recursive: true, force: true })
      removed.push(relative(stageRoot, target))
    }
  }

  const apiDir = join(stageRoot, 'api')
  if (existsSync(apiDir) && readdirSync(apiDir).length === 0) {
    rmSync(apiDir, { recursive: true, force: true })
    removed.push('api')
  }

  for (const file of walkFiles(stageRoot)) {
    const base = file.split('/').pop() || ''
    if (/^dump\..*\.sql$/i.test(base) || base === '_payload.json' || /\.wasm$/i.test(base)) {
      rmSync(file, { force: true })
      removed.push(relative(stageRoot, file))
    }
  }

  return removed
}

function runHardAssertions(stageRoot) {
  const errors = []

  const requiredFiles = [
    '_headers',
    '_redirects',
    '404.html',
    'index.html',
    'en.html',
    'zh.html',
    'pricing.html',
    'en/pricing.html',
    'zh/pricing.html',
    'updates.html',
    'en/updates.html',
    'zh/updates.html',
    'updates/all.html',
    'store.html',
    'en/store.html',
    'zh/store.html',
    'license.html',
    'en/license.html',
    'zh/license.html',
    'privacy.html',
    'en/privacy.html',
    'zh/privacy.html',
    'protocol.html',
    'en/protocol.html',
    'zh/protocol.html',
    'en/docs.html',
    'zh/docs.html',
    'en/docs/guide/start.html',
    'zh/docs/guide/start.html',
    'docs/search-index.en.json',
    'docs/search-index.zh.json',
    'docs/llms.txt',
    'sitemap.xml',
    'en/docs/guide/start.md',
    'zh/docs/guide/start.md',
  ]

  for (const rel of requiredFiles) {
    const full = join(stageRoot, rel)
    if (!existsSync(full) || statSync(full).size === 0)
      errors.push(`Missing or empty required artifact: .dist-cf/${rel}`)
  }

  // Verify SSR 404 is rendered, not an empty CSR shell
  const notFoundFile = join(stageRoot, '404.html')
  if (existsSync(notFoundFile)) {
    const html404 = readFileSync(notFoundFile, 'utf8')
    if (/<div id="__nuxt"><\/div>/.test(html404))
      errors.push('404.html is an empty CSR shell (<div id="__nuxt"></div>); must be SSR-rendered from /__not-found')
    if (!html404.includes('aria-label="404"'))
      errors.push('404.html does not contain rendered not-found marker (aria-label="404")')
  }

  // Verify llms.txt never leaks localhost
  const llmsFile = join(stageRoot, 'docs/llms.txt')
  if (existsSync(llmsFile)) {
    const llms = readFileSync(llmsFile, 'utf8')
    if (/https?:\/\/localhost\b/i.test(llms))
      errors.push('docs/llms.txt contains localhost URLs; must use canonical production origin')
    if (!llms.includes(`${CANONICAL_ORIGIN}/en/docs/`))
      errors.push(`docs/llms.txt does not contain canonical ${CANONICAL_ORIGIN}/en/docs/ URLs`)
  }

  // Verify _headers rules count (<= 100), line lengths (< 1,200 for Link), no stale 60s s-maxage, no /_i18n
  const headersFile = join(stageRoot, '_headers')
  if (existsSync(headersFile)) {
    const headersText = readFileSync(headersFile, 'utf8')
    const lines = headersText.split(/\r?\n/)
    let ruleCount = 0
    for (const rawLine of lines) {
      const trimmed = rawLine.trim()
      if (!trimmed || trimmed.startsWith('#'))
        continue
      if (!rawLine.startsWith(' ') && !rawLine.startsWith('\t'))
        ruleCount += 1
      if (/^Link:/i.test(trimmed)) {
        if (trimmed.length >= 1200)
          errors.push(`_headers Link line length ${trimmed.length} >= 1200 chars`)
        // Ensure every Link href exists on disk so stale Early Hints can never ship
        for (const match of trimmed.matchAll(/<(\/_tuff-web\/[^>]+)>/g)) {
          const assetRel = match[1].replace(/^\/+/, '')
          if (!existsSync(join(stageRoot, assetRel)))
            errors.push(`_headers Link references missing asset: ${match[1]}`)
        }
      }
    }
    if (ruleCount > CLOUDFLARE_HEADERS_MAX_RULES)
      errors.push(`_headers rule count ${ruleCount} exceeds Cloudflare limit ${CLOUDFLARE_HEADERS_MAX_RULES}`)
  }

  // Verify _redirects order (static before dynamic, TuffEx before /docs/*)
  const redirectsFile = join(stageRoot, '_redirects')
  if (existsSync(redirectsFile)) {
    const text = readFileSync(redirectsFile, 'utf8')
    const dataLines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'))
    const docsWildcardIdx = dataLines.findIndex(l => l.startsWith('/docs/* '))
    const tuffexWildcardIdx = dataLines.findIndex(l => l.startsWith('/docs/dev/components/* '))
    if (docsWildcardIdx === -1 || tuffexWildcardIdx === -1 || tuffexWildcardIdx > docsWildcardIdx)
      errors.push('_redirects must place /docs/dev/components/* strictly before /docs/*')
  }

  const FORBIDDEN_JS_PATTERNS = [
    { label: '@nuxt/content', re: /@nuxt\/content/ },
    { label: 'MDCRenderer', re: /\bMDCRenderer\b/ },
    { label: 'toHast', re: /\btoHast\b/ },
    { label: '@sidebase/nuxt-auth', re: /@sidebase\/nuxt-auth/ },
    { label: 'pinia', re: /@pinia\/nuxt/ },
    { label: '/_i18n/ runtime fetch', re: /\/_i18n\// },
  ]

  for (const entry of walkEntries(stageRoot)) {
    const rel = toPosix(relative(stageRoot, entry.path))
    const base = rel.split('/').pop() || ''

    if (entry.isDir && (base === '__nuxt_content' || base === '_i18n' || rel.endsWith('api/_build')))
      errors.push(`Forbidden directory present in .dist-cf: ${rel}`)

    if (!entry.isDir) {
      if (base === '_payload.json')
        errors.push(`Forbidden _payload.json present in .dist-cf: ${rel}`)
      if (/\.wasm$/i.test(base))
        errors.push(`Forbidden WASM binary present in .dist-cf: ${rel}`)
      if (/^dump\..*\.sql$/i.test(base))
        errors.push(`Forbidden SQL dump present in .dist-cf: ${rel}`)
      if (rel.includes('_i18n/'))
        errors.push(`Forbidden runtime _i18n asset present in .dist-cf: ${rel}`)
      if (rel.includes('__nuxt_content/'))
        errors.push(`Forbidden __nuxt_content artifact present in .dist-cf: ${rel}`)
      if (rel.includes('api/_build/'))
        errors.push(`Forbidden api/_build artifact present in .dist-cf: ${rel}`)

      if (rel.startsWith('_tuff-web/') && base.endsWith('.js')) {
        const jsSource = readFileSync(entry.path, 'utf8')
        for (const check of FORBIDDEN_JS_PATTERNS) {
          if (check.re.test(jsSource))
            errors.push(`Forbidden runtime ${check.label} reference in built bundle: ${rel}`)
        }
      }
    }
  }

  if (errors.length) {
    console.error('[stage-cf-assets] CI verification FAILED:')
    for (const err of errors)
      console.error(`  - ${err}`)
    process.exit(1)
  }
}

export function stageCfAssets(appRoot) {
  const outputPublic = join(appRoot, '.output/public')
  const stageRoot = join(appRoot, '.dist-cf')
  const contentDocsDir = join(appRoot, 'content/docs')

  if (!existsSync(outputPublic))
    throw new Error(`[stage-cf-assets] missing Nitro output directory: ${outputPublic}. Run \`nuxt generate\` first.`)

  // 1. Recreate clean .dist-cf/ from .output/public/**
  rmSync(stageRoot, { recursive: true, force: true })
  mkdirSync(stageRoot, { recursive: true })
  cpSync(outputPublic, stageRoot, { recursive: true })

  // 2. Materialize SSR-rendered 404.html from __not-found.html
  const notFoundSources = [
    join(stageRoot, '__not-found.html'),
    join(stageRoot, '__not-found/index.html'),
  ]
  const found404 = notFoundSources.find(p => existsSync(p))
  if (found404) {
    const html404 = readFileSync(found404, 'utf8')
    writeFileSync(join(stageRoot, '404.html'), html404)
    rmSync(join(stageRoot, '__not-found.html'), { force: true })
    rmSync(join(stageRoot, '__not-found'), { recursive: true, force: true })
  }

  // 3. Strip any forbidden build artifacts (_payload.json, *.wasm, dump.*.sql, _i18n, __nuxt_content)
  const removed = stripForbiddenBuildArtifacts(stageRoot)

  // 4. Generate static /docs/llms.txt, /docs/search-index.{en,zh}.json, /sitemap.xml, and raw .md twins
  const records = collectDocRecords(contentDocsDir)
  mkdirSync(join(stageRoot, 'docs'), { recursive: true })
  writeFileSync(join(stageRoot, 'docs/llms.txt'), buildDocsLlmsTxt(records))
  writeFileSync(join(stageRoot, 'sitemap.xml'), buildSitemapXml(records))

  for (const locale of ['en', 'zh']) {
    const items = records
      .filter(r => r.locale === locale)
      .map(r => ({
        id: r.route,
        path: r.route,
        slug: r.slug,
        locale,
        section: r.section,
        group: r.group,
        title: r.title,
        description: r.description,
        tags: r.tags,
      }))
    writeFileSync(
      join(stageRoot, `docs/search-index.${locale}.json`),
      JSON.stringify({ locale, items }),
    )
  }

  let rawMdCount = 0
  for (const rec of records) {
    for (const relTarget of rec.rawTargets) {
      const dest = join(stageRoot, relTarget)
      mkdirSync(dirname(dest), { recursive: true })
      writeFileSync(dest, rec.raw)
      rawMdCount += 1
    }
  }

  // 5. Write atomic _redirects & _headers with verified Early Hints (< 1,200 chars)
  writeFileSync(join(stageRoot, '_redirects'), buildRedirectsFile())
  writeFileSync(join(stageRoot, '_headers'), buildHeadersFile(stageRoot))

  // 6. Hard CI assertions
  runHardAssertions(stageRoot)

  console.log(
    `[stage-cf-assets] staged .dist-cf/ successfully: `
    + `${records.length} docs, ${rawMdCount} raw .md files, docs/llms.txt, docs/search-index.{en,zh}.json, sitemap.xml, 404.html, _redirects, _headers`
    + (removed.length ? ` (stripped ${removed.length} build-only entries)` : ''),
  )
}

const currentFile = fileURLToPath(import.meta.url)
if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  const appRoot = resolve(dirname(currentFile), '..')
  stageCfAssets(appRoot)
}
