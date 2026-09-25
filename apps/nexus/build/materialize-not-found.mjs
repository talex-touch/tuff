import { Buffer } from 'node:buffer'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NOT_FOUND_PRERENDER_ROUTE } from './nexus-static-routes.mjs'

/**
 * Turns the prerendered not-found page into the `404.html` Cloudflare Pages serves for every
 * path no file matches.
 *
 * The page is prerendered under `NOT_FOUND_PRERENDER_ROUTE` rather than as `/404.html` because
 * Nuxt renders `/404.html` itself as a no-SSR shell (an empty `#__nuxt`, meant for single-page
 * deployments), and a blank page until hydration is not a not-found page. Copying a normally
 * rendered route keeps the hero, the title and the `noindex` robots meta in the file crawlers
 * and readers get. The source file is removed so the private route does not become a 200 page
 * of its own; a second run after that finds `404.html` already in place and verifies it instead
 * of failing, so the post-build chain can be re-run on an existing `dist`.
 */
export const NOT_FOUND_MARKER = 'aria-label="404"'

export function notFoundSourcePath(distRoot) {
  return join(distRoot, `${NOT_FOUND_PRERENDER_ROUTE.replace(/^\//, '')}.html`)
}

export function assertRenderedNotFoundPage(html) {
  if (/<div id="__nuxt"><\/div>/.test(html))
    throw new Error('[nexus-not-found] the prerendered not-found page is an empty shell; its route must not be one Nuxt renders without SSR')
  if (!html.includes(NOT_FOUND_MARKER))
    throw new Error(`[nexus-not-found] the prerendered not-found page does not contain ${NOT_FOUND_MARKER}`)
}

export function materializeNotFoundPage(distRoot) {
  const source = notFoundSourcePath(distRoot)
  const target = join(distRoot, '404.html')

  if (!existsSync(source)) {
    if (!existsSync(target))
      throw new Error(`[nexus-not-found] ${source} is missing; is ${NOT_FOUND_PRERENDER_ROUTE} still in the prerender list?`)
    const html = readFileSync(target, 'utf8')
    assertRenderedNotFoundPage(html)
    return { bytes: Buffer.byteLength(html), reused: true }
  }

  const html = readFileSync(source, 'utf8')
  assertRenderedNotFoundPage(html)
  writeFileSync(target, html)
  unlinkSync(source)
  return { bytes: Buffer.byteLength(html), reused: false }
}

const currentFile = fileURLToPath(import.meta.url)
if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  const distRoot = resolve(dirname(currentFile), '..', 'dist')
  const { bytes, reused } = materializeNotFoundPage(distRoot)
  console.log(`[nexus-not-found] ${reused ? 'verified existing' : 'wrote'} 404.html from ${NOT_FOUND_PRERENDER_ROUTE} (${bytes} bytes)`)
}
