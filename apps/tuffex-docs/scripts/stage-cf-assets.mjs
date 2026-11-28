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
const BASE_PATH = '/tuffex'
const MAX_EARLY_HINTS_LINK_LENGTH = 1190 // Strictly < 1,200 chars including `Link: `

const ENTRY_SCRIPT_RE = /<script[^>]*\btype="module"[^>]*\bsrc="(\/tuffex\/_tuffex\/[^"]+\.js)"/
const STYLESHEET_TAG_RE = /<link\b[^>]*\brel=(['"])stylesheet\1[^>]*>/gi
const STYLESHEET_HREF_RE = /\bhref=(['"])(\/tuffex\/_tuffex\/[^"']+\.css)\1/i
const PRINT_MEDIA_RE = /\bmedia=(['"])print\1/i

const DOC_FILE_PATTERN = /\.(md|mdc)$/i
const LOCALE_SUFFIX_PATTERN = /\.(en|zh)$/i

const TEMPLATE_GROUPS = [
  { category: 'TemplateApp', heading: 'App shells' },
  { category: 'TemplateContent', heading: 'Content' },
  { category: 'TemplateAi', heading: 'AI apps' },
  { category: 'TemplateData', heading: 'Data & flow' },
]

const CATEGORY_SUITE_MAP = {
  Foundations: 'concepts',
  TemplateApp: 'templates',
  TemplateContent: 'templates',
  TemplateAi: 'templates',
  TemplateData: 'templates',
  BaseSuite: 'base',
  Basic: 'base',
  Form: 'base',
  Layout: 'base',
  Navigation: 'base',
  Data: 'base',
  Feedback: 'base',
  Status: 'base',
  ProSuite: 'pro',
  Advanced: 'pro',
  Effects: 'pro',
  Primitives: 'pro',
  Visualization: 'data',
  Charts: 'data',
  DataSuite: 'data',
  AiSuite: 'ai',
  AiChat: 'ai',
  AiAgent: 'ai',
  AiReasoning: 'ai',
  AiContext: 'ai',
  FlowSuite: 'flow',
  Flow: 'flow',
  MotionSuite: 'motion',
  MotionButtons: 'motion',
  MotionCards: 'motion',
  MotionCarousels: 'motion',
  MotionLoaders: 'motion',
  MotionCharts: 'motion',
  MotionText: 'motion',
  MotionPhysics: 'motion',
  MotionInteraction: 'motion',
  MotionToggles: 'motion',
  MotionTransitions: 'motion',
}

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

function parseFrontmatter(raw) {
  if (!raw.startsWith('---'))
    return {}
  const endIdx = raw.indexOf('\n---', 3)
  if (endIdx === -1)
    return {}

  const fm = {}
  const body = raw.slice(3, endIdx)
  let currentArrayKey = null

  for (const line of body.split(/\r?\n/)) {
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
  return fm
}

function mapContentFile(relativePath) {
  const posix = toPosix(relativePath).replace(/^\/+/, '')
  if (!DOC_FILE_PATTERN.test(posix))
    return null
  const withoutExt = posix.replace(DOC_FILE_PATTERN, '')
  const localeMatch = withoutExt.match(LOCALE_SUFFIX_PATTERN)
  if (!localeMatch)
    return null
  const locale = localeMatch[1].toLowerCase()
  const basePath = withoutExt.replace(LOCALE_SUFFIX_PATTERN, '')

  if (basePath === 'components/index') {
    return {
      locale,
      slug: '',
      route: `/${locale}`,
      rawTargets: [`${locale}/index.md`, `${locale}.md`],
      canonicalRawPath: `${BASE_PATH}/${locale}/index.md`,
    }
  }
  if (basePath.startsWith('components/')) {
    const slug = basePath.slice('components/'.length)
    return {
      locale,
      slug,
      route: `/${locale}/${slug}`,
      rawTargets: [`${locale}/${slug}.md`],
      canonicalRawPath: `${BASE_PATH}/${locale}/${slug}.md`,
    }
  }
  if (basePath === 'concepts/index') {
    return {
      locale,
      slug: 'concepts',
      route: `/${locale}/concepts`,
      rawTargets: [`${locale}/concepts/index.md`, `${locale}/concepts.md`],
      canonicalRawPath: `${BASE_PATH}/${locale}/concepts/index.md`,
    }
  }
  if (basePath.startsWith('concepts/')) {
    return {
      locale,
      slug: basePath,
      route: `/${locale}/${basePath}`,
      rawTargets: [`${locale}/${basePath}.md`],
      canonicalRawPath: `${BASE_PATH}/${locale}/${basePath}.md`,
    }
  }
  if (basePath === 'composition') {
    return {
      locale,
      slug: 'composition',
      route: `/${locale}/composition`,
      rawTargets: [`${locale}/composition.md`],
      canonicalRawPath: `${BASE_PATH}/${locale}/composition.md`,
    }
  }
  return {
    locale,
    slug: basePath,
    route: `/${locale}/${basePath}`,
    rawTargets: [`${locale}/${basePath}.md`],
    canonicalRawPath: `${BASE_PATH}/${locale}/${basePath}.md`,
  }
}

function resolveSuite(slug, category) {
  if (slug === '' || slug === 'composition' || slug === 'concepts' || slug.startsWith('concepts/'))
    return 'concepts'
  if (category && CATEGORY_SUITE_MAP[category])
    return CATEGORY_SUITE_MAP[category]
  if (slug.startsWith('template-'))
    return 'templates'
  if (slug.endsWith('-suite'))
    return slug.slice(0, -'-suite'.length)
  return 'base'
}

function collectContentRecords(contentDocsDir) {
  const records = []
  for (const file of walkFiles(contentDocsDir)) {
    const rel = relative(contentDocsDir, file)
    const mapped = mapContentFile(rel)
    if (!mapped)
      continue
    const raw = readFileSync(file, 'utf8')
    const fm = parseFrontmatter(raw)
    const category = typeof fm.category === 'string' && fm.category.trim() ? fm.category.trim() : null
    const title = typeof fm.title === 'string' && fm.title.trim()
      ? fm.title.trim()
      : (mapped.slug.split('/').pop() || 'TuffEx')
    const description = typeof fm.description === 'string' ? fm.description.trim() : ''
    const tags = Array.isArray(fm.tags) ? fm.tags.filter(t => typeof t === 'string' && t.trim()) : []
    records.push({
      ...mapped,
      sourceFile: file,
      raw,
      title,
      description,
      category,
      suite: resolveSuite(mapped.slug, category),
      tags,
    })
  }
  return records.sort((a, b) => a.route.localeCompare(b.route))
}

function buildLlmsTxt(records) {
  const enRecords = records.filter(r => r.locale === 'en')
  const line = (item) => {
    const url = `${CANONICAL_ORIGIN}${item.canonicalRawPath}`
    return item.description ? `- [${item.title}](${url}): ${item.description}` : `- [${item.title}](${url})`
  }

  const overviewSlugs = new Set(['', 'installation', 'foundations', 'composition'])
  const overview = enRecords.filter(r => overviewSlugs.has(r.slug))
  const suites = enRecords.filter(r => r.slug.endsWith('-suite'))
  const concepts = enRecords.filter(r => r.slug === 'concepts' || r.slug.startsWith('concepts/'))
  const templates = enRecords.filter(r => r.slug.startsWith('template-'))
  const components = enRecords.filter(r =>
    !overviewSlugs.has(r.slug)
    && !r.slug.endsWith('-suite')
    && !r.slug.startsWith('concepts')
    && !r.slug.startsWith('template-'),
  )

  const lines = [
    '# TuffEx Component Documentation',
    '',
    `> TuffEx (\`@talex-touch/tuffex\`) is the Vue 3, React, and Web Components UI library behind Tuff. Each link points to the canonical raw Markdown source under \`${CANONICAL_ORIGIN}${BASE_PATH}/\`.`,
    '',
    '## Overview',
    ...overview.map(line),
    '',
    '## Suites',
    ...suites.map(line),
    '',
    '## Design Concepts',
    ...concepts.map(line),
    '',
    '## Components',
    ...components.map(line),
    '',
    '## Templates',
    '',
    'Full-page compositions of existing components. They exist only in the docs and are not importable components.',
  ]

  for (const group of TEMPLATE_GROUPS) {
    const items = templates.filter(r => r.category === group.category)
    if (items.length)
      lines.push('', `### ${group.heading}`, ...items.map(line))
  }
  const otherTemplates = templates.filter(r => !TEMPLATE_GROUPS.some(g => g.category === r.category))
  if (otherTemplates.length)
    lines.push('', '### Other', ...otherTemplates.map(line))

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

function buildSitemapXml(records) {
  const bySlug = new Map()
  for (const rec of records) {
    const group = bySlug.get(rec.slug) || {}
    group[rec.locale] = rec.route
    bySlug.set(rec.slug, group)
  }

  const urls = []
  for (const rec of records) {
    const loc = `${CANONICAL_ORIGIN}${BASE_PATH}${rec.route}`
    const pair = bySlug.get(rec.slug) || {}
    const alternates = []
    if (pair.en)
      alternates.push(`    <xhtml:link rel="alternate" hreflang="en" href="${escapeXml(`${CANONICAL_ORIGIN}${BASE_PATH}${pair.en}`)}" />`)
    if (pair.zh)
      alternates.push(`    <xhtml:link rel="alternate" hreflang="zh" href="${escapeXml(`${CANONICAL_ORIGIN}${BASE_PATH}${pair.zh}`)}" />`)
    if (pair.en)
      alternates.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(`${CANONICAL_ORIGIN}${BASE_PATH}${pair.en}`)}" />`)
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

function buildRootLocaleRedirectHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>TuffEx Documentation</title>
  <meta name="robots" content="noindex">
  <link rel="canonical" href="${CANONICAL_ORIGIN}${BASE_PATH}/en">
  <script>
    (function () {
      var target = 'en';
      try {
        var match = document.cookie.match(/(?:^|;\\s*)tuff_locale=(zh|en)(?:;|$)/i);
        if (match) {
          target = match[1].toLowerCase();
        } else {
          var stored = localStorage.getItem('tuff_locale_preference');
          if (stored === 'zh' || stored === 'en') {
            target = stored;
          } else if (navigator.language && /^zh/i.test(navigator.language)) {
            target = 'zh';
          }
        }
      } catch (_) {}
      window.location.replace('${BASE_PATH}/' + target + window.location.search + window.location.hash);
    })();
  </script>
  <noscript>
    <meta http-equiv="refresh" content="0;url=${BASE_PATH}/en">
  </noscript>
</head>
<body>
  <p>Redirecting to <a href="${BASE_PATH}/en">TuffEx Documentation</a>…</p>
</body>
</html>
`
}

function buildHeadersFile(tuffexStageDir) {
  const sampleCandidates = [
    join(tuffexStageDir, 'en.html'),
    join(tuffexStageDir, 'en/button.html'),
    join(tuffexStageDir, 'zh/button.html'),
    join(tuffexStageDir, 'zh/base-suite.html'),
    join(tuffexStageDir, 'en/installation.html'),
  ]
  const samples = sampleCandidates
    .filter(file => existsSync(file))
    .map(file => extractEarlyHintTargets(readFileSync(file, 'utf8')))

  const linkValue = formatEarlyHintsLinkHeader(intersectEarlyHintTargets(samples))
  const linkLine = linkValue ? `\n  Link: ${linkValue}` : ''

  return `# Cloudflare Workers Static Assets headers for tuff-tuffex-docs (assets.directory = ".dist-cf")
# Generated by scripts/stage-cf-assets.mjs

/tuffex/_tuffex/*
  Cache-Control: public, max-age=31536000, immutable

/tuffex/_i18n/*
  Cache-Control: public, max-age=31536000, immutable

/tuffex
  Cache-Control: public, max-age=60, s-maxage=3600, stale-while-revalidate=86400${linkLine}

/tuffex/en
  Cache-Control: public, max-age=60, s-maxage=3600, stale-while-revalidate=86400${linkLine}

/tuffex/en/*
  Cache-Control: public, max-age=60, s-maxage=3600, stale-while-revalidate=86400${linkLine}

/tuffex/zh
  Cache-Control: public, max-age=60, s-maxage=3600, stale-while-revalidate=86400${linkLine}

/tuffex/zh/*
  Cache-Control: public, max-age=60, s-maxage=3600, stale-while-revalidate=86400${linkLine}

/tuffex/search-index.*.json
  Content-Type: application/json; charset=utf-8
  Cache-Control: public, max-age=300, s-maxage=3600, stale-while-revalidate=86400

/tuffex/llms.txt
  Content-Type: text/plain; charset=utf-8
  Cache-Control: public, max-age=300, s-maxage=3600, stale-while-revalidate=86400

/tuffex/sitemap.xml
  Content-Type: application/xml; charset=utf-8
  Cache-Control: public, max-age=300, s-maxage=3600, stale-while-revalidate=86400
`
}

function stripForbiddenBuildArtifacts(stageRoot) {
  const removed = []

  // Remove known build-only directories anywhere in .dist-cf
  for (const target of [
    join(stageRoot, '__nuxt_content'),
    join(stageRoot, 'tuffex/__nuxt_content'),
    join(stageRoot, 'api/_build'),
    join(stageRoot, 'tuffex/api/_build'),
  ]) {
    if (existsSync(target)) {
      rmSync(target, { recursive: true, force: true })
      removed.push(relative(stageRoot, target))
    }
  }

  // Clean empty `api` directory if `_build` was its only child
  for (const apiDir of [join(stageRoot, 'api'), join(stageRoot, 'tuffex/api')]) {
    if (existsSync(apiDir) && readdirSync(apiDir).length === 0) {
      rmSync(apiDir, { recursive: true, force: true })
      removed.push(relative(stageRoot, apiDir))
    }
  }

  // Remove any dump.*.sql files
  for (const file of walkFiles(stageRoot)) {
    const base = file.split('/').pop() || ''
    if (/^dump\..*\.sql$/i.test(base)) {
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
    'tuffex/index.html',
    'tuffex/en.html',
    'tuffex/zh.html',
    'tuffex/en/button.html',
    'tuffex/zh/button.html',
    'tuffex/404.html',
    'tuffex/llms.txt',
    'tuffex/search-index.en.json',
    'tuffex/search-index.zh.json',
    'tuffex/sitemap.xml',
    'tuffex/en/button.md',
    'tuffex/zh/button.md',
  ]

  for (const rel of requiredFiles) {
    const full = join(stageRoot, rel)
    if (!existsSync(full) || statSync(full).size === 0)
      errors.push(`Missing or empty required artifact: .dist-cf/${rel}`)
  }

  // Check SSR 404 is not an empty CSR shell
  const notFoundFile = join(stageRoot, 'tuffex/404.html')
  if (existsSync(notFoundFile)) {
    const html404 = readFileSync(notFoundFile, 'utf8')
    if (/<div id="__nuxt"><\/div>/.test(html404))
      errors.push('tuffex/404.html is an empty CSR shell (<div id="__nuxt"></div>); must be SSR-rendered from /__not-found')
  }

  // Check llms.txt never leaks localhost
  const llmsFile = join(stageRoot, 'tuffex/llms.txt')
  if (existsSync(llmsFile)) {
    const llms = readFileSync(llmsFile, 'utf8')
    if (/https?:\/\/localhost\b/i.test(llms))
      errors.push('tuffex/llms.txt contains localhost URLs; must use canonical production origin')
    if (!llms.includes(`${CANONICAL_ORIGIN}${BASE_PATH}/`))
      errors.push(`tuffex/llms.txt does not contain canonical ${CANONICAL_ORIGIN}${BASE_PATH}/ URLs`)
  }

  // Check _headers Link lines strictly < 1,200 chars
  const headersFile = join(stageRoot, '_headers')
  if (existsSync(headersFile)) {
    const headersText = readFileSync(headersFile, 'utf8')
    for (const rawLine of headersText.split(/\r?\n/)) {
      const trimmed = rawLine.trim()
      if (/^Link:/i.test(trimmed) && trimmed.length >= 1200)
        errors.push(`_headers Link line length ${trimmed.length} >= 1200 chars`)
    }
  }

  // Scan ALL entries for forbidden SQLite/WASM/dump/content/build-API/_payload.json/runtime-MDC files
  const FORBIDDEN_JS_PATTERNS = [
    { label: '@nuxt/content', re: /@nuxt\/content/ },
    { label: 'MDCRenderer', re: /\bMDCRenderer\b/ },
    { label: 'toHast', re: /\btoHast\b/ },
  ]

  for (const entry of walkEntries(stageRoot)) {
    const rel = toPosix(relative(stageRoot, entry.path))
    const base = rel.split('/').pop() || ''

    if (entry.isDir && (base === '__nuxt_content' || rel.endsWith('api/_build')))
      errors.push(`Forbidden directory present in .dist-cf: ${rel}`)

    if (!entry.isDir) {
      if (base === '_payload.json')
        errors.push(`Forbidden _payload.json present in .dist-cf (docs compile to ES modules): ${rel}`)
      if (/sqlite3.*\.wasm$/i.test(base))
        errors.push(`Forbidden SQLite WASM binary present in .dist-cf: ${rel}`)
      if (/sqlite3-worker1-.*\.js$/i.test(base))
        errors.push(`Forbidden SQLite worker JS present in .dist-cf: ${rel}`)
      if (/\.wasm$/i.test(base))
        errors.push(`Unexpected WASM binary present in .dist-cf: ${rel}`)
      if (/^dump\..*\.sql$/i.test(base))
        errors.push(`Forbidden SQL dump present in .dist-cf: ${rel}`)
      if (rel.includes('__nuxt_content/'))
        errors.push(`Forbidden __nuxt_content artifact present in .dist-cf: ${rel}`)
      if (rel.includes('api/_build/'))
        errors.push(`Forbidden api/_build artifact present in .dist-cf: ${rel}`)

      if (rel.startsWith('tuffex/_tuffex/') && base.endsWith('.js')) {
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
  const tuffexStageDir = join(stageRoot, 'tuffex')
  const contentDocsDir = join(appRoot, 'content/docs')

  if (!existsSync(outputPublic))
    throw new Error(`[stage-cf-assets] missing Nitro output directory: ${outputPublic}. Run \`nuxt generate\` first.`)

  // 1. Recreate clean .dist-cf/tuffex/ from .output/public/** (Fix C1: Nitro strips baseURL on disk)
  rmSync(stageRoot, { recursive: true, force: true })
  mkdirSync(tuffexStageDir, { recursive: true })

  const nestedBaseDir = join(outputPublic, 'tuffex')
  const sourceDir = existsSync(join(nestedBaseDir, 'en.html')) || existsSync(join(nestedBaseDir, 'en/button.html'))
    ? nestedBaseDir
    : outputPublic

  cpSync(sourceDir, tuffexStageDir, { recursive: true })

  // 2. Materialize SSR-rendered 404.html from __not-found.html
  const notFoundSources = [
    join(tuffexStageDir, '__not-found.html'),
    join(tuffexStageDir, '__not-found/index.html'),
  ]
  const found404 = notFoundSources.find(p => existsSync(p))
  if (found404) {
    const html404 = readFileSync(found404, 'utf8')
    writeFileSync(join(tuffexStageDir, '404.html'), html404)
    rmSync(join(tuffexStageDir, '__not-found.html'), { force: true })
    rmSync(join(tuffexStageDir, '__not-found'), { recursive: true, force: true })
  }

  // 3. Ensure /tuffex/index.html exists (locale redirect entry if @nuxtjs/i18n ignored `/`)
  const rootIndexHtml = join(tuffexStageDir, 'index.html')
  if (!existsSync(rootIndexHtml))
    writeFileSync(rootIndexHtml, buildRootLocaleRedirectHtml())

  // 4. Strip any dump.*.sql, __nuxt_content/**, api/_build/**
  const removed = stripForbiddenBuildArtifacts(stageRoot)

  // 5. Generate static llms.txt, search-index.{en,zh}.json, sitemap.xml, and raw .md twins
  const records = collectContentRecords(contentDocsDir)
  writeFileSync(join(tuffexStageDir, 'llms.txt'), buildLlmsTxt(records))
  writeFileSync(join(tuffexStageDir, 'sitemap.xml'), buildSitemapXml(records))

  for (const locale of ['en', 'zh']) {
    const items = records
      .filter(r => r.locale === locale)
      .map(r => ({
        id: r.route,
        path: r.route,
        slug: r.slug,
        locale,
        title: r.title,
        description: r.description,
        suite: r.suite,
        category: r.category,
        tags: r.tags,
      }))
    writeFileSync(
      join(tuffexStageDir, `search-index.${locale}.json`),
      JSON.stringify({ locale, items }),
    )
  }

  let rawMdCount = 0
  for (const rec of records) {
    for (const relTarget of rec.rawTargets) {
      const dest = join(tuffexStageDir, relTarget)
      mkdirSync(dirname(dest), { recursive: true })
      writeFileSync(dest, rec.raw)
      rawMdCount += 1
    }
  }

  // 6. Write .dist-cf/_headers at root of assets.directory with Early Hints (< 1,200 chars)
  const headersContent = buildHeadersFile(tuffexStageDir)
  writeFileSync(join(stageRoot, '_headers'), headersContent)

  // 7. Hard CI assertions
  runHardAssertions(stageRoot)

  console.log(
    `[stage-cf-assets] staged .dist-cf/tuffex/ successfully: `
    + `${records.length} docs, ${rawMdCount} raw .md files, llms.txt, search-index.{en,zh}.json, sitemap.xml, 404.html, _headers`
    + (removed.length ? ` (stripped ${removed.length} build-only entries)` : ''),
  )
}

const currentFile = fileURLToPath(import.meta.url)
if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  const appRoot = resolve(dirname(currentFile), '..')
  stageCfAssets(appRoot)
}
