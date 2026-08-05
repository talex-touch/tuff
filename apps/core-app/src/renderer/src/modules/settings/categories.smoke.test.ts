import { describe, expect, it } from 'vitest'
import { SETTING_CATEGORIES, groupedSettingCategories, SETTING_GROUP_ORDER } from './categories'

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

  it('has a page file for every category', () => {
    for (const category of SETTING_CATEGORIES) {
      const stem = pageStem(category.key)
      const path = `../../views/base/settings/categories/${stem}.vue`

      expect(
        PAGE_MODULES[path],
        `no page file for category "${category.key}" (expected ${stem}.vue)`
      ).toBeTypeOf('function')
    }
  })

  it('leaves no page file without a category behind it', () => {
    const stems = Object.keys(PAGE_MODULES).map((path) =>
      path.split('/').pop()!.replace('.vue', '')
    )
    const expected = new Set(SETTING_CATEGORIES.map((category) => pageStem(category.key)))

    expect(stems.filter((stem) => !expected.has(stem))).toEqual([])
  })
})
