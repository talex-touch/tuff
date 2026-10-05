// @vitest-environment jsdom
import type { AiAttachment } from '@talex-touch/tuffex/ai-elements'
import type { PropType, SetupContext } from 'vue'
import type { ConversationMessage } from '~/modules/conversation/useHomeConversation'
import type {
  ConversationWorkspaceState,
  WorkspaceSubmitRequest,
  WorkspaceSubmitResult
} from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import type { ConversationDetail } from '@talex-touch/utils/transport/sdk/domains/conversation'
import { AgentWorkspaceEvents } from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import { ConversationEvents } from '@talex-touch/utils/transport/sdk/domains/conversation'
import { AgentToolEvents } from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import { voiceApiEvents } from '@talex-touch/utils/transport/sdk/domains/voice'
import type { Pinia } from 'pinia'
import {
  CONVERSATION_TITLE_MAX_CODEPOINTS,
  createWorkingConversationTitle
} from '~/modules/conversation/conversation-title'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, disposePinia } from 'pinia'
import { h, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
interface HostTransport {
  send: (event: unknown, payload: unknown) => Promise<unknown>
  on: (event: unknown, listener: (payload: unknown) => void) => () => void
}
interface MainHost {
  transport: HostTransport
  states: Map<string, ConversationWorkspaceState>
  records: Map<string, ConversationDetail>
  pending: Array<{
    request: WorkspaceSubmitRequest
    reply: PromiseWithResolvers<WorkspaceSubmitResult>
  }>
  reads: Map<string, PromiseWithResolvers<ConversationDetail | null>>
  detail: (id: string) => ConversationDetail | null
  accept: (
    index: number,
    disposition?: WorkspaceSubmitResult['disposition']
  ) => ConversationWorkspaceState
}

/** Only host/storage and paint boundaries are replaced. HomePage, its watches, router, Pinia,
 * workspace adapter, history SDK, title helpers and attachment handling execute unmodified. */
const boundary = vi.hoisted(() => ({
  transport: null as HostTransport | null,
  settings: {} as Record<string, unknown>
}))
vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => {
    if (!boundary.transport) throw new Error('Missing test host')
    return boundary.transport
  }
}))
vi.mock('@talex-touch/utils/renderer', () => ({
  useIntelligenceSdk: () => ({
    getProviderModelOptions: async () => [],
    text: {
      chat: async () => {
        throw new Error('Unexpected model call')
      }
    }
  })
}))
vi.mock('~/modules/storage/app-storage', async () => {
  // Mock factories run before static imports; Vue must load inside this isolated boundary factory.
  const { reactive } = await import('vue')
  return {
    appSetting: reactive(boundary.settings),
    appSettingStore: { isHydrated: () => true, whenHydrated: async () => undefined }
  }
})
vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: () => ({ error: () => {}, warn: () => {}, info: () => {}, debug: () => {} })
}))
vi.mock('~/modules/platform/renderer-platform', () => ({
  getCurrentRendererPlatformState: () => ({
    platform: 'darwin',
    isMac: true,
    isWindows: false,
    isLinux: false
  })
}))
vi.mock('~/modules/shortcuts/main-window-shortcuts', () => ({
  registerMainWindowCommandHandlers: () => () => {}
}))

