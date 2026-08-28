import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Two rendering contracts on the analytics and audits pages that no runtime
 * test can reach: both are pure CSS-layout facts, and jsdom does no layout.
 * Both shipped broken, and both looked correct in review.
 */

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const SERVER_API = path.join(APP_ROOT, 'server/api')

function readPage(name: string): string {
  return readFileSync(path.join(APP_ROOT, 'app/pages/dashboard/admin', name), 'utf8')
}

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory())
      sourceFiles(full, found)
    else if (full.endsWith('.ts'))
      found.push(full)
  }
  return found
}

describe('admin audits table layout', () => {
  it('lets TxDataTable own its horizontal scroll instead of leaning on an ancestor', () => {
    // .tx-data-table sets `overflow: hidden` unless it is given scrollX (see
    // TxDataTable.vue's style block). Wrapping it in `overflow-x-auto` cannot
    // work: the component clips first, so the ancestor's scrollWidth never
    // grows and no scrollbar appears. That silently amputated 98px of the
    // Detail column — the one carrying the before/after diff and the IP.
    const source = readPage('audits.vue')
    const tag = source.match(/<TxDataTable[\s\S]*?>/)?.[0]

    expect(tag, 'audits.vue should render a TxDataTable').toBeTruthy()
    expect(tag).toMatch(/\bscroll-x\b/)
  })
})

describe('admin analytics hourly chart', () => {
  it('gives each hourly column a definite height so the percentage-height bars can resolve', () => {
    // The bar sets `height: N%`, which resolves against its parent column. In a
    // flex row with `items-end` the column's height is auto, a percentage of
    // auto is auto, and every bar collapsed to 0px — the chart drew nothing at
    // all whenever there was data to draw.
    const source = readPage('analytics.vue')
    const chart = source.match(/Hourly Distribution \(UTC\)[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/)?.[0]

    expect(chart, 'analytics.vue should render the hourly distribution chart').toBeTruthy()

    const column = chart!.match(/v-for="hour in hourlySeries\.series"[\s\S]*?class="([^"]*)"/)
    expect(column, 'the hourly chart should iterate hourlySeries.series').toBeTruthy()
    expect(column![1]).toMatch(/\bh-full\b/)
  })
})

describe('admin audits action vocabulary', () => {
  /**
   * Every distinct `action` string handed to logAdminAudit() across server/api.
   * These are the only values that can ever appear in the table's Action column
   * or in the filter dropdown.
   */
  function loggedActions(): string[] {
    const actions = new Set<string>()
    for (const file of sourceFiles(SERVER_API)) {
      const source = readFileSync(file, 'utf8')
      for (const call of source.matchAll(/logAdminAudit\(\s*event\s*,\s*\{([\s\S]*?)\}\s*\)/g)) {
        const action = call[1]?.match(/\baction:\s*'([^']+)'/)?.[1]
        if (action)
          actions.add(action)
      }
    }
    return [...actions].sort()
  }

  function labelledActions(): string[] {
    const source = readPage('audits.vue')
    const map = source.match(/const actionLabels = computed<Record<string, string>>\(\(\) => \(\{([\s\S]*?)\}\)\)/)?.[1]
    expect(map, 'audits.vue should declare an actionLabels map').toBeTruthy()
    // `[a-z_.]` could never match the hyphenated ids the server actually writes
    // (`intelligence.prompt-binding.upsert`, `release.evidence.doc-guard.record`),
    // so those three counted as unlabelled no matter what audits.vue declared,
    // and the sibling stale-label assertion could not see them either. Matched
    // against the same character class loggedActions() captures.
    return [...map!.matchAll(/'([^']+)':/g)]
      .flatMap(match => (match[1] ? [match[1]] : []))
      .sort()
  }

  /**
   * A ceiling rather than an exact list, matching the governance precedent in
   * test/guards/i18n-key-existence.test.ts: server/api/admin is edited by many
   * hands at once and an exact list flaps.
   *
   * Every action the server writes now has a label and an en/zh key, so the
   * ceiling is zero: a newly audited action must arrive with its label, or the
   * entry lands in a table where no admin can read or filter it. Raising this
   * is not the fix — add the label in audits.vue and the key in both locales.
   */
  const UNLABELLED_CEILING = 0

  it('keeps the unlabelled-action debt from growing', () => {
    const logged = loggedActions()
    const labelled = labelledActions()

    // Guards the scan itself: a regex that stopped matching would report an
    // empty set and pass this assertion while checking nothing.
    expect(logged.length, 'action scan found nothing — the regex is broken').toBeGreaterThanOrEqual(8)
    expect(logged).toContain('subscription.grant')
    expect(labelled).toContain('subscription.grant')

    const missing = logged.filter(action => !labelled.includes(action))
    expect(
      missing.length,
      `${missing.length} audited actions render as a raw id and cannot be filtered (ceiling ${UNLABELLED_CEILING}): ${missing.sort().join(', ')}`,
    ).toBeLessThanOrEqual(UNLABELLED_CEILING)
  })

  it('has no label for an action the server never writes', () => {
    const logged = loggedActions()
    const stale = labelledActions().filter(action => !logged.includes(action))

    expect(stale).toEqual([])
  })
})
