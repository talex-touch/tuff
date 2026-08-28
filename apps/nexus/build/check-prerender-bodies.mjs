// Asserts that prerendered docs pages actually contain their body, not just that they exist.
//
// The build prerenders docs routes and `docs-prerender-routes.test.ts` checks the route *list* is
// complete. Nothing checked the resulting HTML. That gap is not theoretical: this site has already
// shipped docs pages that prerendered to an empty shell site-wide, because the body mode was baked
// into the payload key and the server render and hydration disagreed. That failure produces a green
// build, a green `check:mdc-fences`, a green route-list test, and a site with no prose on it.
//
// So this reads the emitted HTML for the five routes `docsPrerenderEvidenceRoutes` already curates
// -- a list that existed for this purpose and had no consumer -- and fails when a page's rendered
// text falls below a floor.
//
// Why a text floor rather than a selector: the shell renders regardless, so "an <article> exists"
// is exactly the assertion the empty-shell bug satisfied. Stripping tags and counting visible
// characters is the property that actually distinguishes a rendered page from a skeleton.
//
// Run `--self-test` to verify the judging without a build; it is wired into CI alongside the check
// itself, because a gate whose logic is never exercised is the thing this file exists to prevent.

import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const nexusRoot = dirname(dirname(fileURLToPath(import.meta.url)))

/**
 * Minimum visible characters for a prerendered docs page.
 *
 * Measured against a real build rather than picked. The five evidence routes render, per locale:
 *
 *   /zh/docs                                    423   <- the shortest, a landing page
 *   /en/docs                                   1002
 *   /zh/docs/guide/start                       1250
 *   /zh/docs/dev                               1398
 *   /en/docs/guide/start                       2097
 *   /zh/docs/dev/getting-started/quickstart    2657
 *   /en/docs/dev                               2794
 *   /en/docs/dev/getting-started/quickstart    3088
 *   /zh/docs/dev/components                    7960
 *   /en/docs/dev/components                   10090
 *
 * 250 sits below the 423 floor with room for a landing page to lose a paragraph, and far above a
 * chrome-only render, which carries nav labels and a footer and no prose at all. The number is not
 * load-bearing -- it only has to sit inside a gap this wide -- but it should be re-measured if the
 * docs landing pages are ever shortened.
 */
export const MIN_BODY_CHARS = 250

