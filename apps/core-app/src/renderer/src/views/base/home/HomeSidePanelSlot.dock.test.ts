// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { useShellRightSidebar } from '~/modules/layout/useShellRightSidebar'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('@talex-touch/utils/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@talex-touch/utils/env')>()
  return {
    ...actual,
    isElectronRenderer: () => false
  }
})

vi.mock('@talex-touch/tuffex/popover', () => ({
  TxPopover: {
    template: '<div><slot name="reference" /><slot /></div>'
  }
}))

vi.mock('~/modules/conversation/useConversationReview', () => ({
  useConversationReview: () => ({
    records: { value: [] },
    loading: { value: false },
    loadError: { value: null },
    detail: { value: null },
    detailLoading: { value: false },
    rollingBack: { value: false },
    lastRollback: { value: null },
    open: vi.fn(),
    close: vi.fn(),
    rollback: vi.fn(),
    reload: vi.fn()
  })
}))

vi.mock('~/components/preview/WorkspaceFileViewer.vue', () => ({
  default: { template: '<div data-testid="file-viewer" />' }
}))
vi.mock('./preview/HomeSideLauncher.vue', () => ({
  default: { template: '<div data-testid="side-launcher" />' }
}))
vi.mock('./preview/HomeSideBrowserPane.vue', () => ({
  default: { template: '<div data-testid="side-browser" />' }
}))
vi.mock('./preview/HomeSideGitPane.vue', () => ({
  default: { template: '<div data-testid="side-git" />' }
}))
vi.mock('./preview/HomeSidePluginsPane.vue', () => ({
  default: { template: '<div data-testid="side-plugins" />' }
}))
vi.mock('./preview/HomeSideTerminalPane.vue', () => ({
  default: { template: '<div data-testid="side-terminal" />' }
}))

import HomeSidePanel from './HomeSidePanel.vue'
import HomeSidePanelSlot from './HomeSidePanelSlot.vue'

function basePanelProps() {
  return {
    messages: [],
    conversationId: 'conv-1',
    activityTurns: [],
    gateway: [],
    loading: false,
    tabs: [
      { id: 't-1', kind: 'terminal' as const, title: '终端' },
      { id: 't-2', kind: 'review' as const, title: 'Review' },
      { id: 't-3', kind: 'sources' as const, title: 'Sources' }
    ],
    activeTabId: 't-1'
  }
}

