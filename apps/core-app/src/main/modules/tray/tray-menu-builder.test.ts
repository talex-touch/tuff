import type { MenuItemConstructorOptions } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../utils/i18n-helper'

const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  trigger: vi.fn(),
  startStandalone: vi.fn(async () => undefined),
  setQuitIntent: vi.fn(),
  getEffectiveAccelerator: vi.fn<(id: string) => string | null>(() => 'Alt+Space')
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
vi.mock('../global-shortcon', () => ({
  shortcutModule: { getEffectiveAccelerator: mocks.getEffectiveAccelerator }
}))
vi.mock('../screenshot-session', () => ({
  SCREENSHOT_SHORTCUT_ID: 'screenshot.tool.start',
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

/**
 * The Open CoreBox row prints the key that opens CoreBox. It used to be written in as ⌘E, which is
 * now wrong three ways: the default is ⌥Space, the user can rebind it, and a binding with no live
 * key (refused by the OS, or lost to an in-app conflict) must not print a dead one.
 */
describe('TrayMenuBuilder Open CoreBox item', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function openCoreBoxItem(): MenuItemConstructorOptions | undefined {
    return findItem(menuItems(createBuilder()), t('tray.openCoreBox'))
  }

  it('prints the key that opens CoreBox right now', () => {
    mocks.getEffectiveAccelerator.mockReturnValue('Alt+Space')

    expect(openCoreBoxItem()?.accelerator).toBe('Alt+Space')
    expect(mocks.getEffectiveAccelerator).toHaveBeenCalledWith('core.box.toggle')
  })

  it('prints a key the user rebound it to', () => {
    mocks.getEffectiveAccelerator.mockReturnValue('CommandOrControl+K')

    expect(openCoreBoxItem()?.accelerator).toBe('CommandOrControl+K')
  })

  it('prints no key when none opens CoreBox', () => {
    mocks.getEffectiveAccelerator.mockReturnValue(null)

    expect(openCoreBoxItem()?.accelerator).toBeUndefined()
  })
})

/**
 * The Capture Now row printed a written-in ⇧⌘S: neither the screenshot default (⇧⌘A) nor whatever
 * the user rebound it to. It now reads the key the way the CoreBox row does.
 */
describe('TrayMenuBuilder Capture Now item', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function captureNowItem(bindings: Record<string, string | null>) {
    mocks.getEffectiveAccelerator.mockImplementation((id: string) => bindings[id] ?? null)
    return findItem(menuItems(createBuilder()), t('tray.screenshotNow'))
  }

  it('prints the key the screenshot shortcut is bound to right now', () => {
    const item = captureNowItem({
      'core.box.toggle': 'Alt+Space',
      'screenshot.tool.start': 'CommandOrControl+Shift+A'
    })

    expect(item?.accelerator).toBe('CommandOrControl+Shift+A')
    expect(mocks.getEffectiveAccelerator).toHaveBeenCalledWith('screenshot.tool.start')
  })

  it('prints no key when none takes a screenshot', () => {
    const item = captureNowItem({ 'core.box.toggle': 'Alt+Space' })

    expect(item).toBeDefined()
    expect(item?.accelerator).toBeUndefined()
  })
})
