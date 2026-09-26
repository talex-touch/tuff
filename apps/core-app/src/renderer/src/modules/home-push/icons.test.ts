import { fileURLToPath } from 'node:url'
import riIcons from '@iconify-json/ri/icons.json'
import { describe, expect, it } from 'vitest'
import unoConfig from '../../../../../uno.config'
import {
  HOME_FEED_ICONS,
  HOME_GUIDE_CATEGORY_ICONS,
  HOME_GUIDE_SELF_ICON,
  HOME_GUIDE_STARTER_ICONS,
  HOME_PUSH_ICON_CLASSES
} from './icons'

/**
 * The card rows name their icons in `.ts` tables, which UnoCSS never scans: the classes reach the
 * stylesheet only through the config's safelist, and a class outside the `ri` collection is the
 * same empty box with a green safelist. Both directions are pinned here, as for the CoreBox
 * destinations and the command catalog.
 */
describe('HOME_PUSH_ICON_CLASSES', () => {
  it('lists every table icon exactly once', () => {
    const fromTables = [
      ...Object.values(HOME_GUIDE_CATEGORY_ICONS),
      ...Object.values(HOME_GUIDE_STARTER_ICONS),
      HOME_GUIDE_SELF_ICON,
      ...Object.values(HOME_FEED_ICONS)
    ]
    expect(HOME_PUSH_ICON_CLASSES).toEqual([...new Set(fromTables)])
  })

  it('resolves every class to a real glyph in the collection the preset installs', () => {
    const glyph = (name: string): boolean =>
      Object.prototype.hasOwnProperty.call(riIcons.icons, name) ||
      Object.prototype.hasOwnProperty.call(riIcons.aliases ?? {}, name)

    const missing = HOME_PUSH_ICON_CLASSES.filter(
      (className) => !className.startsWith('i-ri-') || !glyph(className.slice('i-ri-'.length))
    )
    expect(missing).toEqual([])
  })

  it('is spread into the Uno safelist, with the table module watched by the dev server', () => {
    for (const className of HOME_PUSH_ICON_CLASSES) {
      expect(unoConfig.safelist).toContain(className)
    }
    // Without the configDeps entry a new icon stays an empty box until a dev-server restart.
    const iconsModulePath = fileURLToPath(new URL('./icons.ts', import.meta.url))
    expect(unoConfig.configDeps).toContain(iconsModulePath)
  })
})
