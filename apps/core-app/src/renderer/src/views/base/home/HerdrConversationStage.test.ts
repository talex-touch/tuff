// @vitest-environment jsdom

import type { HerdrProjectedConversation } from '@talex-touch/utils/transport/sdk/domains/herdr'
import type { HerdrProjectedSession } from '~/modules/herdr/useHerdrRuntime'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, onMounted, reactive, ref } from 'vue'

enableAutoUnmount(afterEach)

const mocks = vi.hoisted(() => ({
  watchProjection: vi.fn(async () => null),
  unwatchProjection: vi.fn(async () => {}),
  refreshProjection: vi.fn(async () => null),
  send: vi.fn(async () => ({ turn: 2, status: 'working', started: true })),
  put: vi.fn(async () => ({ path: '/tmp/herdr-uploads/spec.txt', bytes: 11 })),
  interrupt: vi.fn(async () => ({ terminal: 't1', action: 'interrupt', outcome: 'stopped' })),
  kill: vi.fn(async () => ({ terminal: 't1', action: 'kill' })),
  attach: vi.fn(),
  detachHandle: vi.fn(async () => {}),
  writeHandle: vi.fn(async () => {}),
  resizeHandle: vi.fn(async () => {}),
  focusHandle: vi.fn(async () => {}),
  routerPush: vi.fn(async () => {}),
  runTerminalCommand: vi.fn(),
  lastSpaceKeyRef: null as null | { value: string }
}))

const routeState = reactive({
  path: '/home/herdr/t1',
  params: { address: 't1' as string }
})

const sessionsRef = ref<HerdrProjectedSession[]>([])
const loadingRef = ref(false)
const projectionsMap = reactive<Record<string, HerdrProjectedConversation>>({})
const projectionLoadingMap = reactive<Record<string, boolean>>({})
const projectionErrorMap = reactive<Record<string, string | null>>({})
const drawerTabsRef = ref<
  Array<{ id: string; kind: 'herdr' | 'local'; address?: string; viewMode?: string }>
>([])

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: ref('zh-CN') })
}))

vi.mock('vue-router', () => ({
  useRoute: () => routeState,
  useRouter: () => ({ push: mocks.routerPush })
}))

vi.mock('vue-sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn()
  }
}))

import { groupHerdrSessions } from '~/modules/herdr/herdr-project-groups'

vi.mock('~/modules/herdr/useHerdrRuntime', () => ({
  useHerdrRuntime: () => {
    const liveGroups = computed(() =>
      groupHerdrSessions(sessionsRef.value.filter((s) => s.state === 'live'))
    )
    return {
      loading: loadingRef,
      sessionByAddress: computed(() => {
        const map = new Map<string, HerdrProjectedSession>()
        for (const s of sessionsRef.value) map.set(s.address, s)
        return map
      }),
      projectGroupByAddress: computed(() => {
        const map = new Map()
        for (const group of liveGroups.value) {
          for (const s of group.sessions) map.set(s.address, group)
        }
        return map
      }),
      projectionsByAddress: projectionsMap,
      projectionLoadingByAddress: projectionLoadingMap,
      projectionErrorByAddress: projectionErrorMap,
      drawerTabs: drawerTabsRef,
      watchProjection: mocks.watchProjection,
      unwatchProjection: mocks.unwatchProjection,
      refreshProjection: mocks.refreshProjection,
      send: mocks.send,
      put: mocks.put,
      interrupt: mocks.interrupt,
      kill: mocks.kill,
      attach: mocks.attach
    }
  }
}))

vi.mock('~/modules/layout/useShellTerminal', () => ({
  useShellTerminal: () => ({
    terminalOpen: ref(false),
    toggleTerminal: vi.fn(),
    runCommand: mocks.runTerminalCommand
  })
}))

vi.mock('~/modules/layout/useShellRightSidebar', () => ({
  useShellRightSidebar: () => ({
    dockHost: ref(null),
    syncDockState: vi.fn(),
    resetDockState: vi.fn()
  })
}))

vi.mock('~/modules/platform/accessibility-support', () => ({
  useAccessibilitySupport: () => ref(false)
}))

vi.mock('~/modules/storage/app-storage', () => ({
  appSetting: {
    localAiCli: { terminalFontFamily: '' },
    voiceInput: { language: 'zh-CN' },
    betaFeatures: { herdrRuntime: true, browserWorkspace: false }
  }
}))