/** Strips markup and script/style content, leaving what a reader would actually see. */
export function visibleText(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Where a prerendered route lands on disk under the cloudflare-pages preset. */
export function routeToHtmlPath(outputDir, route) {
  const trimmed = route.replace(/^\/+|\/+$/g, '')
  return trimmed ? join(outputDir, trimmed, 'index.html') : join(outputDir, 'index.html')
}

export function judgePrerenderedRoute(route, html) {
  if (html === null) {
    return { route, ok: false, chars: 0, detail: 'no HTML emitted for this route' }
  }
  const chars = visibleText(html).length
  return {
    route,
    ok: chars >= MIN_BODY_CHARS,
    chars,
    detail:
      chars >= MIN_BODY_CHARS
        ? `${chars} visible chars`
        : `${chars} visible chars, below the ${MIN_BODY_CHARS} floor -- the page rendered its shell without its body`,
  }
}

export function judgePrerenderedRoutes(routes, readHtml) {
  return routes.map(route => judgePrerenderedRoute(route, readHtml(route)))
}

function selfTest() {
  const body = `<html><body><nav>Docs Guide API</nav><article>${'word '.repeat(200)}</article></body></html>`
  const shell = '<html><body><nav>Docs Guide API</nav><article></article><footer>MIT</footer></body></html>'
  const scriptOnly = `<html><body><nav>Docs</nav><script>${'x'.repeat(5000)}</script></body></html>`

  const cases = [
    {
      name: 'a rendered page passes',
      actual: judgePrerenderedRoute('/en/docs', body).ok,
      expected: true,
    },
    // The failure this file exists for. The shell renders, the article element is present, and the
    // page is empty -- so an element-presence check would pass here and this must not.
    {
      name: 'an empty shell fails even though its article element exists',
      actual: judgePrerenderedRoute('/en/docs', shell).ok,
      expected: false,
    },
    {
      name: 'the empty-shell failure says the body is missing, not merely that it is short',
      actual: judgePrerenderedRoute('/en/docs', shell).detail.includes('without its body'),
      expected: true,
    },
    // Payload scripts are large. Counting raw bytes would let a body-less page pass on script
    // weight alone, which is the same false green in a different costume.
    {
      name: 'script content does not count toward the floor',
      actual: judgePrerenderedRoute('/en/docs', scriptOnly).ok,
      expected: false,
    },
    {
      name: 'a route that emitted no file fails rather than being skipped',
      actual: judgePrerenderedRoute('/en/docs', null).ok,
      expected: false,
    },
    {
      name: 'a missing file is reported as missing, not as a short body',
      actual: judgePrerenderedRoute('/en/docs', null).detail.includes('no HTML emitted'),
      expected: true,
    },
    {
      name: 'comments are stripped rather than counted',
      actual: judgePrerenderedRoute('/en/docs', `<html><body><!--${'c'.repeat(5000)}--></body></html>`).ok,
      expected: false,
    },
    { name: 'nested routes map to <route>/index.html', actual: routeToHtmlPath('/o', '/en/docs/dev'), expected: '/o/en/docs/dev/index.html' },
    { name: 'the root route maps to index.html', actual: routeToHtmlPath('/o', '/'), expected: '/o/index.html' },
    { name: 'every route is judged, not just the failing ones', actual: judgePrerenderedRoutes(['/a', '/b'], () => shell).length, expected: 2 },
  ]

  // An end-to-end pass over real files, so the reader is exercised and not only the judging.
  const dir = mkdtempSync(join(tmpdir(), 'prerender-selftest-'))
  try {
    const full = routeToHtmlPath(dir, '/en/docs')
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, body)
    const read = route => (existsSync(routeToHtmlPath(dir, route)) ? readFileSync(routeToHtmlPath(dir, route), 'utf8') : null)
    const results = judgePrerenderedRoutes(['/en/docs', '/zh/docs'], read)
    cases.push(
      { name: 'reads a written page from disk and passes it', actual: results[0].ok, expected: true },
      { name: 'reports an absent sibling rather than assuming it', actual: results[1].ok, expected: false },
    )
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }

  let failed = 0
  for (const testCase of cases) {
    const pass = testCase.actual === testCase.expected
    if (!pass) {
      failed += 1
      console.error(`  x ${testCase.name}: expected ${testCase.expected}, got ${testCase.actual}`)
    }
  }
  console.log(
    failed === 0
      ? `check-prerender-bodies --self-test: ${cases.length} cases passed`
      : `check-prerender-bodies --self-test: ${failed} of ${cases.length} cases failed`,
  )
  return failed === 0 ? 0 : 1
}

async function main() {
  if (process.argv.includes('--self-test')) {
    process.exit(selfTest())
  }

  // `dist` is authoritative: wrangler.toml sets `pages_build_output_dir = "apps/nexus/dist"`.
  // `.output/public` is probed as a fallback so a preset change does not silently skip the gate.
  const dirArgIndex = process.argv.indexOf('--output')
  const candidates = dirArgIndex >= 0
    ? [process.argv[dirArgIndex + 1]]
    : ['dist', '.output/public']
  const outputDir = candidates.map(dir => resolve(nexusRoot, dir)).find(dir => existsSync(dir))

  if (!outputDir) {
    // Refuse rather than pass. "No build output" and "every page is fine" must not look the same,
    // which is the whole failure mode this check was written against.
    console.error(
      `[nexus-prerender-bodies] no build output found. Looked in: ${candidates.join(', ')}. `
      + 'Run `pnpm -C apps/nexus build` first, or pass --output <dir>.',
    )
    process.exit(2)
  }

  // Read from the .mjs module rather than nexus-prerender-routes.ts: that file's TS siblings use
  // extensionless imports, which plain node cannot resolve. Running this for real is what surfaced
  // that -- the self-test never touches this path.
  const { docsPrerenderEvidenceRoutes, docsPrerenderLocales } = await import('./nexus-static-routes.mjs')
  const routes = docsPrerenderEvidenceRoutes.flatMap(route =>
    docsPrerenderLocales.map(locale => `/${locale}${route}`),
  )

  const results = judgePrerenderedRoutes(routes, (route) => {
    const file = routeToHtmlPath(outputDir, route)
    return existsSync(file) ? readFileSync(file, 'utf8') : null
  })

  for (const result of results)
    console.log(`  ${result.ok ? '[32m✓[0m' : '[31m✗[0m'} ${result.route}: ${result.detail}`)

  const failures = results.filter(result => !result.ok)
  if (failures.length) {
    console.error(
      `\n[nexus-prerender-bodies] ${failures.length} of ${results.length} prerendered pages have no body.`,
    )
    process.exit(1)
  }
  console.log(`\n[nexus-prerender-bodies] ${results.length} prerendered pages carry their content.`)
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
