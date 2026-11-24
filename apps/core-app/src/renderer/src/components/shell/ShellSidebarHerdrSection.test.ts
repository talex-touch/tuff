// @vitest-environment jsdom

import type { HerdrProjectedSession } from '~/modules/herdr/useHerdrRuntime'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'

enableAutoUnmount(afterEach)

const mocks = vi.hoisted(() => ({
  send: vi.fn(async () => ({ turn: 1, status: 'working', started: true })),
  interrupt: vi.fn(async () => ({ terminal: 't1', action: 'interrupt', outcome: 'stopped' })),
  openSessionStructured: vi.fn(),
  openTerminalTab: vi.fn(),
  openNewHerdrTab: vi.fn(async () => ({ id: 'herdr:t9' })),
  isAttached: vi.fn(() => false)
}))

const collapsedRef = ref(false)
const loadingRef = ref(false)
const isConnectedRef = ref(true)
const isFallbackRef = ref(false)
const liveSessionsRef = ref<HerdrProjectedSession[]>([])

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('vue-sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn()
  }
}))

vi.mock('~/modules/layout/useShellSidebar', () => ({
  useShellSidebar: () => ({
    collapsed: collapsedRef
  })
}))

vi.mock('~/modules/herdr/useHerdrRuntime', () => ({
  useHerdrRuntime: () => ({
    loading: loadingRef,
    isConnected: isConnectedRef,
    isFallback: isFallbackRef,
    liveSessions: liveSessionsRef,
    liveCount: computed(() => liveSessionsRef.value.length),
    hasBlockedSession: computed(() =>
      liveSessionsRef.value.some((session) => session.status?.state === 'blocked')
    ),
    send: mocks.send,
    interrupt: mocks.interrupt,
    openSessionStructured: mocks.openSessionStructured,
    openTerminalTab: mocks.openTerminalTab,
    openNewHerdrTab: mocks.openNewHerdrTab,
    isAttached: mocks.isAttached
  })
}))

vi.mock('@talex-touch/tuffex/skeleton', () => ({
  TxRowSkeleton: {
    name: 'TxRowSkeleton',
    props: {
      rows: { type: Number, default: 1 },
      leading: { type: Boolean, default: false },
      description: { type: Boolean, default: false },
      trailing: { type: Boolean, default: false },
      titleWidth: { type: String, default: '' },
      descWidth: { type: String, default: '' }
    },
    template: '<div class="tx-row-skeleton-stub" data-testid="tx-row-skeleton" />'
  }
}))

vi.mock('@talex-touch/tuffex/popover', () => ({
  TxPopover: {
    name: 'TxPopover',
    props: {
      modelValue: { type: Boolean, default: false }
    },
    emits: ['update:modelValue'],
    template: '<div class="tx-popover-stub"><slot name="reference" /><slot /></div>'
  }
}))

