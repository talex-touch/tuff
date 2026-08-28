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
const ADMIN_PAGES_DIR = 'app/pages/dashboard/admin'

/**
 * Occurrences that only *recognise* a path rather than navigate to it.
 * `DashboardNav` matches every admin path in its active-state helper, so
 * without this the guard would call every route reachable and prove nothing.
 */
const MATCHING_CALL_SUFFIX = /(?:startsWith|endsWith|includes|indexOf|match|test|replace|startsWithAny)\s*\(\s*$/
const COMPARISON_SUFFIX = /(?:===|!==|==|!=)\s*$/

export function routePathForPage(relativePath: string): string {
  const name = relativePath.slice(`${ADMIN_PAGES_DIR}/`.length).replace(/\.vue$/, '')
  return `/dashboard/admin/${name}`
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
      const preceding = source.content.slice(Math.max(0, index - 40), index).replace(/['"`]\s*$/, '')
      if (!MATCHING_CALL_SUFFIX.test(preceding) && !COMPARISON_SUFFIX.test(preceding))
        total += 1
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
 */
const KNOWN_ORPHANS = [
  {
    route: '/dashboard/admin/intelligence-chat',
    why: 'A working admin chat console with no entry point. Either it belongs in the Admin menu next to '
      + 'Tuff AI, or it is dead code that should go.',
  },
  {
    route: '/dashboard/admin/codes',
    why: 'Activation codes. AccountTabs.vue highlights the Subscriptions tab while on this route '
      + '(AccountTabs.vue:20) but never renders a link to it, and DashboardNav\'s sectionPaths has no '
      + '`codes` entry — so the page is styled as if it belonged to a tab group it cannot be reached from.',
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
      countLinkOccurrences(links, '/dashboard/admin/users', 'app/pages/dashboard/admin/users.vue'),
      'the users page is linked from the dashboard navigation; if this is 0 the link scan is broken',
    ).toBeGreaterThan(0)
  })

  it('ignores path matching that is not navigation', () => {
    // Without this, DashboardNav's active-state helper alone would make every
    // admin route look reachable.
    const matchingOnly: SourceFile[] = [{
      path: 'app/components/dashboard/Nav.vue',
      content: [
        'if (route.path.startsWith(\'/dashboard/admin/ghost\'))',
        '  return true',
        'const active = route.path === \'/dashboard/admin/ghost\'',
      ].join('\n'),
    }]
    expect(countLinkOccurrences(matchingOnly, '/dashboard/admin/ghost', 'x')).toBe(0)

    const linked: SourceFile[] = [{
      path: 'app/components/dashboard/Nav.vue',
      content: 'const sectionPaths = { ghost: \'/dashboard/admin/ghost\' }',
    }]
    expect(countLinkOccurrences(linked, '/dashboard/admin/ghost', 'x')).toBe(1)
  })

  it('flags a page nothing links to', () => {
    const page: SourceFile = {
      path: 'app/pages/dashboard/admin/ghost.vue',
      content: '<script setup lang="ts">const x = 1</script>\n<template><div>{{ x }}</div></template>',
    }
    const violations = scanAdminRouteReachability({ linkSources: [], pages: [page] })
    expect(violations).toHaveLength(1)
    expect(violations[0]!.message).toContain('/dashboard/admin/ghost')
  })

  it('exempts a page that only forwards elsewhere', () => {
    // intelligence-lab is reachable by URL only on purpose: it redirects.
    const page: SourceFile = {
      path: 'app/pages/dashboard/admin/retired.vue',
      content: '<script setup lang="ts">\nawait navigateTo(\'/dashboard/admin/intelligence\')\n</script>\n'
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