const Paint = {
  setup:
    (_: Record<string, unknown>, { slots }: SetupContext) =>
    () =>
      h('div', slots.default?.())
}
const ToolbarPaint = {
  setup(_: Record<string, unknown>, { slots, expose }: SetupContext) {
    expose({ launch: () => {} })
    return () => h('div', slots.mode?.())
  }
}
const TextPaint = {
  props: { content: String },
  setup: (props: { content?: string }) => () => h('span', props.content)
}
const AttachmentPaint = {
  props: { attachments: { type: Array as PropType<AiAttachment[]>, required: true } },
  setup: (props: { attachments: AiAttachment[] }) => () =>
    h(
      'div',
      props.attachments.map((item) => h('span', item.name))
    )
}
const StreamPaint = {
  props: { items: { type: Array as PropType<ConversationMessage[]>, required: true } },
  setup(props: { items: ConversationMessage[] }, { slots, expose }: SetupContext) {
    expose({ scrollToBottom: () => {}, scrollToIndex: () => {}, tweenToBottom: async () => {} })
    return () =>
      h(
        'div',
        { class: 'tx-conversation-stream__scroller' },
        props.items.map((item, index) => slots.item?.({ item, index }))
      )
  }
}
vi.mock('@talex-touch/tuffex/attachment-tray', () => ({ TxAttachmentTray: AttachmentPaint }))
vi.mock('@talex-touch/tuffex/border-beam', () => ({ TxBorderBeam: Paint }))
vi.mock('@talex-touch/tuffex/chain-of-thought', () => ({ TxChainOfThought: Paint }))
vi.mock('@talex-touch/tuffex/choice-card', () => ({ TxChoiceCard: Paint }))
vi.mock('@talex-touch/tuffex/message-actions', () => ({ TxMessageActions: Paint }))
vi.mock('@talex-touch/tuffex/modal', () => ({ TxModal: Paint }))
vi.mock('@talex-touch/tuffex/skeleton', async () => {
  // Mock factories run before static imports; this paint-only ref must come from the active Vue module.
  const { ref } = await import('vue')
  return { TxSkeleton: Paint, useDeferredLoading: () => ref(false) }
})
vi.mock('@talex-touch/tuffex/thinking-orb', () => ({ TxThinkingOrb: Paint }))
vi.mock('@talex-touch/tuffex/conversation-stream', () => ({ TxConversationStream: StreamPaint }))
vi.mock('@talex-touch/tuffex/stream-markdown', () => ({
  TxCodeBlock: Paint,
  TxStreamMarkdown: TextPaint,
  resetRemoteImagePolicy: () => {}
}))
vi.mock('@talex-touch/tuffex/tool-call-card', () => ({ TxToolCallCard: Paint }))
vi.mock('@talex-touch/tuffex/tool-confirmation', () => ({ TxToolConfirmation: Paint }))
vi.mock('~/components/icon/AppLogo.vue', () => ({ default: Paint }))
vi.mock('~/components/intelligence/ToolChartCard.vue', () => ({ default: Paint }))
vi.mock('~/components/intelligence/ToolWidgetCard.vue', () => ({ default: Paint }))
vi.mock('~/components/intelligence/ToolFormCard.vue', () => ({ default: Paint }))
vi.mock('./composer/ComposerToolbar.vue', () => ({ default: ToolbarPaint }))
vi.mock('./HomeTopBar.vue', () => ({ default: Paint }))
vi.mock('./HomeSidePanel.vue', () => ({ default: Paint }))
vi.mock('./workspace/HomeRunApproval.vue', () => ({ default: Paint }))
vi.mock('./workspace/HomeWorkspaceModeMenu.vue', () => ({ default: Paint }))
vi.mock('./workspace/HomeWorkspaceQueue.vue', () => ({ default: Paint }))

function state(
  id: string,
  status: ConversationWorkspaceState['status'] = 'idle'
): ConversationWorkspaceState {
  return {
    conversationId: id,
    projectId: `project-${id}`,
    settings: { mode: 'chat', reasoningEffort: 'low', autoContext: false },
    status,
    ...(status === 'running' ? { activeTurnId: `${id}-turn` } : {}),
    queueHeld: false,
    queue: [],
    messages: [
      {
        id: `${id}-user`,
        role: 'user',
        content: `${id} saved question`,
        status: 'complete',
        seq: 0,
        createdAt: 1
      }
    ],
    revision: 1,
    updatedAt: 1
  }
}

