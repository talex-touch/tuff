import type { MenuItemConstructorOptions } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../utils/i18n-helper'

const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  trigger: vi.fn(),
  startStandalone: vi.fn(async () => undefined),
  setQuitIntent: vi.fn()
}))

vi.mock('electron', () => ({
  app: {
    getLocale: vi.fn(() => 'en-US'),
    getVersion: vi.fn(() => '0.0.0-test'),
    isPackaged: false
  },
  Menu: { buildFromTemplate: vi.fn((template: unknown) => template) },
  shell: { openExternal: vi.fn(), openPath: vi.fn() }
}))
vi.mock('@talex-touch/utils/transport/main', () => ({ getTuffTransportMain: vi.fn() }))
vi.mock('../app-destination/app-destination-navigation', () => ({
  getAppDestinationNavigationService: vi.fn(() => ({ open: mocks.open }))
}))
vi.mock('../box-tool/core-box/manager', () => ({ coreBoxManager: { trigger: mocks.trigger } }))
vi.mock('../screenshot-session', () => ({
  screenshotSessionModule: { startStandalone: mocks.startStandalone }
}))
vi.mock('../../core/quit-intent', () => ({ setQuitIntent: mocks.setQuitIntent }))

import { TrayMenuBuilder } from './tray-menu-builder'

function createBuilder(): TrayMenuBuilder {
  const builder = new TrayMenuBuilder()
  builder.setTouchApp({
    window: {
      window: { isVisible: vi.fn(() => false) } as never
    },
    channel: {}
  })
  return builder
}

function menuItems(builder: TrayMenuBuilder): MenuItemConstructorOptions[] {
  return builder.buildMenu({
    windowVisible: false,
    activeDownloads: 0,
    hasUpdate: false
  }) as unknown as MenuItemConstructorOptions[]
}

function findItem(
  items: MenuItemConstructorOptions[],
  label: string
): MenuItemConstructorOptions | undefined {
  for (const item of items) {
    if (item.label === label) return item
    const nested = item.submenu
      ? findItem(item.submenu as MenuItemConstructorOptions[], label)
      : undefined
    if (nested) return nested
  }
  return undefined
}

/**
 * The tray Settings item used to sequence the window itself and push `/setting` over a
 * request/response transport call. It now goes through the shared destination service like every
 * other caller, so a regression that re-adds the local show/navigate sequence has to fail here.
 */
describe('TrayMenuBuilder settings item', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens the settings-overview destination through the shared navigation service', () => {
    const builder = createBuilder()
    const settings = findItem(menuItems(builder), t('tray.settings'))

    expect(settings).toBeDefined()
    settings?.click?.({} as never, undefined as never, {} as never)

    expect(mocks.open).toHaveBeenCalledExactlyOnceWith('settings-overview')
  })
})
