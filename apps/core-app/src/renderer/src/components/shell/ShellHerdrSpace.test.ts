// @vitest-environment jsdom

import type {
  HerdrMachineView,
  HerdrRuntimeSnapshot
} from '@talex-touch/utils/transport/sdk/domains/herdr'
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
  isAttached: vi.fn(() => false),
  routerPush: vi.fn(async () => {})
}))

const routePathRef = ref('/home')

vi.mock('vue-router', () => ({
  useRoute: () => ({
    get path() {
      return routePathRef.value
    }
  }),
  useRouter: () => ({
    push: mocks.routerPush
  })
}))

const collapsedRef = ref(false)
const loadingRef = ref(false)
const isConnectedRef = ref(true)
const isFallbackRef = ref(false)
const liveSessionsRef = ref<HerdrProjectedSession[]>([])
const connectedMachinesRef = ref<HerdrMachineView[]>([])
const snapshotRef = ref<Pick<HerdrRuntimeSnapshot, 'session'> | null>({ session: 'default' })

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

vi.mock('~/modules/storage/app-storage', () => ({
  appSetting: {
    betaFeatures: { herdrRuntime: true },
    herdrCore: { session: 'default' }
  }
}))

vi.mock('~/modules/layout/useShellSidebar', () => ({
  useShellSidebar: () => ({
    collapsed: collapsedRef
  })
}))

vi.mock('~/modules/herdr/useHerdrRuntime', async () => {
  const actual = await vi.importActual<typeof import('~/modules/herdr/useHerdrRuntime')>(
    '~/modules/herdr/useHerdrRuntime'
  )
  return {
    ...actual,
    useHerdrRuntime: () => ({
      snapshot: snapshotRef,
      loading: loadingRef,
      isConnected: isConnectedRef,
      isFallback: isFallbackRef,
      connectedMachines: connectedMachinesRef,
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
  }
})

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
      modelValue: { type: Boolean, default: false },
      trigger: { type: String, default: 'click' },
      disabled: { type: Boolean, default: false }
    },
    emits: ['update:modelValue'],
    template:
      '<div class="tx-popover-stub" :data-trigger="trigger" :data-disabled="String(disabled)"><slot name="reference" /><slot /></div>'
  }
}))

