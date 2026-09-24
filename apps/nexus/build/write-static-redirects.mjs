import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { docsStaticRedirects, PAGES_REDIRECT_STATUSES } from './nexus-static-routes.mjs'

/**
 * Writes the docs entry redirects into `dist/_redirects` so Cloudflare Pages answers `/docs`
 * and `/docs/**` itself, before any static-file lookup and without waking the Worker.
 *
 * Nitro already writes this file from `routeRules` redirects. It cannot write a splat rule,
 * because it copies the `to` of a route rule verbatim and `/en/docs/**` is not
 * `/en/docs/:splat`. So this step runs after Nitro and merges rather than replaces.
 *
 * Three facts about the file format decide the shape of the output:
 * - Pages evaluates rules in order and documents that static rules should come before dynamic
 *   ones (a rule whose source has a `*` or a `:placeholder`). The docs rules go first in their
 *   class, and the existing dynamic rules stay last.
 * - A line names one rule and the docs rules own their sources: any earlier line for the same
 *   source is dropped and rewritten, so running the step twice yields the same file.
 * - Pages accepts only `PAGES_REDIRECT_STATUSES`; a line with any other status (Nitro's
 *   `/* /404.html 404` when it sees a `404.html`) is dropped by Pages with a warning in the
 *   deploy log. Such lines are removed here so the file only carries rules that run; the
 *   not-found answer is Pages' native `404.html` handling, not a redirect.
 */
export function parseRedirectsFile(source) {
  const rules = []
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#'))
      continue
    const [from, to, status, ...rest] = line.split(/\s+/)
    if (!from || !to)
      continue
    rules.push({
      from,
      to,
      status: status ? Number(status) : 302,
      conditions: rest,
      raw: line,
    })
  }
  return rules
}

export function isDynamicRedirect(rule) {
  return rule.from.includes('*') || rule.from.includes(':')
}

export function isValidRedirectStatus(rule) {
  return PAGES_REDIRECT_STATUSES.has(rule.status)
}

export function formatRedirectRule(rule) {
  return `${rule.from} ${rule.to} ${rule.status}`
}

export function mergeStaticRedirects(source, rules = docsStaticRedirects) {
  const owned = new Set(rules.map(rule => rule.from))
  const existing = parseRedirectsFile(source)
    .filter(rule => !owned.has(rule.from))
    .filter(isValidRedirectStatus)
  const ordered = [
    ...rules.filter(rule => !isDynamicRedirect(rule)),
    ...existing.filter(rule => !isDynamicRedirect(rule)),
    ...rules.filter(rule => isDynamicRedirect(rule)),
    ...existing.filter(rule => isDynamicRedirect(rule)),
  ]
  return `${ordered.map(rule => rule.raw ?? formatRedirectRule(rule)).join('\n')}\n`
}

export function writeStaticRedirects(distRoot, rules = docsStaticRedirects) {
  const redirectsPath = join(distRoot, '_redirects')
  const existing = existsSync(redirectsPath) ? readFileSync(redirectsPath, 'utf8') : ''
  writeFileSync(redirectsPath, mergeStaticRedirects(existing, rules))
  return rules
}

const currentFile = fileURLToPath(import.meta.url)
if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  const distRoot = resolve(dirname(currentFile), '..', 'dist')
  const rules = writeStaticRedirects(distRoot)
  console.log(`[nexus-static-redirects] wrote ${rules.length} docs redirect rules into _redirects`)
}