/** Hand-written Main boundary: holds durable transcripts and deferred receipts, not Vue state. */
function host(initial: ConversationWorkspaceState[] = []): MainHost {
  const states = new Map(initial.map((value) => [value.conversationId, value]))
  const records = new Map<string, ConversationDetail>(
    initial.map((value) => [
      value.conversationId,
      {
        id: value.conversationId,
        title: `${value.conversationId} saved title`,
        projectId: value.projectId,
        messages: value.messages,
        createdAt: 1,
        updatedAt: 1
      }
    ])
  )
  const pending: MainHost['pending'] = []
  const listeners = new Map<unknown, Set<(payload: unknown) => void>>()
  const reads: MainHost['reads'] = new Map()
  function detail(id: string): ConversationDetail | null {
    return records.get(id) ?? null
  }
  const transport: HostTransport = {
    async send(event: unknown, payload: unknown): Promise<unknown> {
      const name = String(event)
      if (name === String(AgentWorkspaceEvents.get)) {
        if (
          !payload ||
          typeof payload !== 'object' ||
          !('conversationId' in payload) ||
          typeof payload.conversationId !== 'string'
        )
          throw new Error('Invalid workspace get request')
        return states.get(payload.conversationId) ?? null
      }
      if (name === String(ConversationEvents.get)) {
        if (
          !payload ||
          typeof payload !== 'object' ||
          !('id' in payload) ||
          typeof payload.id !== 'string'
        )
          throw new Error('Invalid history get request')
        const id = payload.id
        return reads.get(id)?.promise ?? detail(id)
      }
      if (name === String(ConversationEvents.list))
        return [...records.values()].map(({ messages: _messages, ...record }) => record)
      if (name === String(AgentWorkspaceEvents.submit)) {
        // The real typed workspace SDK produced this in-process value; unknown is the generic fake dispatch boundary.
        const request = structuredClone(payload) as WorkspaceSubmitRequest
        // Main's existing UTF-16 ceiling: a page sending a raw long title must really reject.
        if (request.create && request.create.title.length > 512)
          throw new Error('create.title exceeds Main limit')
        const reply = Promise.withResolvers<WorkspaceSubmitResult>()
        pending.push({ request, reply })
        return reply.promise
      }
      if (name === String(AgentToolEvents.setConfirmationSurface)) return payload
      if (name === String(voiceApiEvents.getRecognitionStatus))
        return { ok: true, data: { available: false } }
      throw new Error(`Unexpected host request: ${String(event)}`)
    },
    on(event: unknown, listener: (payload: unknown) => void) {
      let callbacks = listeners.get(event)
      if (!callbacks) listeners.set(event, (callbacks = new Set()))
      callbacks.add(listener)
      return () => {
        callbacks.delete(listener)
      }
    }
  }
  function accept(index: number, disposition: WorkspaceSubmitResult['disposition'] = 'started') {
    const { request, reply } = pending[index]!
    const previous = states.get(request.conversationId)
    const next = previous ?? {
      ...state(request.conversationId),
      projectId: request.create!.projectId,
      messages: []
    }
    const accepted: ConversationWorkspaceState = {
      ...next,
      settings: request.settings!,
      revision: next.revision + 1,
      status: 'running',
      activeTurnId: `${request.conversationId}-accepted-turn`,
      ...(disposition === 'queued'
        ? {
            queue: [
              ...next.queue,
              {
                id: request.id,
                conversationId: request.conversationId,
                text: request.text,
                settings: request.settings!,
                projectId: next.projectId,
                createdAt: 2
              }
            ]
          }
        : {
            messages: [
              ...next.messages,
              {
                id: request.id,
                role: 'user',
                content: request.text,
                status: 'complete',
                seq: next.messages.length,
                createdAt: 2
              }
            ]
          })
    }
    states.set(request.conversationId, accepted)
    records.set(request.conversationId, {
      id: request.conversationId,
      title: records.get(request.conversationId)?.title ?? request.create!.title,
      projectId: accepted.projectId,
      messages: accepted.messages,
      createdAt: 1,
      updatedAt: 2
    })
    reply.resolve({ disposition, state: accepted })
    return accepted
  }
  return { transport, states, records, pending, reads, detail, accept }
}

let wrapper: VueWrapper | null = null
let pinia: Pinia | null = null
let main: MainHost