describe('HomeSidePanelSlot shell dock & tab strip scrolling', () => {
  let hostEl: HTMLDivElement

  beforeEach(() => {
    hostEl = document.createElement('div')
    hostEl.className = 'AppShell-RightSidebar'
    document.body.appendChild(hostEl)
    const shell = useShellRightSidebar()
    shell.resetDockState()
    shell.registerHost(null)
  })

  afterEach(() => {
    const shell = useShellRightSidebar()
    shell.resetDockState()
    shell.registerHost(null)
    hostEl.remove()
  })

  it('teleports into the AppShell right-sidebar host and preserves mounted content when inactive', async () => {
    const shell = useShellRightSidebar()
    shell.registerHost(hostEl)

    const wrapper = mount(HomeSidePanelSlot, {
      props: {
        ...basePanelProps(),
        open: true,
        resizing: false,
        width: 520,
        dockToShell: true,
        active: true
      }
    })
    await nextTick()

    const slotEl = hostEl.querySelector<HTMLElement>('.HomePage-PanelSlot')
    expect(slotEl).not.toBeNull()
    expect(slotEl!.classList.contains('is-shell-docked')).toBe(true)
    expect(slotEl!.style.getPropertyValue('--home-panel-width')).toBe('520px')
    expect(shell.dockOpen.value).toBe(true)
    expect(shell.dockResizing.value).toBe(false)

    // Resizing reflects onto AppShell so drag-region guards activate across the whole window.
    await wrapper.setProps({ resizing: true })
    expect(shell.dockResizing.value).toBe(true)

    // Route deactivation hides the docked panel via v-show without unmounting the live terminal.
    await wrapper.setProps({ active: false, resizing: false })
    expect(shell.dockOpen.value).toBe(false)
    expect(hostEl.querySelector('[data-testid="side-terminal"]')).not.toBeNull()
    expect(slotEl!.style.display).toBe('none')

    // Closing the panel also hides via v-show so running terminal tabs stay alive across close/reopen.
    await wrapper.setProps({ active: true, open: false })
    expect(shell.dockOpen.value).toBe(false)
    expect(hostEl.querySelector('[data-testid="side-terminal"]')).not.toBeNull()
    expect(slotEl!.style.display).toBe('none')

    await wrapper.setProps({ open: true })
    expect(shell.dockOpen.value).toBe(true)
    expect(slotEl!.style.display).toBe('')

    wrapper.unmount()
    expect(shell.dockOpen.value).toBe(false)
  })

  it('defers mounting panel panes until first opened', async () => {
    const shell = useShellRightSidebar()
    shell.registerHost(hostEl)

    const wrapper = mount(HomeSidePanelSlot, {
      props: {
        ...basePanelProps(),
        open: false,
        resizing: false,
        dockToShell: true,
        active: true
      }
    })
    await nextTick()
    expect(hostEl.querySelector('[data-testid="side-terminal"]')).toBeNull()

    await wrapper.setProps({ open: true })
    await nextTick()
    expect(hostEl.querySelector('[data-testid="side-terminal"]')).not.toBeNull()

    wrapper.unmount()
  })

  it('renders inline when no shell dock host is registered', async () => {
    const wrapper = mount(HomeSidePanelSlot, {
      props: {
        ...basePanelProps(),
        open: true,
        resizing: false,
        dockToShell: true,
        active: true
      }
    })
    await nextTick()

    expect(hostEl.querySelector('.HomePage-PanelSlot')).toBeNull()
    expect(wrapper.find('.HomePage-PanelSlot').exists()).toBe(true)
    expect(wrapper.find('.HomePage-PanelSlot').classes()).not.toContain('is-shell-docked')

    wrapper.unmount()
  })

  it('scrolls the right sidebar tab strip horizontally on wheel and updates overflow edge masks', async () => {
    const wrapper = mount(HomeSidePanel, {
      props: {
        ...basePanelProps(),
        dockedToShell: true
      }
    })
    await nextTick()

    const stripWrapper = wrapper.find('.HomeSidePanel-TabStrip')
    const stripEl = stripWrapper.element as HTMLElement
    Object.defineProperty(stripEl, 'scrollWidth', { value: 640, configurable: true })
    Object.defineProperty(stripEl, 'clientWidth', { value: 240, configurable: true })
    stripEl.scrollLeft = 0

    await stripWrapper.trigger('scroll')
    expect(stripWrapper.classes()).not.toContain('can-scroll-left')
    expect(stripWrapper.classes()).toContain('can-scroll-right')

    // Vertical wheel translates to horizontal scrollLeft.
    await stripWrapper.trigger('wheel', { deltaY: 60, deltaX: 0 })
    expect(stripEl.scrollLeft).toBe(60)
    expect(stripWrapper.classes()).toContain('can-scroll-left')
    expect(stripWrapper.classes()).toContain('can-scroll-right')

    // Pure horizontal trackpad gesture is not hijacked so native inertial scroll works.
    const horizontalEvent = new WheelEvent('wheel', {
      deltaX: 30,
      deltaY: 0,
      cancelable: true
    })
    stripEl.dispatchEvent(horizontalEvent)
    expect(horizontalEvent.defaultPrevented).toBe(false)

    // Controls reserve Windows/Linux window button inset when docked to shell top-right.
    expect(wrapper.find('.HomeSidePanel-Controls').classes()).toContain(
      'shell-chrome-safe-inline-end'
    )

    wrapper.unmount()
  })
})
