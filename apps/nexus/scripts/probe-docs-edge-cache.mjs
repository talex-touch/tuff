#!/usr/bin/env node
/**
 * Probes how the Cloudflare edge answers the static docs delivery of a deployed Nexus: HTML,
 * the JSON twins, the raw-Markdown twins, and a hashed `/_nuxt/` asset as the positive control
 * for the cache pipeline. Each URL is requested twice; the second answer's `cf-cache-status`
 * says whether a zone Cache Rule is caching it (HIT / STALE / REVALIDATED) or whether every
 * reader still pays the origin round trip (DYNAMIC — the state measured on 2026-09-23, when
 * `_headers` carried `s-maxage` but Cloudflare's extension-only default never cached HTML or
 * JSON).
 *
 *   pnpm -C apps/nexus probe:docs-edge-cache -- --label before
 *   pnpm -C apps/nexus probe:docs-edge-cache -- --base-url https://tuff.tagzxia.com --label after
 *
 * Writes `output/evidence/docs-edge-cache-<date>[-<label>].json` at the workspace root and
 * prints a Markdown table. Run once before the rule exists and once after; the spec's
 * "Edge cache" section says what the second run must show for the rule to stay.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { docsPrerenderEvidenceRoutes } from '../build/nexus-static-routes.mjs'

const currentDir = dirname(fileURLToPath(import.meta.url))
const workspaceRoot = resolve(currentDir, '..', '..', '..')
const outputRoot = join(workspaceRoot, 'output/evidence')
const args = parseArgs(process.argv.slice(2))
const baseUrl = trimTrailingSlash(args['base-url'] ?? process.env.NEXUS_PROBE_BASE_URL ?? 'https://tuff.tagzxia.com')
const label = typeof args.label === 'string' ? args.label.replace(/[^a-z0-9-]/gi, '') : ''
const dateStamp = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())
const cachedStatuses = new Set(['HIT', 'STALE', 'REVALIDATED', 'UPDATING'])

if (!/^https:\/\//.test(baseUrl)) {
  console.error(`[docs-edge-cache] refusing non-HTTPS base URL: ${baseUrl}`)
  process.exit(64)
}

const targets = buildTargets()
const entryAsset = await discoverEntryAsset()
if (entryAsset)
  targets.push({ group: 'control', path: entryAsset })

const rows = []
for (const target of targets) {
  const first = await probe(target.path)
  await sleep(300)
  const second = await probe(target.path)
  rows.push({ ...target, first, second })
}

const summary = summarize(rows)
const fileName = `docs-edge-cache-${dateStamp}${label ? `-${label}` : ''}.json`
await mkdir(outputRoot, { recursive: true })
await writeFile(join(outputRoot, fileName), `${JSON.stringify({ baseUrl, measuredAt: new Date().toISOString(), label: label || null, summary, rows }, null, 2)}\n`)

console.log(`\n| group | path | 1st | 2nd | colo | ttfb 1st | ttfb 2nd | cache-control |`)
console.log('|---|---|---|---|---|---|---|---|')
for (const row of rows)
  console.log(`| ${row.group} | ${row.path} | ${row.first.cacheStatus} | ${row.second.cacheStatus} | ${row.second.colo} | ${row.first.ttfbMs} ms | ${row.second.ttfbMs} ms | ${row.second.cacheControl} |`)
console.log(`\n[docs-edge-cache] ${summary.cachedOnSecond}/${summary.probed} second requests served from the edge cache (control: ${summary.controlCachedOnSecond ? 'HIT' : 'not cached'}); static HTML ttfb p50 ${summary.staticHtmlTtfbP50Ms} ms`)
console.log(`[docs-edge-cache] wrote output/evidence/${fileName}`)

function buildTargets() {
  const list = []
  for (const route of docsPrerenderEvidenceRoutes) {
    for (const locale of ['en', 'zh']) {
      list.push({ group: 'html', path: `/${locale}${route}` })
      list.push({ group: 'markdown', path: `/${locale}${route}.md` })
    }
  }
  list.push({ group: 'html', path: '/en/docs/dev/components/button' })
  list.push({ group: 'json', path: '/api/docs/page/en/body/dev/components/button.json' })
  list.push({ group: 'json', path: '/api/docs/page/en/meta/dev/components/button.json' })
  list.push({ group: 'json', path: '/api/docs/navigation/en/all' })
  list.push({ group: 'json', path: '/api/docs/navigation/en/components' })
  list.push({ group: 'json', path: '/api/docs/search/en' })
  list.push({ group: 'json', path: '/api/docs/sidebar-components/en' })
  list.push({ group: 'json', path: '/api/docs/component-sync' })
  return list
}

async function discoverEntryAsset() {
  try {
    const response = await fetch(`${baseUrl}/en/docs`, { redirect: 'manual' })
    const html = await response.text()
    return html.match(/href="(\/_nuxt\/[^"]+\.js)"/)?.[1] ?? null
  }
  catch {
    return null
  }
}

async function probe(path) {
  const started = performance.now()
  try {
    const response = await fetch(`${baseUrl}${path}`, { redirect: 'manual', headers: { 'accept': 'text/html,application/json;q=0.9,*/*;q=0.8', 'user-agent': 'nexus-docs-edge-cache-probe' } })
    const ttfbMs = Math.round(performance.now() - started)
    // Drain so the connection is reusable; the body is not part of the evidence.
    await response.arrayBuffer()
    return {
      status: response.status,
      cacheStatus: response.headers.get('cf-cache-status') ?? '-',
      cacheControl: response.headers.get('cache-control') ?? '-',
      age: response.headers.get('age'),
      colo: response.headers.get('cf-ray')?.split('-')[1] ?? '-',
      ttfbMs,
    }
  }
  catch (error) {
    return { status: 0, cacheStatus: 'ERROR', cacheControl: '-', age: null, colo: '-', ttfbMs: Math.round(performance.now() - started), error: error instanceof Error ? error.message : String(error) }
  }
}

function summarize(list) {
  const measured = list.filter(row => row.group !== 'control')
  const cachedOnSecond = measured.filter(row => cachedStatuses.has(row.second.cacheStatus)).length
  const control = list.find(row => row.group === 'control')
  const htmlTtfbs = measured.filter(row => row.group === 'html' && row.second.status === 200).map(row => row.second.ttfbMs).sort((a, b) => a - b)
  return {
    probed: measured.length,
    cachedOnSecond,
    dynamicOnSecond: measured.filter(row => row.second.cacheStatus === 'DYNAMIC').length,
    errors: measured.filter(row => row.second.status === 0 || row.first.status === 0).length,
    controlCachedOnSecond: control ? cachedStatuses.has(control.second.cacheStatus) : null,
    staticHtmlTtfbP50Ms: htmlTtfbs.length ? htmlTtfbs[Math.floor(htmlTtfbs.length / 2)] : null,
  }
}

function parseArgs(argv) {
  const parsed = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--'))
      continue
    const [key, inlineValue] = token.slice(2).split('=', 2)
    if (inlineValue !== undefined) {
      parsed[key] = inlineValue
      continue
    }
    const next = argv[index + 1]
    if (next && !next.startsWith('--')) {
      parsed[key] = next
      index += 1
      continue
    }
    parsed[key] = true
  }
  return parsed
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '')
}

function sleep(ms) {
  return new Promise(resolvePromise => setTimeout(resolvePromise, ms))
}