vi.mock('@talex-touch/tuffex/tooltip', () => ({
  TxTooltip: {
    name: 'TxTooltip',
    props: {
      content: { type: String, default: '' },
      disabled: { type: Boolean, default: false }
    },
    template:
      '<span class="tx-tooltip-stub" :data-tooltip-content="content" :data-disabled="String(disabled)"><slot /></span>'
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

import ShellHerdrSpace from './ShellHerdrSpace.vue'

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
    appName: 'codex',
    locationLabel: 'Tuff App',
    effectiveCwd: '/Users/dev/app',
    ...overrides
  }
}

describe('ShellHerdrSpace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routePathRef.value = '/home'
    collapsedRef.value = false
    loadingRef.value = false
    isConnectedRef.value = true
    isFallbackRef.value = false
    liveSessionsRef.value = []
    connectedMachinesRef.value = []
    snapshotRef.value = { session: 'default' }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders TxRowSkeleton during initial loading state and exposes Herdr Space info popover', () => {
    loadingRef.value = true
    connectedMachinesRef.value = [
      {
        name: 'mac-work',
        target: 'ssh://mac-work',
        id: 'm1',
        host: 'mac-work',
        version: '0.2.0',
        state: 'connected',
        session: 'default',
        temporary: false,
        via: false,
        sinceMs: 1000,
        why: null
      }
    ]
    const wrapper = mount(ShellHerdrSpace)

    expect(wrapper.find('[data-testid="herdr-space-name"]').text()).toContain('herdr.space.name')
    expect(wrapper.find('[data-testid="tx-row-skeleton"]').exists()).toBe(true)

    const infoCard = wrapper.find('[data-testid="herdr-space-info-card"]')
    expect(infoCard.exists()).toBe(true)
    expect(infoCard.text()).toContain('herdr.space.description')
    expect(infoCard.text()).toContain('mac-work')
    expect(infoCard.text()).toContain('default')
  })

  it('renders task cards with OSC 7501 status, location fallback badge, progress bar, and rich hover details', () => {
    liveSessionsRef.value = [
      makeProjectedSession({
        address: 'prod/t2',
        machine: 'prod',
        name: null,
        foregroundName: '18.16.0',
        appName: 'omp',
        displayTitle: 'SING: 梳理妙唱真人评分对照',
        locationLabel: 'thunder-sing-damaged / 2',
        effectiveCwd: '/private/tmp/thunder-sing-damaged',
        labels: { where: 'thunder-sing-damaged / 2' },
        projectId: null,
        projectName: null,
        status: {
          state: 'blocked',
          app: 'omp',
          kind: 'permission',
          progress: 42,
          msg: 'Need approval'
        }
      }),
      makeProjectedSession({
        address: 't1',
        machine: null,
        status: { state: 'working', app: 'codex', progress: 80 }
      })
    ]

    const wrapper = mount(ShellHerdrSpace)

    expect(wrapper.find('[data-testid="herdr-live-count"]').text()).toBe('2')
    expect(wrapper.find('[data-testid="herdr-blocked-dot"]').exists()).toBe(true)

    const cards = wrapper.findAll('[data-testid="herdr-task-card"]')
    expect(cards).toHaveLength(2)

    // First card: remote badge + herdr location badge + blocked permission pill + hover detail card without 18.16.0
    expect(cards[0]!.find('[data-testid="herdr-remote-badge"]').text()).toContain('prod')
    expect(cards[0]!.find('[data-testid="herdr-project-badge"]').exists()).toBe(false)
    expect(cards[0]!.find('[data-testid="herdr-location-badge"]').text()).toContain(
      'thunder-sing-damaged / 2'
    )
    const blockedPill = cards[0]!.find('[data-testid="herdr-status-pill"]')
    expect(blockedPill.text()).toContain('herdr.status.blocked')
    expect(blockedPill.text()).toContain('herdr.blockedKind.permission')
    expect(cards[0]!.find('[data-testid="herdr-progress-bar"]').attributes('aria-valuenow')).toBe(
      '42'
    )

    const hoverCard = cards[0]!.find('[data-testid="herdr-task-hover-card"]')
    expect(hoverCard.exists()).toBe(true)
    expect(hoverCard.text()).toContain('SING: 梳理妙唱真人评分对照')
    expect(hoverCard.text()).toContain('omp')
    expect(hoverCard.text()).not.toContain('18.16.0')
    expect(hoverCard.text()).toContain('prod/t2')
    expect(hoverCard.text()).toContain('/private/tmp/thunder-sing-damaged')
    expect(hoverCard.text()).toContain('Need approval')
    expect(hoverCard.text()).toContain('herdr.hover.actionHint')

    // Second card: local project badge, no remote badge
    expect(cards[1]!.find('[data-testid="herdr-remote-badge"]').exists()).toBe(false)
    expect(cards[1]!.find('[data-testid="herdr-project-badge"]').text()).toContain('Tuff App')
  })

  it('omits redundant location badge when displayTitle already includes locationLabel', () => {
    liveSessionsRef.value = [
      makeProjectedSession({
        address: 't73',
        name: null,
        projectId: null,
        projectName: null,
        displayTitle: 'antigravity · thunder-vap / 1',
        locationLabel: 'thunder-vap / 1',
        labels: { where: 'thunder-vap / 1' }
      })
    ]

    const wrapper = mount(ShellHerdrSpace)
    expect(wrapper.find('[data-testid="herdr-location-badge"]').exists()).toBe(false)
  })

  it('supports inline quick send, interrupt, attach actions with tooltips, and collapsible folder row', async () => {
    liveSessionsRef.value = [makeProjectedSession({ address: 't7' })]
    const wrapper = mount(ShellHerdrSpace)

    // Tooltips exist for quick send, interrupt, attach, and new session
    const tooltipContents = wrapper
      .findAll('.tx-tooltip-stub')
      .map((item) => item.attributes('data-tooltip-content'))
    expect(tooltipContents).toContain('herdr.actions.quickSend')
    expect(tooltipContents).toContain('herdr.actions.interrupt')
    expect(tooltipContents).toContain('herdr.actions.attach')
    expect(tooltipContents).toContain('herdr.sidebar.newSession')

    // Quick send form submits to runtime.send
    const input = wrapper.find('[data-testid="herdr-card-send-input"]')
    await input.setValue('continue please')
    await wrapper.find('[data-testid="herdr-card-send-form"]').trigger('submit')
    await flushPromises()
    expect(mocks.send).toHaveBeenCalledWith('t7', 'continue please')

    // Interrupt button triggers runtime.interrupt
    await wrapper.find('[data-testid="herdr-card-interrupt"]').trigger('click')
    expect(mocks.interrupt).toHaveBeenCalledWith('t7')

    // Clicking the card navigates into the main-stage unified AI conversation view.
    await wrapper.find('[data-testid="herdr-card-open"]').trigger('click')
    expect(mocks.routerPush).toHaveBeenCalledWith('/home/herdr/t7')

    // Active card reflects the currently open main-stage route.
    routePathRef.value = '/home/herdr/t7'
    await flushPromises()
    expect(wrapper.find('[data-testid="herdr-task-card"]').classes()).toContain('is-active')

    // Direct Terminal button jumps straight into bottom-drawer terminal attach mode.
    await wrapper.find('[data-testid="herdr-card-attach"]').trigger('click')
    expect(mocks.openTerminalTab).toHaveBeenCalledWith('t7', { openDrawer: true })

    // Header toggle collapses the space cleanly
    const toggleBtn = wrapper.find('[data-testid="herdr-section-toggle"]')
    expect(toggleBtn.element.tagName).toBe('BUTTON')
    expect(toggleBtn.attributes('aria-expanded')).toBe('true')
    await toggleBtn.trigger('click')
    expect(toggleBtn.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('[data-testid="herdr-task-card"]').exists()).toBe(false)
  })

  it('renders compact rail badge with hover preview and blocked dot when collapsed', async () => {
    collapsedRef.value = true
    liveSessionsRef.value = []
    const wrapper = mount(ShellHerdrSpace)
    expect(wrapper.find('[data-testid="herdr-rail-badge"]').exists()).toBe(false)

    liveSessionsRef.value = [
      makeProjectedSession({
        address: 't5',
        displayTitle: 'claude · deploy',
        status: { state: 'blocked', kind: 'auth' }
      })
    ]
    await flushPromises()

    const railBtn = wrapper.find('[data-testid="herdr-rail-badge"]')
    expect(railBtn.exists()).toBe(true)
    expect(railBtn.find('[data-testid="herdr-rail-blocked-dot"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="herdr-rail-popover"]').text()).toContain('claude · deploy')

    await railBtn.trigger('click')
    expect(mocks.routerPush).toHaveBeenCalledWith('/home/herdr/t5')
  })
})
