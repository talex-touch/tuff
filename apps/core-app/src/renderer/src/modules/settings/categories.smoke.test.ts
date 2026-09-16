import { describe, expect, it } from 'vitest'
import { APP_DESTINATIONS } from '../../../../shared/app-destinations'
import {
  SETTING_CATEGORIES,
  groupedSettingCategories,
  groupedSettingNavigation,
  SETTING_GROUP_ORDER,
  settingCategoryChildren
} from './categories'

/**
 * The settings IA is described in three places that can drift apart: this table, the router's
 * loader map, and the files on disk. A category missing from any one of them fails as a blank
 * page or a nav item that goes nowhere — neither of which any unit test was catching.
 *
 * This checks the table against the files on disk. It deliberately does not import the pages:
 * they pull in the transport SDK singletons, which need the Electron channel and turn a unit test
 * into a half-booted renderer. Whether a page actually renders still needs a human.
 */
const PAGE_MODULES = import.meta.glob('../../views/base/settings/categories/*.vue')
const INTELLIGENCE_PAGE_MODULES = import.meta.glob('../../views/base/intelligence/*.vue')
const APPLICATION_PAGE_MODULES = import.meta.glob('../../views/base/application/*.vue')

/**
 * Categories whose page is not a `categories/Setting*Page.vue` wrapper.
 *
 * The wrapper exists to give a column page its title and 940px column. A split page mounts
 * `SettingsPage layout="split"` itself — it has no title and reaches the window edges — so
 * wrapping it would nest one shell inside another.
 */
const CATEGORY_PAGE_OVERRIDES: Record<string, Record<string, () => Promise<unknown>>> = {
  applications: APPLICATION_PAGE_MODULES
}

const CATEGORY_PAGE_PATHS: Record<string, string> = {
  applications: '../../views/base/application/ApplicationIndex.vue'
}

/** `storage-usage` is the one key whose page file is not a direct transliteration. */
function pageStem(key: string): string {
  if (key === 'storage-usage') return 'SettingStoragePage'
  const pascal = key.replace(/(^|-)([a-z])/g, (_, __, char: string) => char.toUpperCase())
  return `Setting${pascal}Page`
}

describe('settings category table', () => {
  it('has a unique key, path and label for every category', () => {
    const keys = SETTING_CATEGORIES.map((category) => category.key)
    const paths = SETTING_CATEGORIES.map((category) => category.path)

    expect(new Set(keys).size).toBe(keys.length)
    expect(new Set(paths).size).toBe(paths.length)
    for (const category of SETTING_CATEGORIES) {
      expect(category.path).toBe(`/setting/${category.key}`)
      expect(category.labelKey).toBeTruthy()
      expect(category.icon).toMatch(/^i-/)
    }
  })

  it('places every category in exactly one rendered group', () => {
    const grouped = groupedSettingCategories()
    const flattened = grouped.flatMap((group) => group.items)

    expect(grouped.map((group) => group.group)).toEqual(SETTING_GROUP_ORDER)
    expect(flattened).toHaveLength(SETTING_CATEGORIES.length)
    // An empty group would render a heading with nothing under it.
    for (const group of grouped) expect(group.items.length).toBeGreaterThan(0)
  })

  it('keeps the system group in the order the artboard shows', () => {
    const system = SETTING_CATEGORIES.filter((category) => category.group === 'system').map(
      (category) => category.key
    )

    expect(system).toEqual(['update', 'network', 'download', 'storage-usage', 'about'])
  })

  it('opens the two advanced pages only in Developer Mode', () => {
    const normalKeys = groupedSettingNavigation(false).flatMap((group) =>
      group.items.map((item) => item.key)
    )
    const developerKeys = groupedSettingNavigation(true).flatMap((group) =>
      group.items.map((item) => item.key)
    )

    expect(normalKeys).not.toContain('download')
    expect(normalKeys).not.toContain('storage-usage')
    expect(developerKeys).toEqual(expect.arrayContaining(['download', 'storage-usage']))
    // The gate only ever adds: every destination a user has today survives Developer Mode.
    expect(developerKeys).toEqual(expect.arrayContaining(normalKeys))
  })

  it('has a page file for every category', () => {
    for (const category of SETTING_CATEGORIES) {
      const override = CATEGORY_PAGE_PATHS[category.key]
      const path = override ?? `../../views/base/settings/categories/${pageStem(category.key)}.vue`
      const modules = CATEGORY_PAGE_OVERRIDES[category.key] ?? PAGE_MODULES

      expect(
        modules[path],
        `no page file for category "${category.key}" (expected ${path})`
      ).toBeTypeOf('function')
    }
  })

  it('leaves no page file without a category behind it', () => {
    const stems = Object.keys(PAGE_MODULES).map((path) =>
      path.split('/').pop()!.replace('.vue', '')
    )
    // A category that owns its own page contributes no wrapper, so its stem must not linger
    // here either — that is exactly the dead `SettingApplicationsPage.vue` this would catch.
    const expected = new Set(
      SETTING_CATEGORIES.filter((category) => !CATEGORY_PAGE_PATHS[category.key]).map((category) =>
        pageStem(category.key)
      )
    )

    expect(stems.filter((stem) => !expected.has(stem))).toEqual([])
  })
})

