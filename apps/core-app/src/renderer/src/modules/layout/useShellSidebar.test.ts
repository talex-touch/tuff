import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import {
  SIDEBAR_EXPANDED_DEFAULT,
  SIDEBAR_EXPANDED_MIN,
  SIDEBAR_RAIL_WIDTH,
  SIDEBAR_RAIL_WIDTH_MAC
} from './shell-sidebar-state'

const appSettingTarget: Record<string, unknown> = {}
const platformState = { isMac: true }

vi.mock('~/modules/storage/app-storage', async () => {
  const vue = await vi.importActual<typeof import('vue')>('vue')
  return { appSetting: vue.reactive(appSettingTarget) }
})

vi.mock('~/modules/platform/renderer-platform', async () => {
  const vue = await vi.importActual<typeof import('vue')>('vue')
  return {
    useRendererPlatform: () => ({ isMac: vue.computed(() => platformState.isMac) })
  }
})

const { useShellSidebar } = await import('./useShellSidebar')

function resetSettings(shell?: Record<string, unknown>): void {
  for (const key of Object.keys(appSettingTarget)) delete appSettingTarget[key]
  if (shell) appSettingTarget.shell = reactive(shell)
}

describe('useShellSidebar', () => {
  beforeEach(() => {
    platformState.isMac = true
    resetSettings()
  })

  it('falls back to the default width when the config predates the shell block', () => {
    const { width, collapsed } = useShellSidebar()

    expect(collapsed.value).toBe(false)
    expect(width.value).toBe(SIDEBAR_EXPANDED_DEFAULT)
  })

  it('creates the shell block on first write instead of dropping the change', () => {
    const { toggle, collapsed } = useShellSidebar()

    toggle()

    expect(appSettingTarget.shell).toMatchObject({ sidebarCollapsed: true })
    expect(collapsed.value).toBe(true)
  })

  it('restores the width the user chose, not the default, when re-expanding', () => {
    resetSettings({ sidebarWidth: 330, sidebarCollapsed: false })
    const { toggle, width } = useShellSidebar()

    toggle()
    expect(width.value).toBe(SIDEBAR_RAIL_WIDTH_MAC)

    toggle()
    expect(width.value).toBe(330)
  })

  it('uses the narrow rail off macOS, where no window buttons sit in the column', () => {
    platformState.isMac = false
    resetSettings({ sidebarWidth: 300, sidebarCollapsed: true })

    expect(useShellSidebar().width.value).toBe(SIDEBAR_RAIL_WIDTH)
  })

  it('clamps a persisted width that is out of range', () => {
    resetSettings({ sidebarWidth: 40, sidebarCollapsed: false })

    expect(useShellSidebar().width.value).toBe(SIDEBAR_EXPANDED_MIN)
  })

  it('shares one state across call sites so the toggle and the sidebar cannot disagree', () => {
    const chromeBar = useShellSidebar()
    const sidebar = useShellSidebar()

    chromeBar.toggle()

    expect(sidebar.collapsed.value).toBe(true)
  })
})
