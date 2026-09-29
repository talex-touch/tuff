import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Source-level contracts on the analytics and audits pages that no runtime test
 * can reach: CSS-layout facts (jsdom does no layout) and the analytics panel
 * selector, which jsdom cannot render either because `TxFlatRadio` measures its
 * own items. Each of these shipped broken once while looking correct in review.
 */

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const SERVER_API = path.join(APP_ROOT, 'server/api')

function readPage(name: string): string {
  return readFileSync(path.join(APP_ROOT, 'app/pages/admin', name), 'utf8')
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

describe('admin analytics charts', () => {
  it('renders every distribution through a tuffex chart component', () => {
    // This page used to draw its own bars, and the previous revision of this
    // test pinned the CSS fix for the percentage-height collapse that caused.
    // The panels now only shape data and hand it to tuffex chart components, so
    // the contract worth defending is that the delegation stays — jsdom cannot
    // render ECharts or d3, so it has to be read from the source.
    const source = readPage('analytics.vue')

    for (const component of ['TxStatCard', 'TxBarChart', 'TxPieChart', 'TxChoroplethMap']) {
      expect(source, `analytics.vue should render ${component}`).toContain(`<${component}`)
    }
    expect(source, 'the hourly panel should keep its chart').toMatch(/Hourly Distribution \(UTC\)[\s\S]*?<TxBarChart/)
    expect(source, 'no hand-rolled percentage-height bars should come back').not.toContain('hourlySeries.max')
  })

  it('keeps the region map inside the versions panel', () => {
    // Overview's Device/Region Distribution panels and the standalone `geo`
    // panel are gone; the map lives in the `versions` (Version + Geo) panel now.
    // Slicing the panel out of the template keeps the assertion pointing at the
    // panel that renders it, not at a string that happens to exist somewhere.
    const source = readPage('analytics.vue')
    const versionsPanel = source.match(/activeSection === 'versions'[\s\S]*?activeSection === 'messages'/)?.[0]

    expect(versionsPanel, 'analytics.vue should render a versions panel').toBeTruthy()
    expect(versionsPanel, 'the country view should stay a tuffex choropleth').toMatch(/<TxChoroplethMap[\s\S]*?geoCountryMapRows/)
    expect(versionsPanel, 'the drilldown should stay a tuffex bubble map').toMatch(/<TxBubbleMap[\s\S]*?geoMapPoints/)
  })
})

/**
 * The nine panels are one page addressed nine ways: `?section=` picks the panel,
 * the header radio switches it, and each panel renders behind its own
 * `activeSection === '<id>'` guard. jsdom cannot render the selector (TxFlatRadio
 * measures its own items), so the two halves that keep it honest — the section
 * table it is built from and the guards that render the panels — are read from
 * the page source. A radio item with no panel is a blank screen behind a control
 * that looks like it worked.
 */
describe('admin analytics panel selector', () => {
  const EXPECTED_SECTIONS = ['overview', 'usage', 'performance', 'search', 'intelligence', 'docs', 'versions', 'exchange', 'messages']

  /** `const ANALYTICS_SECTIONS = [...]` — the ids the page accepts from `?section=`. */
  function declaredSections(source: string): string[] {
    const list = source.match(/const ANALYTICS_SECTIONS = \[([^\]]*)\]/)?.[1]
    return [...(list ?? '').matchAll(/'([^']+)'/g)].map(match => match[1]!)
  }

  /** `const analyticsSections = [ { id: … } ]` — the table the selector renders. */
  function selectorSections(source: string): string[] {
    const table = source.match(/const analyticsSections = \[([\s\S]*?)\] as const/)?.[1]
    return [...(table ?? '').matchAll(/id: '([^']+)'/g)].map(match => match[1]!)
  }

  /** The ids the template renders a panel for. */
  function renderedPanels(source: string): string[] {
    const template = source.slice(source.indexOf('</script>'))
    return [...new Set([...template.matchAll(/activeSection === '([^']+)'/g)].map(match => match[1]!))]
  }

  it('keeps the selectable ids and the selector table in the same order', () => {
    // `ANALYTICS_SECTIONS` validates `?section=`; `analyticsSections` builds the
    // radio items. Nothing else ties them together, so a panel added to one and
    // not the other is an item that selects nothing (or a deep link that falls
    // back to the overview) — and the order is what the row shows left to right.
    const source = readPage('analytics.vue')

    expect(declaredSections(source)).toEqual(EXPECTED_SECTIONS)
    expect(selectorSections(source)).toEqual(EXPECTED_SECTIONS)
  })

  it('renders a panel for every section the selector can pick', () => {
    const source = readPage('analytics.vue')
    const panels = renderedPanels(source)

    expect(declaredSections(source).filter(section => !panels.includes(section))).toEqual([])
  })

  it('renders no panel for a section the selector cannot pick', () => {
    // The other direction: an orphan guard is content nothing can reach, which
    // is how a panel survives its own item being deleted.
    const source = readPage('analytics.vue')
    const declared = declaredSections(source)

    expect(renderedPanels(source).filter(section => !declared.includes(section))).toEqual([])
  })

  it('builds the header selector from the section table', () => {
    const source = readPage('analytics.vue')

    expect(source, 'the header should carry the panel selector').toContain('<TxFlatRadio')
    expect(source, 'the selector should render the section table').toMatch(/<TxFlatRadioItem[\s\S]*?v-for="item in analyticsTabs"/)
    expect(source, 'each item should carry its id, its label, and its icon').toMatch(
      /<TxFlatRadioItem[\s\S]*?:value="item\.value"[\s\S]*?:label="item\.label"[\s\S]*?:icon="item\.icon"/,
    )
    expect(source, 'the selector should show the section the address names').toMatch(/<TxFlatRadio[\s\S]*?:model-value="activeSection"/)
    expect(source, 'the selector should write the section back').toMatch(/<TxFlatRadio[\s\S]*?@update:model-value="setActiveSection"/)
    expect(source, 'the items should be the section table, mapped').toMatch(/const analyticsTabs = computed\(\(\) => analyticsSections\.map\(/)
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
