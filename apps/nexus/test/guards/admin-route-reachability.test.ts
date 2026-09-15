import { describe, expect, it } from 'vitest'
import { findTopLevelOccurrences } from './helpers/js-text'
import { formatViolations, listFiles, loadSources, readSource } from './helpers/repo'
import { parseSfc } from './helpers/sfc'
import type { SourceFile, Violation } from './helpers/repo'

/**
 * Guard 6 — every admin page is reachable by clicking.
 *
 * `provider-registry` and `intelligence-chat` shipped with no navigation entry
 * of any kind: they existed, they worked, and the only way to open them was to
 * type the URL. Nothing fails when a page falls out of the menu, so nothing
 * ever surfaced it.
 *
 * The check is written against *link* occurrences rather than against
 * `DashboardNav`'s current data shape, because that component is under active
 * restructuring. Anything that puts the path into a link — a `to` binding, a
 * `navigateTo`, a lookup table of section paths — counts.
 */

const RULE = 'admin-route-orphan'
const ADMIN_PAGES_DIR = 'app/pages/admin'

/**
 * Occurrences that only *recognise* a path rather than navigate to it.
 * `AdminNav` matches every console path in its active-state helper, so without
 * this the guard would call every route reachable and prove nothing.
 */
const MATCHING_CALL_SUFFIX = /(?:startsWith|endsWith|includes|indexOf|match|test|replace|startsWithAny)\s*\(\s*$/
const COMPARISON_SUFFIX = /(?:===|!==|==|!=)\s*$/

/**
 * A route path is only a link when it starts where the string does. Since the
 * console moved from `/dashboard/admin/*` to `/admin/*`, every page route is a
 * suffix of its own API route — `/admin/codes` occurs inside the four
 * `'/api/admin/codes'` calls in `subscriptions.vue` — and a plain substring
 * scan reported the orphaned activation-codes page as reachable.
 */
const PATH_SEGMENT_CHARACTER = /[\w\-./]/

export function routePathForPage(relativePath: string): string {
  const name = relativePath.slice(`${ADMIN_PAGES_DIR}/`.length).replace(/\.vue$/, '')
  return `/admin/${name}`
}

/**
 * A page that only forwards elsewhere needs no menu entry. Detected from the
 * code rather than allow-listed, so retiring another page does not require
 * editing this guard.
 */
export function isForwardingPage(file: SourceFile): boolean {
  const { scriptSetup, script } = parseSfc(file.content, file.path)
  for (const block of [scriptSetup, script]) {
    if (!block)
      continue
    if (/definePageMeta\s*\(\s*\{[^}]*\bredirect\s*:/s.test(block.content))
      return true
    if (findTopLevelOccurrences(block.content, /\bnavigateTo\s*\(/).length > 0)
      return true
  }
  return false
}

function countLinkOccurrences(sources: SourceFile[], routePath: string, excludePath: string): number {
  let total = 0
  for (const source of sources) {
    if (source.path === excludePath)
      continue
    let index = source.content.indexOf(routePath)
    while (index !== -1) {
      const previousCharacter = index > 0 ? source.content[index - 1]! : ''
      const preceding = source.content.slice(Math.max(0, index - 40), index).replace(/['"`]\s*$/, '')
      if (
        !PATH_SEGMENT_CHARACTER.test(previousCharacter)
        && !MATCHING_CALL_SUFFIX.test(preceding)
        && !COMPARISON_SUFFIX.test(preceding)
      ) {
        total += 1
      }
      index = source.content.indexOf(routePath, index + 1)
    }
  }
  return total
}

export interface ReachabilityOptions {
  /** Every file that may contain a link. */
  linkSources: SourceFile[]
  /** Admin page files to check. */
  pages: SourceFile[]
}

export function scanAdminRouteReachability(options: ReachabilityOptions): Violation[] {
  const violations: Violation[] = []

  for (const page of options.pages) {
    if (isForwardingPage(page))
      continue
    const routePath = routePathForPage(page.path)
    if (countLinkOccurrences(options.linkSources, routePath, page.path) > 0)
      continue

    violations.push({
      file: page.path,
      line: 0,
      rule: RULE,
      message: `${routePath} has no navigation entry anywhere in app/: no link, no navigateTo, no section-path `
        + `table references it, so the page is reachable only by typing the URL. `
        + `Fix: add it to the dashboard navigation, link it from a related page, turn it into a forwarding page, `
        + `or delete it.`,
    })
  }

  return violations
}

function loadLinkSources(): SourceFile[] {
  return loadSources('app', ['.vue', '.ts']).filter(file => !file.path.includes('.test.'))
}

function loadAdminPages(): SourceFile[] {
  return listFiles(ADMIN_PAGES_DIR, ['.vue']).map(readSource)
}

/**
 * Orphans that predate this guard. Self-expiring: `no waiver has gone stale`
 * fails as soon as one gains a navigation entry.
 *
 * `/admin/intelligence-chat` used to be here and is not any more: the console
 * made its rail the single navigation surface, and the chat probe became an
 * entry under Intelligence instead of a URL-only page.
 */
const KNOWN_ORPHANS = [
  {
    route: '/admin/codes',
    why: 'Activation codes. AdminNav highlights the Subscriptions entry while on this route so the '
      + 'forward does not flash the wrong section, but nothing renders a link to it — the page is '
      + 'a redirect stub that only an old bookmark or a hand-typed URL reaches.',
  },
]

describe('guard: every admin page is reachable from the UI', () => {
  it('finds the admin pages and the links at all', () => {
    // Positive control for the inputs. A bad glob would make every page look
    // reachable (nothing to check) or every page look orphaned (nothing to
    // link from), and both read as a clean result.
    const pages = loadAdminPages()
    const links = loadLinkSources()
    expect(pages.length, 'no admin pages found').toBeGreaterThan(10)
    expect(links.length, 'no link sources found').toBeGreaterThan(100)
    expect(
      countLinkOccurrences(links, '/admin/users', 'app/pages/admin/users.vue'),
      'the users page is linked from the dashboard navigation; if this is 0 the link scan is broken',
    ).toBeGreaterThan(0)
  })

  it('ignores path matching that is not navigation', () => {
    // Without this, DashboardNav's active-state helper alone would make every
    // admin route look reachable.
    const matchingOnly: SourceFile[] = [{
      path: 'app/components/dashboard/Nav.vue',
      content: [
        'if (route.path.startsWith(\'/admin/ghost\'))',
        '  return true',
        'const active = route.path === \'/admin/ghost\'',
      ].join('\n'),
    }]
    expect(countLinkOccurrences(matchingOnly, '/admin/ghost', 'x')).toBe(0)

    const linked: SourceFile[] = [{
      path: 'app/components/dashboard/Nav.vue',
      content: 'const sectionPaths = { ghost: \'/admin/ghost\' }',
    }]
    expect(countLinkOccurrences(linked, '/admin/ghost', 'x')).toBe(1)
  })

  it('does not read an API call as a link to the page of the same name', () => {
    // The real instance: `/admin/codes` is a suffix of `/api/admin/codes`, and
    // `subscriptions.vue` calls that endpoint four times. Before the segment
    // rule those four calls made the orphaned activation-codes page look
    // reachable, which is the one thing this guard exists to notice.
    // Assembled rather than written out: a literal interpolation inside a
    // non-template string is exactly what `no-template-curly-in-string` exists
    // to catch, and here it is fixture text, not a bug.
    const interpolation = `$${'{code.id}'}`
    const apiOnly: SourceFile[] = [{
      path: 'app/pages/admin/subscriptions.vue',
      content: [
        'const res = await rawFetch(\'/api/admin/codes\')',
        `await rawFetch(\`/api/admin/codes/${interpolation}\`, { method: 'DELETE' })`,
      ].join('\n'),
    }]
    expect(countLinkOccurrences(apiOnly, '/admin/codes', 'x')).toBe(0)

    const linked: SourceFile[] = [{
      path: 'app/components/admin/AdminNav.vue',
      content: 'const sectionPaths = { codes: \'/admin/codes\' }',
    }]
    expect(countLinkOccurrences(linked, '/admin/codes', 'x')).toBe(1)
  })

  it('flags a page nothing links to', () => {
    const page: SourceFile = {
      path: 'app/pages/admin/ghost.vue',
      content: '<script setup lang="ts">const x = 1</script>\n<template><div>{{ x }}</div></template>',
    }
    const violations = scanAdminRouteReachability({ linkSources: [], pages: [page] })
    expect(violations).toHaveLength(1)
    expect(violations[0]!.message).toContain('/admin/ghost')
  })

  it('exempts a page that only forwards elsewhere', () => {
    // intelligence-lab is reachable by URL only on purpose: it redirects.
    const page: SourceFile = {
      path: 'app/pages/admin/retired.vue',
      content: '<script setup lang="ts">\nawait navigateTo(\'/admin/intelligence\')\n</script>\n'
        + '<template><div /></template>',
    }
    expect(isForwardingPage(page)).toBe(true)
    expect(scanAdminRouteReachability({ linkSources: [], pages: [page] })).toHaveLength(0)
  })

  it('recognises the shipped intelligence-lab redirect as a forwarding page', () => {
    const lab = loadAdminPages().find(page => page.path.endsWith('intelligence-lab.vue'))
    if (!lab)
      return
    expect(isForwardingPage(lab), 'intelligence-lab.vue should forward rather than render').toBe(true)
  })

  it('reports no orphaned admin routes', () => {
    const violations = scanAdminRouteReachability({ linkSources: loadLinkSources(), pages: loadAdminPages() })
      .filter(violation => !KNOWN_ORPHANS.some(orphan => violation.message.includes(orphan.route)))
    expect(formatViolations(violations)).toBe('')
  })

  it('has no waiver that has gone stale', () => {
    const violations = scanAdminRouteReachability({ linkSources: loadLinkSources(), pages: loadAdminPages() })
    const stale = KNOWN_ORPHANS.filter(orphan => !violations.some(violation => violation.message.includes(orphan.route)))
    expect(
      stale.map(orphan => `${orphan.route} is reachable now — delete its KNOWN_ORPHANS entry`).join('\n'),
    ).toBe('')
  })
})