vi.mock('./composables/useHomePreviewPanels', () => ({
  useHomePreviewPanels: (options?: { spaceKey?: { value: string } }) => {
    mocks.lastSpaceKeyRef = options?.spaceKey ?? null
    return {
      panelOpen: ref(false),
      panelWidth: ref(460),
      isResizing: ref(false),
      tabs: ref([]),
      activeTabId: ref(null),
      openLauncher: vi.fn(),
      openFileInSidebar: vi.fn(),
      openWebInSidebar: vi.fn(),
      openBlankWebTab: vi.fn(),
      openWorkspaceTool: vi.fn(),
      updateWebTab: vi.fn(),
      updateFileTab: vi.fn(),
      selectTab: vi.fn(),
      closeTab: vi.fn(),
      closeOtherTabs: vi.fn(),
      closeAllTabs: vi.fn(),
      startResize: vi.fn(),
      resetWidth: vi.fn(),
      effectiveWorkspaceRoot: ref('/tmp/workspace'),
      showCodePreview: vi.fn(),
      openWebInBuiltInBrowser: vi.fn(),
      openFileInBuiltInBrowser: vi.fn(),
      openWebExternal: vi.fn(),
      pickAndOpenFileInSidebar: vi.fn()
    }
  }
}))

vi.mock('./composables/useHomeDictation', () => ({
  VOICE_DRAFT_ID: '__voice_draft__',
  useHomeDictation: (options: { messages: { value: unknown[] } }) => ({
    dictation: {
      state: ref('idle'),
      active: ref(false),
      captureBlocked: ref(false),
      elapsedMs: ref(0),
      outcome: ref(null),
      levels: ref([]),
      clip: ref(null),
      toggle: vi.fn(),
      stop: vi.fn(async () => {}),
      cancel: vi.fn(async () => {}),
      recognizeClip: vi.fn(),
      dismissClip: vi.fn()
    },
    streamItems: computed(() => options.messages.value),
    voiceSendBlocked: ref(false)
  })
}))

vi.mock('./composables/useReadAloud', () => ({
  useReadAloud: () => ({
    toggleSpeak: vi.fn(),
    speakStateOf: () => 'idle'
  })
}))

vi.mock('@talex-touch/tuffex/terminal', () => ({
  TxTerminal: defineComponent({
    name: 'TxTerminal',
    emits: ['ready', 'data', 'resize'],
    setup(_props, { emit }) {
      onMounted(() => {
        emit('ready', {
          write: vi.fn(async () => {}),
          fit: vi.fn(),
          focus: vi.fn(),
          getSize: () => ({ cols: 100, rows: 30 }),
          getCellSizePixels: () => ({ width: 9, height: 18 })
        })
      })
      return {}
    },
    template: '<div class="tx-terminal-stub" data-testid="tx-terminal-stub" />'
  })
}))

vi.mock('@talex-touch/tuffex/button', () => ({
  TxButton: {
    name: 'TxButton',
    emits: ['click'],
    template: '<button type="button" @click="$emit(\'click\', $event)"><slot /></button>'
  }
}))

vi.mock('@talex-touch/tuffex/status-hint', () => ({
  TxStatusHint: {
    name: 'TxStatusHint',
    props: ['text', 'tone', 'size', 'pulseKey'],
    template:
      '<div class="tx-status-hint-stub" :data-tone="tone" :data-size="size"><slot name="icon" /><span>{{ text }}</span></div>'
  }
}))

import {
  __resetHerdrStageControlForTesting,
  useHerdrStageControl
} from '~/modules/herdr/useHerdrStageControl'
import HerdrConversationStage from './HerdrConversationStage.vue'

function makeSession(overrides: Partial<HerdrProjectedSession> = {}): HerdrProjectedSession {
  return {
    address: 't1',
    machine: null,
    name: 'claude-dev',
    title: 'Claude Code',
    argv: ['claude'],
    cwd: '/tmp/workspace',
    foregroundName: 'claude',
    foregroundCwd: '/tmp/workspace',
    foregroundPid: 101,
    state: 'live',
    status: { state: 'idle', app: 'claude' },
    statusMs: 1_700_000_000_000,
    reported: true,
    turn: 1,
    keep: false,
    template: null,
    parent: null,
    labels: {},
    cols: 100,
    rows: 30,
    pid: 101,
    exitCode: null,
    signal: null,
    reason: null,
    screen: 'exact',
    createdMs: 1_700_000_000_000,
    finishedMs: null,
    projectId: 'p1',
    projectName: 'talex-touch',
    displayTitle: 'Claude Code',
    appName: 'claude',
    locationLabel: 'talex-touch',
    effectiveCwd: '/tmp/workspace',
    ...overrides
  }
}