vi.mock('@talex-touch/tuffex/input', () => ({
  TxInput: {
    name: 'TxInput',
    props: {
      modelValue: { type: String, default: '' },
      placeholder: { type: String, default: '' }
    },
    emits: ['update:modelValue'],
    template:
      '<input class="tx-input-stub" :value="modelValue" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  }
}))

vi.mock('@talex-touch/tuffex/button', () => ({
  TxButton: {
    name: 'TxButton',
    props: {
      nativeType: { type: String, default: 'button' },
      disabled: { type: Boolean, default: false },
      loading: { type: Boolean, default: false }
    },
    template: '<button :type="nativeType || \'button\'" :disabled="disabled"><slot /></button>'
  }
}))

import ShellSidebarHerdrSection from './ShellSidebarHerdrSection.vue'

function makeProjectedSession(
  overrides: Partial<HerdrProjectedSession> = {}
): HerdrProjectedSession {
  return {
    address: 't1',
    machine: null,
    name: 'codex-refactor',
    title: '',
    argv: ['codex'],
    cwd: '/Users/dev/app',
    foregroundName: 'codex',
    foregroundCwd: '/Users/dev/app',
    foregroundPid: 101,
    state: 'live',
    status: { state: 'working', app: 'codex', progress: 65, msg: 'Running tests' },
    statusMs: 1000,
    reported: true,
    turn: 2,
    keep: false,
    template: null,
    parent: null,
    labels: {},
    cols: 80,
    rows: 24,
    pid: 100,
    exitCode: null,
    signal: null,
    reason: null,
    screen: 'exact',
    createdMs: 900,
    finishedMs: null,
    projectId: 'proj-1',
    projectName: 'Tuff App',
    displayTitle: 'codex-refactor',
    ...overrides
  }
}

describe('ShellSidebarHerdrSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    collapsedRef.value = false
    loadingRef.value = false
    isConnectedRef.value = true
    isFallbackRef.value = false
    liveSessionsRef.value = []
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders TxRowSkeleton during initial loading state', () => {
    loadingRef.value = true
    const wrapper = mount(ShellSidebarHerdrSection)
    expect(wrapper.find('[data-testid="tx-row-skeleton"]').exists()).toBe(true)
  })

  it('renders active task cards with OSC 7501 status, blocked kind, badges, and progress bar', () => {
    liveSessionsRef.value = [
      makeProjectedSession({
        address: 'prod/t2',
        machine: 'prod',
        name: null,
        foregroundName: 'claude',
        displayTitle: 'claude',
        projectId: null,
        projectName: null,
        status: { state: 'blocked', app: 'claude', kind: 'permission', progress: 42 }
      }),
      makeProjectedSession({
        address: 't1',
        machine: null,
        status: { state: 'working', app: 'codex', progress: 80 }
      })
    ]

    const wrapper = mount(ShellSidebarHerdrSection)

    expect(wrapper.find('[data-testid="herdr-live-count"]').text()).toBe('2')
    expect(wrapper.find('[data-testid="herdr-blocked-dot"]').exists()).toBe(true)

    const cards = wrapper.findAll('[data-testid="herdr-task-card"]')
    expect(cards).toHaveLength(2)

    // First card: remote machine badge, blocked + permission status pill, progress bar 42%
    expect(cards[0]!.find('[data-testid="herdr-remote-badge"]').text()).toContain('prod')
    expect(cards[0]!.find('[data-testid="herdr-project-badge"]').exists()).toBe(false)
    const blockedPill = cards[0]!.find('[data-testid="herdr-status-pill"]')
    expect(blockedPill.text()).toContain('herdr.status.blocked')
    expect(blockedPill.text()).toContain('herdr.blockedKind.permission')
    expect(cards[0]!.find('[data-testid="herdr-progress-bar"]').attributes('aria-valuenow')).toBe(
      '42'
    )

    // Second card: local project badge, no remote badge
    expect(cards[1]!.find('[data-testid="herdr-remote-badge"]').exists()).toBe(false)
    expect(cards[1]!.find('[data-testid="herdr-project-badge"]').text()).toContain('Tuff App')
  })

  it('supports inline quick send, interrupt, attach actions and collapsible header', async () => {
    liveSessionsRef.value = [makeProjectedSession({ address: 't7' })]
    const wrapper = mount(ShellSidebarHerdrSection)

    // Quick send form submits to runtime.send
    const input = wrapper.find('[data-testid="herdr-card-send-input"]')
    await input.setValue('continue please')
    await wrapper.find('[data-testid="herdr-card-send-form"]').trigger('submit')
    await flushPromises()
    expect(mocks.send).toHaveBeenCalledWith('t7', 'continue please')

    // Interrupt button triggers runtime.interrupt
    await wrapper.find('[data-testid="herdr-card-interrupt"]').trigger('click')
    expect(mocks.interrupt).toHaveBeenCalledWith('t7')

    // Clicking the card title opens GUI-first structured card view.
    await wrapper.find('[data-testid="herdr-card-open"]').trigger('click')
    expect(mocks.openSessionStructured).toHaveBeenCalledWith('t7', { openDrawer: true })

    // Direct Terminal button jumps straight into terminal attach mode.
    await wrapper.find('[data-testid="herdr-card-attach"]').trigger('click')
    expect(mocks.openTerminalTab).toHaveBeenCalledWith('t7', { openDrawer: true })

    // Header toggle collapses the section cleanly
    const toggleBtn = wrapper.find('[data-testid="herdr-section-toggle"]')
    expect(toggleBtn.element.tagName).toBe('BUTTON')
    expect(toggleBtn.attributes('aria-expanded')).toBe('true')
    await toggleBtn.trigger('click')
    expect(toggleBtn.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('[data-testid="herdr-task-card"]').exists()).toBe(false)
  })

  it('renders compact rail badge with blocked dot when collapsed and hides when empty', async () => {
    collapsedRef.value = true
    liveSessionsRef.value = []
    const wrapper = mount(ShellSidebarHerdrSection)
    expect(wrapper.find('[data-testid="herdr-rail-badge"]').exists()).toBe(false)

    liveSessionsRef.value = [
      makeProjectedSession({
        address: 't5',
        status: { state: 'blocked', kind: 'auth' }
      })
    ]
    await flushPromises()

    const railBtn = wrapper.find('[data-testid="herdr-rail-badge"]')
    expect(railBtn.exists()).toBe(true)
    expect(railBtn.find('[data-testid="herdr-rail-blocked-dot"]').exists()).toBe(true)

    await railBtn.trigger('click')
    expect(mocks.openSessionStructured).toHaveBeenCalledWith('t5', { openDrawer: true })
  })
})