/**
 * Sub-pages repeat the same three-way drift risk as categories — table, router loader map, files
 * on disk — with one extra way to go wrong: they are registered as sibling routes, so a path that
 * does not extend its category's path lands outside it and drops the sidebar's selected state.
 */
describe('settings sub-page table', () => {
  /** `workflows` is the one key whose page file is singular. */
  function subPageStem(key: string): string {
    if (key === 'workflows') return 'IntelligenceWorkflowPage'
    return `Intelligence${key.charAt(0).toUpperCase()}${key.slice(1)}Page`
  }

  it('nests every sub-page path under its category', () => {
    for (const category of SETTING_CATEGORIES) {
      for (const child of category.children ?? []) {
        expect(child.path).toBe(`${category.path}/${child.key}`)
        expect(child.labelKey).toBeTruthy()
        expect(child.descriptionKey).toBeTruthy()
      }
    }
  })

  it('has a unique key and path across all sub-pages', () => {
    const children = SETTING_CATEGORIES.flatMap((category) => category.children ?? [])
    const keys = children.map((child) => child.key)
    const paths = children.map((child) => child.path)

    expect(new Set(keys).size).toBe(keys.length)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('keeps beta intelligence routes registered but hides them from normal child lists', () => {
    const registeredKeys = settingCategoryChildren('intelligence').map((child) => child.key)
    const normalKeys = settingCategoryChildren('intelligence', false).map((child) => child.key)

    expect(registeredKeys).toEqual(expect.arrayContaining(['prompts', 'agents', 'workflows']))
    expect(normalKeys).toEqual(expect.arrayContaining(['channels', 'capabilities']))
    expect(normalKeys).not.toContain('prompts')
    expect(normalKeys).not.toContain('agents')
    expect(normalKeys).not.toContain('workflows')
  })

  it('hides beta-promoted intelligence navigation while retaining ordinary destinations', () => {
    const normalNavigationKeys = groupedSettingNavigation(false)
      .find((group) => group.group === 'intelligence')!
      .items.map((item) => item.key)

    expect(normalNavigationKeys).toEqual(
      expect.arrayContaining(['intelligence-channels', 'intelligence-capabilities'])
    )
    expect(normalNavigationKeys).not.toContain('intelligence-prompts')
    expect(normalNavigationKeys).not.toContain('intelligence-agents')
  })

  it('has a page file for every intelligence sub-page, and no page file without one', () => {
    const children = settingCategoryChildren('intelligence')
    const expected = new Set(children.map((child) => subPageStem(child.key)))

    for (const stem of expected) {
      const path = `../../views/base/intelligence/${stem}.vue`
      expect(INTELLIGENCE_PAGE_MODULES[path], `no page file for ${stem}.vue`).toBeTypeOf('function')
    }

    const stems = Object.keys(INTELLIGENCE_PAGE_MODULES).map((path) =>
      path.split('/').pop()!.replace('.vue', '')
    )
    expect(stems.filter((stem) => !expected.has(stem))).toEqual([])
  })
})

/**
 * The shared destination catalog names renderer routes; the router registers those same routes
 * from `SETTING_CATEGORIES` in a different package. A catalog route the router never registers is
 * a search result that lands on a blank page, and a renamed renderer route silently orphans the
 * destination. Neither side is visible to the renderer-only table tests above.
 */
describe('destination catalog route parity', () => {
  const registeredRoutes = new Set([
    ...SETTING_CATEGORIES.map((category) => category.path),
    ...SETTING_CATEGORIES.flatMap((category) =>
      (category.children ?? []).map((child) => child.path)
    )
  ])
  const routeBySettingKey = new Map<string, string>([
    ...SETTING_CATEGORIES.map((category) => [category.key, category.path] as const),
    ...SETTING_CATEGORIES.flatMap((category) =>
      (category.children ?? []).map((child) => [child.key, child.path] as const)
    )
  ])

  it('points every settings destination at the route the renderer registers for its key', () => {
    const settingsDestinations = APP_DESTINATIONS.filter((definition) =>
      definition.id.startsWith('settings-')
    )

    expect(settingsDestinations.length).toBeGreaterThan(0)
    for (const definition of settingsDestinations) {
      const key = definition.id.slice('settings-'.length)
      const expectedRoute = routeBySettingKey.get(key)
      expect(expectedRoute, `no renderer route registered for ${definition.id}`).toBeDefined()
      expect(definition.route).toBe(expectedRoute)
    }
  })

  it('does not expose advanced/developer-only settings routes as destinations', () => {
    const advancedRoutes = new Set(
      SETTING_CATEGORIES.filter((category) => category.advanced).map((category) => category.path)
    )
    const exposed = APP_DESTINATIONS.map((definition) => definition.route).filter(
      (route): route is string => route !== null && advancedRoutes.has(route)
    )

    expect(exposed).toEqual([])
  })

  it('keeps the reveal destination route-less and every other route registered', () => {
    for (const definition of APP_DESTINATIONS) {
      if (definition.id === 'main-window') {
        expect(definition.route).toBeNull()
        continue
      }
      expect(
        registeredRoutes.has(definition.route as string) || definition.route === '/home',
        `${definition.id} -> ${definition.route} is not a registered route`
      ).toBe(true)
    }
  })
})