const COMPONENT_STUBS = {
  HomeTopBar: {
    name: 'HomeTopBar',
    props: ['title', 'projectName', 'messageCount'],
    template:
      '<header data-testid="home-top-bar"><span>{{ title }}</span><slot name="left-extra" /><slot name="actions-lead" /></header>'
  },
  HomeStageBlurs: true,
  HomePayloadModal: true,
  HomeSidePanelSlot: true,
  HomeRunDock: {
    name: 'HomeRunDock',
    props: ['streaming', 'step'],
    template: '<div data-testid="home-run-dock">{{ step.kind }}</div>'
  },
  HomeConversationStream: {
    name: 'HomeConversationStream',
    props: ['messages', 'isStreaming'],
    template:
      '<div data-testid="home-conversation-stream"><div v-for="m in messages" :key="m.id" data-testid="stream-msg">{{ m.role }}:{{ m.content }}</div></div>'
  },
  TuffAIComposer: {
    name: 'TuffAIComposer',
    props: [
      'draft',
      'attachments',
      'hidePermissionMenu',
      'readonlyModel',
      'model',
      'sendState',
      'inputDisabled'
    ],
    emits: ['update:draft', 'files', 'send', 'stop'],
    methods: {
      launch: vi.fn(),
      focus: vi.fn()
    },
    template: `
      <div
        data-testid="tuff-ai-composer-stub"
        :data-hide-permission="String(hidePermissionMenu)"
        :data-readonly-model="String(readonlyModel)"
        :data-model-label="model?.label"
      >
        <textarea
          data-testid="composer-input"
          :value="draft"
          :disabled="inputDisabled"
          @input="$emit('update:draft', $event.target.value)"
        />
        <button type="button" data-testid="composer-send" @click="$emit('send')">send</button>
        <button type="button" data-testid="composer-stop" @click="$emit('stop')">stop</button>
      </div>
    `
  }
}

