// @vitest-environment jsdom
/* eslint-disable vue/one-component-per-file */

import type {
  HerdrMachineView,
  HerdrRuntimeSnapshot
} from '@talex-touch/utils/transport/sdk/domains/herdr'
import type { HerdrProjectedSession } from '~/modules/herdr/useHerdrRuntime'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, ref } from 'vue'
import { groupHerdrSessions } from '~/modules/herdr/herdr-project-groups'
import {
  getSpaceTabs,
  herdrProjectSpaceKey,
  herdrTabId,
  resetShellWorkspaceTabsForTests
} from '~/modules/layout/useShellWorkspaceTabs'

enableAutoUnmount(afterEach)

const mocks = vi.hoisted(() => ({
  send: vi.fn(async () => ({ turn: 1, status: 'working', started: true })),
  interrupt: vi.fn(async () => ({ terminal: 't1', action: 'interrupt', outcome: 'stopped' })),
  kill: vi.fn(async () => ({ terminal: 't1', action: 'kill' })),
  openSessionStructured: vi.fn(),
  openTerminalTab: vi.fn(),
  startSession: vi.fn(async () => ({ address: 't9' })),
  openNewHerdrTab: vi.fn(async () => ({ id: 'herdr:t9' })),
  isAttached: vi.fn(() => false),
  routerPush: vi.fn(async () => {})
}))

const routePathRef = ref('/home')
const routeParamsRef = ref<Record<string, string>>({})