beforeEach(() => {
  vi.resetModules()
  for (const key of Object.keys(boundary.settings)) delete boundary.settings[key]
  Object.assign(boundary.settings, {
    conversation: { reasoningEffort: 'low' },
    tools: { agentToolsMode: 'off', homeRecommendations: false, autoContext: false }
  })
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener: () => {},
    removeEventListener: () => {}
  }))
})
afterEach(async () => {
  const container = wrapper?.element.parentElement
  wrapper?.unmount()
  wrapper = null
  if (container && container !== document.body) container.remove()
  if (pinia) disposePinia(pinia)
  pinia = null
  for (const pending of main?.pending ?? []) pending.reply.reject(new Error('Test host closed'))
  for (const read of main?.reads.values() ?? []) read.resolve(null)
  await flushPromises()
  boundary.transport = null
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
afterAll(() => {
  for (const path of [
    '@talex-touch/utils/transport',
    '@talex-touch/utils/renderer',
    'vue-i18n',
    '~/modules/storage/app-storage',
    '~/utils/renderer-log',
    '~/modules/platform/renderer-platform',
    '~/modules/shortcuts/main-window-shortcuts',
    '@talex-touch/tuffex/attachment-tray',
    '@talex-touch/tuffex/border-beam',
    '@talex-touch/tuffex/chain-of-thought',
    '@talex-touch/tuffex/choice-card',
    '@talex-touch/tuffex/message-actions',
    '@talex-touch/tuffex/modal',
    '@talex-touch/tuffex/skeleton',
    '@talex-touch/tuffex/thinking-orb',
    '@talex-touch/tuffex/conversation-stream',
    '@talex-touch/tuffex/stream-markdown',
    '@talex-touch/tuffex/tool-call-card',
    '@talex-touch/tuffex/tool-confirmation',
    '~/components/icon/AppLogo.vue',
    '~/components/intelligence/ToolChartCard.vue',
    '~/components/intelligence/ToolWidgetCard.vue',
    '~/components/intelligence/ToolFormCard.vue',
    './composer/ComposerToolbar.vue',
    './HomeTopBar.vue',
    './HomeSidePanel.vue',
    './workspace/HomeRunApproval.vue',
    './workspace/HomeWorkspaceModeMenu.vue',
    './workspace/HomeWorkspaceQueue.vue'
  ])
    vi.doUnmock(path)
  vi.resetModules()
})

async function page(initial: ConversationWorkspaceState[] = [], path = '/home') {
  main = host(initial)
  boundary.transport = main.transport
  // History and model options own module-scope mirrors. Re-import after resetModules to isolate
  // actual page subscriptions and state for every mounted consumer scenario.
  const { default: HomePage } = await import('./HomePage.vue')
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/home', component: HomePage },
      { path: '/home/c/:id', component: HomePage }
    ]
  })
  await router.push(path)
  await router.isReady()
  pinia = createPinia()
  wrapper = mount(HomePage, {
    attachTo: document.body,
    global: { plugins: [router, pinia], mocks: { $t: (key: string) => key } }
  })
  await flushPromises()
  // These consumers must read the same fresh modules as the dynamically loaded HomePage.
  const { useProjectStore } = await import('~/stores/projects')
  const { useConversationHistory } = await import('~/modules/conversation/useConversationHistory')
  return {
    router,
    project: useProjectStore(pinia),
    history: useConversationHistory(),
    view: wrapper
  }
}
async function send(view: VueWrapper, text: string) {
  await view.get('textarea').setValue(text)
  await view.get('textarea').trigger('keydown', { key: 'Enter' })
  await flushPromises()
}
async function attach(view: VueWrapper, name: string) {
  const file = new File(['fixture'], name, { type: 'text/plain' })
  await view
    .get('textarea')
    .trigger('paste', { clipboardData: { items: [{ kind: 'file', getAsFile: () => file }] } })
}
function draft(view: VueWrapper): string {
  return (view.get('textarea').element as HTMLTextAreaElement).value
}
function expectTarget(view: VueWrapper, target: string, text: string, attachment: string) {
  expect(
    view.findAll('.HomePage-Message.user .HomePage-UserBubble').map((bubble) => bubble.text())
  ).toEqual([`${target} saved question`])
  expect(draft(view)).toBe(text)
  expect(view.get('.HomePage-ComposerTray').text()).toBe(attachment)
}

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