describe('HerdrConversationStage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetHerdrStageControlForTesting()
    routeState.path = '/home/herdr/t1'
    routeState.params.address = 't1'
    loadingRef.value = false
    sessionsRef.value = [makeSession()]
    drawerTabsRef.value = []
    for (const key of Object.keys(projectionsMap)) delete projectionsMap[key]
    for (const key of Object.keys(projectionLoadingMap)) delete projectionLoadingMap[key]
    for (const key of Object.keys(projectionErrorMap)) delete projectionErrorMap[key]

    mocks.attach.mockResolvedValue({
      streamId: 'stream-1',
      write: mocks.writeHandle,
      resize: mocks.resizeHandle,
      focus: mocks.focusHandle,
      detach: mocks.detachHandle
    })
  })

  it('renders unified Home AI chat stream with read-only composer and stages attachments via herdr.put', async () => {
    projectionsMap.t1 = {
      address: 't1',
      provider: 'claude',
      nativeSessionId: 'c1',
      filePath: '/tmp/c1.jsonl',
      available: true,
      truncated: false,
      updatedAt: 1_700_000_005_000,
      messages: [
        { id: 'u1', role: 'user', text: 'Run tests', timestamp: 1_700_000_001_000 },
        { id: 'a1', role: 'assistant', text: 'All green.', timestamp: 1_700_000_002_000 }
      ]
    }

    const wrapper = mount(HerdrConversationStage, {
      global: { stubs: COMPONENT_STUBS }
    })
    await flushPromises()

    expect(mocks.watchProjection).toHaveBeenCalledWith('t1')
    expect(wrapper.findAll('[data-testid="stream-msg"]')).toHaveLength(2)

    const composer = wrapper.get('[data-testid="tuff-ai-composer-stub"]')
    expect(composer.attributes('data-hide-permission')).toBe('true')
    expect(composer.attributes('data-readonly-model')).toBe('true')
    expect(composer.attributes('data-model-label')).toBe('Claude Code')

    // Stage a file via herdr.put and send draft together.
    const file = new File(['hello herdr'], 'spec.txt', { type: 'text/plain' })
    wrapper.findComponent({ name: 'TuffAIComposer' }).vm.$emit('files', [file])
    await vi.waitFor(() => {
      expect(mocks.put).toHaveBeenCalledWith('t1', 'spec.txt', btoa('hello herdr'))
    })
    await flushPromises()

    await wrapper.get('[data-testid="composer-input"]').setValue('Check this file')
    await wrapper.get('[data-testid="composer-send"]').trigger('click')
    await flushPromises()

    expect(mocks.send).toHaveBeenCalledWith('t1', 'Check this file\n\n/tmp/herdr-uploads/spec.txt')
  })

  it('switches in-place between AI Chat and Raw Terminal, attaching and cleanly detaching TxTerminal', async () => {
    projectionsMap.t1 = {
      address: 't1',
      provider: 'claude',
      nativeSessionId: 'c1',
      filePath: '/tmp/c1.jsonl',
      available: true,
      truncated: false,
      updatedAt: 1_700_000_005_000,
      messages: [{ id: 'u1', role: 'user', text: 'Hi', timestamp: 1_700_000_001_000 }]
    }

    const wrapper = mount(HerdrConversationStage, {
      global: { stubs: COMPONENT_STUBS }
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="home-conversation-stream"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="herdr-stage-terminal-pane"]').exists()).toBe(false)

    const stageControl = useHerdrStageControl()
    stageControl.setSelectedMode('t1', 'terminal')
    await flushPromises()

    expect(wrapper.find('[data-testid="herdr-stage-terminal-pane"]').exists()).toBe(true)
    expect(mocks.attach).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ cols: 100, rows: 30, history: 2000 })
    )

    // Switching back to AI Chat detaches stage stream without killing the background process.
    stageControl.setSelectedMode('t1', 'chat')
    await flushPromises()
    expect(mocks.detachHandle).toHaveBeenCalledTimes(1)
    expect(mocks.kill).not.toHaveBeenCalled()
  })

  it('auto-falls back to terminal view for non-JSONL remote/shell sessions and surfaces blocked takeover banner', async () => {
    routeState.path = '/home/herdr/vps%2Ft2'
    routeState.params.address = 'vps%2Ft2'
    sessionsRef.value = [
      makeSession({
        address: 'vps/t2',
        machine: 'vps',
        displayTitle: 'zsh @ vps',
        appName: 'zsh'
      })
    ]
    projectionsMap['vps/t2'] = {
      address: 'vps/t2',
      provider: null,
      nativeSessionId: null,
      filePath: null,
      available: false,
      truncated: false,
      updatedAt: 1_700_000_005_000,
      messages: []
    }

    const wrapper = mount(HerdrConversationStage, {
      global: { stubs: COMPONENT_STUBS }
    })
    await flushPromises()

    expect(mocks.watchProjection).toHaveBeenCalledWith('vps/t2')
    expect(wrapper.find('[data-testid="herdr-stage-terminal-pane"]').exists()).toBe(true)

    // Blocked session in chat mode renders takeover banner with one-click switch to terminal.
    routeState.path = '/home/herdr/t1'
    routeState.params.address = 't1'
    sessionsRef.value = [
      makeSession({
        address: 't1',
        status: { state: 'blocked', kind: 'permission', msg: 'Approve rm -rf dist?' }
      })
    ]
    projectionsMap.t1 = {
      address: 't1',
      provider: 'claude',
      nativeSessionId: 'c1',
      filePath: '/tmp/c1.jsonl',
      available: true,
      truncated: false,
      updatedAt: 1_700_000_005_000,
      messages: [{ id: 'u1', role: 'user', text: 'Clean dist', timestamp: 1_700_000_001_000 }]
    }
    await flushPromises()

    const banner = wrapper.find('[data-testid="herdr-stage-blocked-banner"]')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('Approve rm -rf dist?')

    await wrapper.get('[data-testid="herdr-stage-blocked-takeover"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="herdr-stage-terminal-pane"]').exists()).toBe(true)
  })

  it('places TxStatusHint at the far left of the compact bottom statusbar and omits the redundant topbar', async () => {
    sessionsRef.value = [
      makeSession({
        address: 't1',
        displayTitle: 'zsh',
        appName: 'zsh',
        status: { state: 'done', app: 'zsh' }
      })
    ]
    projectionsMap.t1 = {
      address: 't1',
      provider: null,
      nativeSessionId: null,
      filePath: null,
      available: false,
      truncated: false,
      updatedAt: 1_700_000_005_000,
      messages: []
    }

    const wrapper = mount(HerdrConversationStage, {
      global: { stubs: COMPONENT_STUBS }
    })
    await flushPromises()

    // Redundant HomeTopBar is removed; controls live in the BrowserTabStrip tab context menu.
    expect(wrapper.find('[data-testid="home-top-bar"]').exists()).toBe(false)

    const statusBar = wrapper.get('[data-testid="herdr-stage-statusbar"]')
    const leftGroup = statusBar.get('.HerdrStage-StatusBarGroup')
    const firstChild = leftGroup.element.firstElementChild as HTMLElement | null
    expect(firstChild?.getAttribute('data-testid')).toBe('herdr-stage-status')
    expect(firstChild?.getAttribute('data-tone')).toBe('success')
    expect(statusBar.get('[data-testid="herdr-stage-title"]').text()).toContain('zsh')
    expect(statusBar.find('[data-testid="herdr-stage-auto-hint"]').exists()).toBe(true)

    // Active stage handle is registered for BrowserTabStrip's right-click menu actions
    // and top-right sidebar toggle.
    const handle = useHerdrStageControl().activeHandle.value
    expect(handle?.address).toBe('t1')
    expect(handle?.getViewMode()).toBe('terminal')
    await handle?.interrupt()
    expect(mocks.interrupt).toHaveBeenCalledWith('t1')

    const { useShellStageActions } = await import('~/modules/layout/useShellStageActions')
    const stageActions = useShellStageActions().activeHandle.value
    expect(stageActions?.surface).toBe('herdr')
    expect(stageActions?.showTurnInfo?.()).toBe(false)
    expect(stageActions?.isPanelOpen()).toBe(false)
    stageActions?.togglePanel()
    expect(stageActions?.isPanelOpen()).toBe(true)
  })

  it('retains a session project Space after finishing and scopes composer draft per session address', async () => {
    sessionsRef.value = [
      makeSession({
        address: 't1',
        labels: { 'herdr.space': 'sp-alpha', where: 'alpha / 1' }
      }),
      makeSession({
        address: 't2',
        labels: { 'herdr.space': 'sp-alpha', where: 'alpha / 2' }
      })
    ]
    projectionsMap.t1 = {
      address: 't1',
      provider: 'claude',
      nativeSessionId: 'c1',
      filePath: '/tmp/c1.jsonl',
      available: true,
      truncated: false,
      updatedAt: 1_700_000_005_000,
      messages: [{ id: 'u1', role: 'user', text: 'Hi', timestamp: 1_700_000_001_000 }]
    }
    projectionsMap.t2 = {
      ...projectionsMap.t1,
      address: 't2'
    }

    const wrapper = mount(HerdrConversationStage, {
      global: { stubs: COMPONENT_STUBS }
    })
    await flushPromises()

    // Live session resolves to its project Space key.
    expect(mocks.lastSpaceKeyRef?.value).toBe('space:herdr:hs:sp-alpha')

    // Draft typed on t1 never leaks when switching to t2, and is restored upon returning to t1.
    await wrapper.get('[data-testid="composer-input"]').setValue('Draft only for t1')
    routeState.path = '/home/herdr/t2'
    routeState.params.address = 't2'
    await flushPromises()
    expect(
      (wrapper.get('[data-testid="composer-input"]').element as HTMLTextAreaElement).value
    ).toBe('')

    routeState.path = '/home/herdr/t1'
    routeState.params.address = 't1'
    await flushPromises()
    expect(
      (wrapper.get('[data-testid="composer-input"]').element as HTMLTextAreaElement).value
    ).toBe('Draft only for t1')

    // When t1 finishes and leaves live project groups, its open stage keeps its project Space.
    sessionsRef.value = [
      makeSession({
        address: 't1',
        state: 'finished',
        labels: { 'herdr.space': 'sp-alpha', where: 'alpha / 1' }
      })
    ]
    await flushPromises()
    expect(mocks.lastSpaceKeyRef?.value).toBe('space:herdr:hs:sp-alpha')
  })
})