vi.mock('vue-router', () => ({
  useRoute: () => ({
    get path() {
      return routePathRef.value
    },
    get params() {
      return routeParamsRef.value
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
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key
  })
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
    useHerdrRuntime: () => {
      const projectGroups = computed(() => groupHerdrSessions(liveSessionsRef.value))
      return {
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
        projectGroups,
        projectGroupByKey: computed(() => {
          const map = new Map()
          for (const g of projectGroups.value) map.set(g.key, g)
          return map
        }),
        projectGroupByAddress: computed(() => {
          const map = new Map()
          for (const g of projectGroups.value) {
            for (const s of g.sessions) map.set(s.address, g)
          }
          return map
        }),
        send: mocks.send,
        interrupt: mocks.interrupt,
        kill: mocks.kill,
        openSessionStructured: mocks.openSessionStructured,
        openTerminalTab: mocks.openTerminalTab,
        startSession: mocks.startSession,
        openNewHerdrTab: mocks.openNewHerdrTab,
        isAttached: mocks.isAttached
      }
    }
  }
})

vi.mock('@talex-touch/tuffex/skeleton', () => ({
  TxRowSkeleton: {
    name: 'TxRowSkeleton',
    template: '<div class="tx-row-skeleton-stub" data-testid="tx-row-skeleton" />'
  }
}))

vi.mock('@talex-touch/tuffex/spinner', () => ({
  TxSpinner: {
    name: 'TxSpinner',
    props: { size: Number, strokeWidth: Number },
    template: '<span class="tx-spinner-stub" data-testid="tx-spinner" />'
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

vi.mock('@talex-touch/tuffex/dropdown-menu', () => ({
  TxDropdownMenu: defineComponent({
    name: 'TxDropdownMenu',
    props: { modelValue: { type: Boolean, default: false } },
    emits: ['update:modelValue'],
    setup(_props, { slots }) {
      return () => h('div', { class: 'tx-dropdown-stub' }, [slots.trigger?.(), slots.default?.()])
    }
  }),
  TxDropdownSubmenu: defineComponent({
    name: 'TxDropdownSubmenu',
    setup(_props, { slots, attrs }) {
      return () =>
        h('div', { ...attrs, class: 'tx-dropdown-submenu-stub' }, [
          slots.default?.(),
          slots.menu?.()
        ])
    }
  }),
  TxDropdownItem: defineComponent({
    name: 'TxDropdownItem',
    props: {
      disabled: { type: Boolean, default: false },
      danger: { type: Boolean, default: false }
    },
    emits: ['select'],
    setup(props, { slots, emit, attrs }) {
      return () =>
        h(
          'button',
          {
            ...attrs,
            type: 'button',
            class: 'tx-dropdown-item-stub',
            disabled: props.disabled,
            onClick: () => emit('select')
          },
          slots.default?.()
        )
    }
  })
}))

vi.mock('@talex-touch/tuffex/modal', () => ({
  TxModal: defineComponent({
    name: 'TxModal',
    props: {
      modelValue: { type: Boolean, default: false },
      title: { type: String, default: '' }
    },
    emits: ['update:modelValue'],
    setup(props, { slots }) {
      return () =>
        props.modelValue
          ? h('div', { class: 'tx-modal-stub', 'data-title': props.title }, slots.default?.())
          : null
    }
  })
}))

interface DialogButtonStub {
  content: string
  type: string
  onClick?: () => boolean
}

vi.mock('@talex-touch/tuffex/dialog', () => ({
  TxBottomDialog: defineComponent({
    name: 'TxBottomDialog',
    props: {
      title: { type: String, default: '' },
      message: { type: String, default: '' },
      btns: { type: Array as () => DialogButtonStub[], default: () => [] },
      close: { type: Function, default: () => {} }
    },
    setup(props) {
      return () =>
        h('div', { class: 'tx-bottom-dialog-stub', 'data-testid': 'herdr-kill-dialog' }, [
          h('span', { class: 'dialog-title' }, props.title),
          h('span', { class: 'dialog-message' }, props.message),
          props.btns.map((btn) =>
            h(
              'button',
              {
                type: 'button',
                class: `dialog-btn-${btn.type}`,
                onClick: () => {
                  if (btn.onClick?.() !== false) props.close?.()
                }
              },
              btn.content
            )
          )
        ])
    }
  })
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
    name: null,
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
    projectId: null,
    projectName: null,
    displayTitle: 'codex-refactor',
    appName: 'codex',
    locationLabel: null,
    effectiveCwd: '/Users/dev/app',
    ...overrides
  }
}

describe('ShellHerdrSpace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetShellWorkspaceTabsForTests()
    routePathRef.value = '/home'
    routeParamsRef.value = {}
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

  it('groups live Herdr terminals into project rows with counts, indicators, and hover terminal previews', () => {
    liveSessionsRef.value = [
      makeProjectedSession({
        address: 't94',
        appName: 'omp',
        displayTitle: 'SING: 梳理妙唱真人评分对照',
        effectiveCwd: '/private/tmp/thunder-sing-damaged',
        labels: { 'herdr.space': 'sp-sing', where: 'thunder-sing-damaged / 2' },
        status: { state: 'blocked', app: 'omp', kind: 'permission' },
        createdMs: 100
      }),
      makeProjectedSession({
        address: 't96',
        appName: 'omp',
        displayTitle: 'KSING: 部署 VOD 打分结算服务',
        effectiveCwd: '/private/tmp/thunder-sing-damaged',
        labels: { 'herdr.space': 'sp-sing', where: 'thunder-sing-damaged / 3' },
        status: { state: 'done', app: 'omp' },
        createdMs: 200
      }),
      makeProjectedSession({
        address: 't9d',
        appName: 'antigravity',
        displayTitle: 'antigravity · thunder-opensi / 1',
        effectiveCwd: '/Users/dev/thunder-opensi',
        labels: { 'herdr.space': 'sp-opensi', where: 'thunder-opensi / 1' },
        status: { state: 'working', app: 'antigravity' },
        createdMs: 300
      })
    ]

    const wrapper = mount(ShellHerdrSpace)

    expect(wrapper.find('[data-testid="herdr-live-count"]').text()).toBe('3')
    expect(wrapper.find('[data-testid="herdr-blocked-dot"]').exists()).toBe(true)

    // 3 terminals collapse into 2 clean project rows.
    const rows = wrapper.findAll('[data-testid="herdr-project-row"]')
    expect(rows).toHaveLength(2)

    // First row: thunder-sing-damaged (blocked priority, 2 terminals, attention dot, single ⋯ menu).
    expect(rows[0]!.find('[data-testid="herdr-project-open"]').text()).toContain(
      'thunder-sing-damaged'
    )
    expect(rows[0]!.find('[data-testid="herdr-project-count"]').text()).toBe('2')
    expect(rows[0]!.find('[data-testid="herdr-row-status-dot"]').classes()).toContain('is-blocked')
    expect(rows[0]!.find('[data-testid="herdr-project-more"]').exists()).toBe(true)

    // Hover popover previews both terminals under this project.
    const hoverCard = rows[0]!.find('[data-testid="herdr-project-hover-card"]')
    expect(hoverCard.text()).toContain('SING: 梳理妙唱真人评分对照')
    expect(hoverCard.text()).toContain('KSING: 部署 VOD 打分结算服务')

    // Second row: thunder-opensi (working spinner, count omitted when only 1 terminal).
    expect(rows[1]!.find('[data-testid="herdr-project-open"]').text()).toContain('thunder-opensi')
    expect(rows[1]!.find('[data-testid="tx-spinner"]').exists()).toBe(true)
    expect(rows[1]!.find('[data-testid="herdr-project-count"]').exists()).toBe(false)
  })

  it('opens all project terminals into that project top tab strip and exposes project actions in the three-dot menu', async () => {
    liveSessionsRef.value = [
      makeProjectedSession({
        address: 't85',
        appName: 'zsh',
        displayTitle: 'zsh · thunder-sing-damaged / 1',
        effectiveCwd: '/private/tmp/thunder-sing-damaged',
        labels: { 'herdr.space': 'sp-sing', where: 'thunder-sing-damaged / 1' },
        status: { state: 'idle' },
        createdMs: 100
      }),
      makeProjectedSession({
        address: 't96',
        appName: 'omp',
        displayTitle: 'KSING: VOD',
        effectiveCwd: '/private/tmp/thunder-sing-damaged',
        labels: { 'herdr.space': 'sp-sing', where: 'thunder-sing-damaged / 2' },
        status: { state: 'working', app: 'omp' },
        createdMs: 200
      })
    ]

    const wrapper = mount(ShellHerdrSpace)
    const projectRow = wrapper.find('[data-testid="herdr-project-row"]')

    // Clicking the project row opens the working primary terminal and loads ALL project terminals as top tabs.
    await projectRow.find('[data-testid="herdr-project-open"]').trigger('click')
    expect(mocks.routerPush).toHaveBeenCalledWith('/home/herdr/t96')
    expect(getSpaceTabs(herdrProjectSpaceKey('hs:sp-sing')).map((t) => t.id)).toEqual([
      herdrTabId('t85'),
      herdrTabId('t96')
    ])

    // Project row highlights active whenever any of its terminals is open.
    routePathRef.value = '/home/herdr/t96'
    await flushPromises()
    expect(projectRow.classes()).toContain('is-active')

    // Three-dot menu: new terminal inside this project forwards cwd + herdr.space labels.
    await projectRow.find('[data-testid="herdr-menu-new-terminal"]').trigger('click')
    await flushPromises()
    expect(mocks.startSession).toHaveBeenCalledWith({
      cwd: '/private/tmp/thunder-sing-damaged',
      labels: {
        'herdr.space': 'sp-sing',
        where: 'thunder-sing-damaged / 3'
      }
    })
    expect(mocks.routerPush).toHaveBeenCalledWith('/home/herdr/t9')

    // Three-dot menu: switch terminal submenu jumps directly to t85.
    mocks.routerPush.mockClear()
    const terminalItems = projectRow.findAll('[data-testid="herdr-menu-terminal-item"]')
    expect(terminalItems).toHaveLength(2)
    await terminalItems[0]!.trigger('click')
    expect(mocks.routerPush).toHaveBeenCalledWith('/home/herdr/t85')

    // Three-dot menu: quick send modal submits runtime.send on target terminal.
    await projectRow.find('[data-testid="herdr-menu-quick-send"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="herdr-card-send-input"]').setValue('continue please')
    await wrapper.find('[data-testid="herdr-card-send-form"]').trigger('submit')
    await flushPromises()
    expect(mocks.send).toHaveBeenCalledWith('t96', 'continue please')

    // Three-dot menu: interrupt targets the working terminal.
    await projectRow.find('[data-testid="herdr-menu-interrupt"]').trigger('click')
    expect(mocks.interrupt).toHaveBeenCalledWith('t96')

    // Three-dot menu: open in bottom terminal.
    await projectRow.find('[data-testid="herdr-menu-attach"]').trigger('click')
    expect(mocks.openTerminalTab).toHaveBeenCalledWith('t96', { openDrawer: true })

    // Three-dot menu: project info modal lists path and terminals.
    await projectRow.find('[data-testid="herdr-menu-info"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="herdr-project-info-modal"]').text()).toContain(
      '/private/tmp/thunder-sing-damaged'
    )

    // Three-dot menu: kill asks confirmation first.
    await projectRow.find('[data-testid="herdr-menu-kill"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="herdr-kill-dialog"]').exists()).toBe(true)
    await wrapper.find('.dialog-btn-error').trigger('click')
    await flushPromises()
    expect(mocks.kill).toHaveBeenCalledWith('t96')

    // Collapsing Herdr Space hides project rows cleanly.
    const toggleBtn = wrapper.find('[data-testid="herdr-section-toggle"]')
    await toggleBtn.trigger('click')
    expect(toggleBtn.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('[data-testid="herdr-project-row"]').exists()).toBe(false)
  })

  it('renders compact rail badge with grouped project preview when collapsed', async () => {
    collapsedRef.value = true
    liveSessionsRef.value = []
    const wrapper = mount(ShellHerdrSpace)
    expect(wrapper.find('[data-testid="herdr-rail-badge"]').exists()).toBe(false)

    liveSessionsRef.value = [
      makeProjectedSession({
        address: 't5',
        displayTitle: 'claude · deploy',
        labels: { 'herdr.space': 'sp-deploy', where: 'deploy-app / 1' },
        status: { state: 'blocked', kind: 'auth' }
      })
    ]
    await flushPromises()

    const railBtn = wrapper.find('[data-testid="herdr-rail-badge"]')
    expect(railBtn.exists()).toBe(true)
    expect(railBtn.find('[data-testid="herdr-rail-blocked-dot"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="herdr-rail-popover"]').text()).toContain('deploy-app')

    await railBtn.trigger('click')
    expect(mocks.routerPush).toHaveBeenCalledWith('/home/herdr/t5')
  })

  it('prefers the active working terminal for interrupt and exposes an explicit picker when multiple non-active terminals are working', async () => {
    liveSessionsRef.value = [
      makeProjectedSession({
        address: 't1',
        displayTitle: 'codex · api / 1',
        labels: { 'herdr.space': 'sp-api', where: 'api / 1' },
        status: { state: 'working', app: 'codex' },
        createdMs: 100
      }),
      makeProjectedSession({
        address: 't2',
        displayTitle: 'claude · api / 2',
        labels: { 'herdr.space': 'sp-api', where: 'api / 2' },
        status: { state: 'working', app: 'claude' },
        createdMs: 200
      })
    ]

    const wrapper = mount(ShellHerdrSpace)
    const projectRow = wrapper.find('[data-testid="herdr-project-row"]')

    // Neither working terminal is active -> shows explicit submenu instead of guessing t1.
    expect(projectRow.find('[data-testid="herdr-menu-interrupt"]').exists()).toBe(false)
    const interruptItems = projectRow.findAll('[data-testid="herdr-menu-interrupt-item"]')
    expect(interruptItems).toHaveLength(2)
    await interruptItems[1]!.trigger('click')
    expect(mocks.interrupt).toHaveBeenCalledWith('t2')

    // When t2 is the active route terminal, direct interrupt targets t2 unambiguously.
    mocks.interrupt.mockClear()
    routePathRef.value = '/home/herdr/t2'
    await flushPromises()
    expect(projectRow.find('[data-testid="herdr-menu-interrupt-submenu"]').exists()).toBe(false)
    await projectRow.find('[data-testid="herdr-menu-interrupt"]').trigger('click')
    expect(mocks.interrupt).toHaveBeenCalledWith('t2')
  })
})