describe('HomePage submit owns the view in which it was pressed', () => {
  it.each([
    { name: 'long BMP opening', prompt: '整理资料。'.repeat(130) },
    { name: 'long astral opening', prompt: '🧭'.repeat(650) }
  ])(
    '$name reaches Main and history unabridged with a bounded Unicode title',
    async ({ prompt }) => {
      const { view, router } = await page()
      await send(view, prompt)
      expect(main.pending).toHaveLength(1)
      const request = main.pending[0]!.request
      expect(request.text).toBe(prompt)
      expect(request.create!.title).toBe(createWorkingConversationTitle(prompt))
      expect(request.create!.title).toBe(
        `${[...prompt].slice(0, CONVERSATION_TITLE_MAX_CODEPOINTS).join('')}…`
      )
      expect(request.create!.title.length).toBeLessThanOrEqual(512)
      main.accept(0)
      await flushPromises()
      expect(router.currentRoute.value.path).toBe(`/home/c/${request.conversationId}`)
      expect(
        main.detail(request.conversationId)!.messages.map((message) => message.content)
      ).toEqual([prompt])
      expect(view.get('.HomePage-Message.user .HomePage-UserBubble').text()).toBe(prompt)
    }
  )

  it('blank-to-existing rejection cannot clear the selected thread, messages or composer', async () => {
    const { view, router } = await page([state('right')])
    await attach(view, 'origin.txt')
    await send(view, 'origin draft')
    expect(main.pending).toHaveLength(1)
    await router.push('/home/c/right')
    await flushPromises()
    await view.get('textarea').setValue('right draft')
    await attach(view, 'right.txt')
    main.pending[0]!.reply.reject(new Error('WORKSPACE_PROJECT_UNAVAILABLE'))
    await flushPromises()
    expect(router.currentRoute.value.params.id).toBe('right')
    expectTarget(view, 'right', 'right draft', 'right.txt')
    await send(view, 'right draft')
    expect(main.pending[1]!.request.conversationId).toBe('right')
    expect(main.pending[1]!.request).not.toHaveProperty('create')
  })

  it('parent-to-child late rejection never restores the parent input into the empty child composer', async () => {
    const { view, router } = await page([state('parent'), state('child')], '/home/c/parent')
    await attach(view, 'parent.txt')
    await send(view, 'parent follow-up')
    expect(main.pending).toHaveLength(1)
    await router.push('/home/c/child')
    await flushPromises()
    main.pending[0]!.reply.reject(new Error('WORKSPACE_BUSY'))
    await flushPromises()
    expect(router.currentRoute.value.params.id).toBe('child')
    expect(draft(view)).toBe('')
    expect(view.find('.HomePage-ComposerTray').exists()).toBe(false)
    expect(
      view.findAll('.HomePage-Message.user .HomePage-UserBubble').map((bubble) => bubble.text())
    ).toEqual(['child saved question'])
  })

  it('late queue success cannot erase identical text newly typed in the right draft', async () => {
    const { view, router } = await page([state('left', 'running'), state('right')], '/home/c/left')
    await send(view, 'same text')
    expect(main.pending).toHaveLength(1)
    await router.push('/home/c/right')
    await flushPromises()
    await view.get('textarea').setValue('same text')
    await attach(view, 'right.txt')
    main.accept(0, 'queued')
    await flushPromises()
    expect(router.currentRoute.value.params.id).toBe('right')
    expectTarget(view, 'right', 'same text', 'right.txt')
    expect(main.states.get('left')!.queue.map((item) => item.text)).toEqual(['same text'])
  })

  it.each([
    { name: 'new blank conversation', path: '/home', existing: false },
    { name: 'existing conversation', path: '/home/c/origin', existing: true }
  ])(
    '$name rejection restores the original draft and attachments and allows retry',
    async ({ path, existing }) => {
      const { view, router } = await page(existing ? [state('origin')] : [], path)
      await attach(view, 'original.txt')
      await send(view, 'original question')
      expect(main.pending).toHaveLength(1)
      const failedId = main.pending[0]!.request.conversationId
      expect(draft(view)).toBe('')
      main.pending[0]!.reply.reject(new Error('WORKSPACE_PROJECT_UNAVAILABLE'))
      await flushPromises()
      expect(router.currentRoute.value.path).toBe(path)
      expect(draft(view)).toBe('original question')
      expect(view.get('.HomePage-ComposerTray').text()).toBe('original.txt')
      await send(view, 'original question')
      const retried = main.pending[1]!.request
      expect(retried.text).toBe('original question')
      if (existing) {
        expect(retried.conversationId).toBe(failedId)
        expect(retried).not.toHaveProperty('create')
      } else {
        expect(retried.conversationId).not.toBe(failedId)
        expect(retried.create!.projectId).toBeNull()
      }
      main.accept(1)
      await flushPromises()
      expect(
        view.findAll('.HomePage-Message.user .HomePage-UserBubble').map((bubble) => bubble.text())
      ).toEqual(existing ? ['origin saved question', 'original question'] : ['original question'])
    }
  )

  it('late new-thread success refreshes sidebar history but never steals the right route or draft', async () => {
    const { view, router, history } = await page([state('right')])
    await send(view, 'new origin question')
    expect(main.pending).toHaveLength(1)
    const origin = main.pending[0]!.request.conversationId
    await router.push('/home/c/right')
    await flushPromises()
    await view.get('textarea').setValue('right next question')
    await attach(view, 'right.txt')
    main.accept(0)
    await flushPromises()
    expect(router.currentRoute.value.params.id).toBe('right')
    expectTarget(view, 'right', 'right next question', 'right.txt')
    expect(history.conversations.value.find((record) => record.id === origin)).toMatchObject({
      title: 'new origin question',
      updatedAt: 2
    })
  })

  it('navigation invalidates ownership before the target restore awaits and target send is independent', async () => {
    const { view, router } = await page([state('right')])
    await send(view, 'origin question')
    expect(main.pending).toHaveLength(1)
    const restore = Promise.withResolvers<ConversationDetail | null>()
    main.reads.set('right', restore)
    await router.push('/home/c/right')
    await flushPromises()
    main.pending[0]!.reply.reject(new Error('WORKSPACE_BUSY'))
    await flushPromises()
    restore.resolve(main.detail('right'))
    await flushPromises()
    expect(draft(view)).toBe('')
    await send(view, 'target question')
    expect(main.pending[1]!.request.conversationId).toBe('right')
    expect(main.pending[1]!.request.text).toBe('target question')
    main.accept(1)
    await flushPromises()
    expect(router.currentRoute.value.params.id).toBe('right')
    expect(
      view.findAll('.HomePage-Message.user .HomePage-UserBubble').map((bubble) => bubble.text())
    ).toEqual(['right saved question', 'target question'])
  })

  it('a project switch on blank Home releases the old send and preserves the new project submission', async () => {
    const { view, project, router } = await page()
    project.beginConversation('project-left')
    await nextTick()
    await send(view, 'left project question')
    expect(main.pending).toHaveLength(1)
    expect(main.pending[0]!.request.create!.projectId).toBe('project-left')
    project.beginConversation('project-right')
    await flushPromises()
    await send(view, 'right project question')
    expect(main.pending).toHaveLength(2)
    expect(main.pending[1]!.request.create!.projectId).toBe('project-right')
    main.pending[0]!.reply.reject(new Error('WORKSPACE_PROJECT_UNAVAILABLE'))
    await flushPromises()
    expect(draft(view)).toBe('')
    // A stale finally must not unlock the newer in-flight send: pressing again cannot duplicate it.
    await send(view, 'right next draft')
    expect(main.pending).toHaveLength(2)
    expect(draft(view)).toBe('right next draft')
    main.accept(1)
    await flushPromises()
    expect(router.currentRoute.value.params.id).toBe(main.pending[1]!.request.conversationId)
    expect(project.activeProjectId).toBe('project-right')
    expect(view.get('.HomePage-Message.user .HomePage-UserBubble').text()).toBe(
      'right project question'
    )
    expect(draft(view)).toBe('right next draft')
  })
})
