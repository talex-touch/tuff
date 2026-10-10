// @vitest-environment jsdom
import type { StreamOptions } from '@talex-touch/utils/transport'
import type { PropType, SetupContext } from 'vue'
import type { ConversationMessage } from '~/modules/conversation/useHomeConversation'
import type {
  ConversationWorkspaceState,
  WorkspaceSubmitRequest,
  WorkspaceSubmitResult
} from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import type { VoiceAsrStreamEvent } from '@talex-touch/utils/transport/sdk/domains/voice'
import type { Pinia } from 'pinia'
import { AgentWorkspaceEvents } from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import { AgentToolEvents } from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import { ConversationEvents } from '@talex-touch/utils/transport/sdk/domains/conversation'
import { voiceApiEvents } from '@talex-touch/utils/transport/sdk/domains/voice'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, disposePinia } from 'pinia'
import { h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The voice clip at page level: HomePage, its dictation, workspace adapter, router and Pinia run
 * unmodified against a hand-written Main boundary (the `HomePage.submit-race` harness, plus the
 * voice stream and the clip's two calls). Only paint is replaced.
 */
interface VoiceHost {
  transport: {
    send: (event: unknown, payload: unknown) => Promise<unknown>
    on: (event: unknown, listener: (payload: unknown) => void) => () => void
    stream: (
      event: unknown,
      payload: unknown,
      options: StreamOptions<VoiceAsrStreamEvent>
    ) => Promise<unknown>
  }
  pending: Array<{
    request: WorkspaceSubmitRequest
    reply: PromiseWithResolvers<WorkspaceSubmitResult>
  }>
  streams: Array<StreamOptions<VoiceAsrStreamEvent>>
  transcribed: Array<{ recordingId: string }>
  discarded: string[]
  transcript: { text: string } | Error
  accept: (index: number) => void
}

const boundary = vi.hoisted(() => ({
  transport: null as VoiceHost['transport'] | null,
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
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: { value: 'zh-CN' } })
}))

const Paint = {
  setup:
    (_: Record<string, unknown>, { slots }: SetupContext) =>
    () =>
      h('div', slots.default?.())
}
const ToolbarPaint = {
  name: 'ToolbarPaint',
  emits: ['mic', 'send'],
  setup(_: Record<string, unknown>, { slots, expose }: SetupContext) {
    expose({ launch: () => {} })
    return () => h('div', slots.mode?.())
  }
}
const ClipPaint = {
  props: { src: String, durationMs: Number },
  setup: (props: { src?: string }) => () => h('div', { class: 'clip-paint', 'data-src': props.src })
}
const TextPaint = {
  props: { content: String },
  setup: (props: { content?: string }) => () => h('span', props.content)
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
vi.mock('@talex-touch/tuffex/voice-clip', () => ({ TxVoiceClip: ClipPaint }))
vi.mock('@talex-touch/tuffex/voice-beam', () => ({ TxVoiceBeam: Paint }))
vi.mock('@talex-touch/tuffex/attachment-tray', () => ({ TxAttachmentTray: Paint }))
vi.mock('@talex-touch/tuffex/border-beam', () => ({ TxBorderBeam: Paint }))
vi.mock('@talex-touch/tuffex/chain-of-thought', () => ({ TxChainOfThought: Paint }))
vi.mock('@talex-touch/tuffex/choice-card', () => ({ TxChoiceCard: Paint }))
vi.mock('@talex-touch/tuffex/message-actions', () => ({ TxMessageActions: Paint }))
vi.mock('@talex-touch/tuffex/modal', () => ({ TxModal: Paint }))
vi.mock('@talex-touch/tuffex/skeleton', async () => {
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

const RECORDING = { id: 'clip-1', url: 'tfile:///kept/clip-1.wav', durationMs: 2_400 }

function thread(id: string): ConversationWorkspaceState {
  return {
    conversationId: id,
    projectId: null,
    settings: { mode: 'chat', reasoningEffort: 'low', autoContext: false },
    status: 'idle',
    queueHeld: false,
    queue: [],
    messages: [
      {
        id: `${id}-user`,
        role: 'user',
        content: '前一条',
        status: 'complete',
        seq: 0,
        createdAt: 1
      }
    ],
    revision: 1,
    updatedAt: 1
  }
}

function host(initial: ConversationWorkspaceState[]): VoiceHost {
  const states = new Map(initial.map((value) => [value.conversationId, value]))
  const voice: VoiceHost = {
    pending: [],
    streams: [],
    transcribed: [],
    discarded: [],
    transcript: { text: '' },
    accept: () => {},
    transport: {
      async send(event: unknown, payload: unknown): Promise<unknown> {
        const name = String(event)
        const body = payload as Record<string, unknown>
        if (name === String(AgentWorkspaceEvents.get))
          return states.get(body.conversationId as string) ?? null
        if (name === String(ConversationEvents.get)) {
          const held = states.get(body.id as string)
          return held
            ? {
                id: held.conversationId,
                title: held.conversationId,
                projectId: held.projectId,
                messages: held.messages,
                createdAt: 1,
                updatedAt: 1
              }
            : null
        }
        if (name === String(ConversationEvents.list))
          return [...states.values()].map((held) => ({
            id: held.conversationId,
            title: held.conversationId,
            projectId: held.projectId,
            createdAt: 1,
            updatedAt: 1
          }))
        if (name === String(AgentToolEvents.setConfirmationSurface)) return payload
        if (name === String(voiceApiEvents.getRecognitionStatus))
          return { ok: true, result: { asr: { ready: true }, stt: { ready: true } } }
        if (name === String(voiceApiEvents.transcribeRecording)) {
          voice.transcribed.push({ recordingId: body.recordingId as string })
          if (voice.transcript instanceof Error)
            return { ok: false, error: voice.transcript.message, code: voice.transcript.message }
          return { ok: true, result: voice.transcript }
        }
        if (name === String(voiceApiEvents.discardRecording)) {
          voice.discarded.push(body.recordingId as string)
          return { ok: true }
        }
        if (name === String(AgentWorkspaceEvents.submit)) {
          const request = structuredClone(payload) as WorkspaceSubmitRequest
          const reply = Promise.withResolvers<WorkspaceSubmitResult>()
          voice.pending.push({ request, reply })
          return reply.promise
        }
        throw new Error(`Unexpected host request: ${name}`)
      },
      on: () => () => {},
      async stream(_event, _payload, options) {
        voice.streams.push(options)
        return { cancel: vi.fn(), stop: vi.fn(), cancelled: false, streamId: 's' }
      }
    }
  }
  voice.accept = (index) => {
    const { request, reply } = voice.pending[index]!
    const previous = states.get(request.conversationId) ?? {
      ...thread(request.conversationId),
      messages: []
    }
    const accepted: ConversationWorkspaceState = {
      ...previous,
      revision: previous.revision + 1,
      status: 'running',
      activeTurnId: `${request.id}-turn`,
      messages: [
        ...previous.messages,
        {
          id: request.id,
          role: 'user',
          content: request.text,
          status: 'complete',
          seq: previous.messages.length,
          createdAt: 2,
          ...(request.voiceRecordingId
            ? {
                attachments: [
                  {
                    id: 'audio-copy',
                    kind: 'audio' as const,
                    mimeType: 'audio/wav',
                    size: 76_844,
                    previewUrl: 'tfile:///conversation/audio-copy.wav',
                    durationMs: 2_400
                  }
                ]
              }
            : {})
        }
      ]
    }
    states.set(request.conversationId, accepted)
    reply.resolve({ disposition: 'started', state: accepted })
  }
  return voice
}

let wrapper: VueWrapper | null = null
let pinia: Pinia | null = null
let main: VoiceHost

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
  wrapper?.unmount()
  wrapper = null
  if (pinia) disposePinia(pinia)
  pinia = null
  for (const pending of main?.pending ?? []) pending.reply.reject(new Error('Test host closed'))
  await flushPromises()
  boundary.transport = null
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
afterAll(() => {
  vi.resetModules()
})

async function page(initial: ConversationWorkspaceState[], path: string) {
  main = host(initial)
  boundary.transport = main.transport
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
  return wrapper
}

/** One dictation: the mic key, a capture that opens, `words` (if any), the kept clip, the end. */
async function dictate(view: VueWrapper, { words, fail }: { words?: string; fail?: string } = {}) {
  view.findComponent(ToolbarPaint).vm.$emit('mic')
  await flushPromises()
  const stream = main.streams.at(-1)!
  stream.onData({ type: 'ready' })
  stream.onData({ type: 'level', rms: 0.02 })
  if (words) stream.onData({ type: 'final', text: words })
  stream.onData({ type: 'recording', recording: RECORDING })
  if (fail) stream.onError?.(Object.assign(new Error(fail), { code: fail }))
  else stream.onData({ type: 'end' })
  await flushPromises()
}

function draft(view: VueWrapper): string {
  return (view.get('textarea').element as HTMLTextAreaElement).value
}

describe('HomePage voice clip', () => {
  it('ends the thread with a failed dictation’s clip, and sends it as a voice message', async () => {
    const view = await page([thread('t1')], '/home/c/t1')
    main.transcript = { text: '帮我看看这个分支' }

    await dictate(view, { fail: 'NETWORK_FAILURE' })

    // The clip is the last row, after the thread's own messages.
    const rows = view.findAll('.HomePage-StreamRow')
    expect(rows.at(-1)!.find('.HomeVoiceDraft').exists()).toBe(true)
    expect(view.get('.HomeVoiceDraft-Note').text()).toBe(
      'assistant.voicePanel.voiceTranscribeFailed'
    )
    expect(view.get('.clip-paint').attributes('data-src')).toBe(RECORDING.url)

    await view.get('.HomeVoiceDraft-Action.is-primary').trigger('click')
    await flushPromises()

    // Recognized first — the model reads the transcript — then sent with the recording.
    expect(main.transcribed).toEqual([{ recordingId: 'clip-1' }])
    expect(main.pending).toHaveLength(1)
    expect(main.pending[0]!.request).toMatchObject({
      conversationId: 't1',
      text: '帮我看看这个分支',
      voiceRecordingId: 'clip-1'
    })
    expect(view.find('.HomeVoiceDraft').exists()).toBe(false)

    main.accept(0)
    await flushPromises()
    // The sent message shows its recording, then its transcript.
    const sent = view.findAll('.HomePage-Message.user').at(-1)!
    expect(sent.get('.clip-paint').attributes('data-src')).toBe(
      'tfile:///conversation/audio-copy.wav'
    )
    expect(sent.get('.HomePage-UserBubble').text()).toBe('帮我看看这个分支')
    expect(main.discarded).toEqual([])
  })

  it('takes the clip’s words back out of the draft when the voice is sent instead', async () => {
    const view = await page([thread('t1')], '/home/c/t1')

    await dictate(view, { words: '你好' })
    expect(draft(view)).toBe('你好')
    expect(view.get('.HomeVoiceDraft-Note').text()).toBe('home.voiceClip.inserted')

    await view.get('.HomeVoiceDraft-Action.is-primary').trigger('click')
    await flushPromises()

    // Its own words: nothing to recognize again.
    expect(main.transcribed).toEqual([])
    expect(main.pending[0]!.request).toMatchObject({ text: '你好', voiceRecordingId: 'clip-1' })
    expect(draft(view)).toBe('')
  })

  it('lets the clip go with a typed send', async () => {
    const view = await page([thread('t1')], '/home/c/t1')
    await dictate(view, { words: '你好' })

    await view.get('textarea').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(main.pending[0]!.request.voiceRecordingId).toBeUndefined()
    main.accept(0)
    await flushPromises()

    expect(view.find('.HomeVoiceDraft').exists()).toBe(false)
    expect(main.discarded).toEqual(['clip-1'])
  })

  it('puts the clip back, marked gone, when Main no longer has its recording', async () => {
    const view = await page([thread('t1')], '/home/c/t1')
    await dictate(view, { words: '你好' })

    await view.get('.HomeVoiceDraft-Action.is-primary').trigger('click')
    await flushPromises()
    main.pending[0]!.reply.reject(new Error('WORKSPACE_VOICE_UNAVAILABLE'))
    await flushPromises()

    expect(view.get('.HomeVoiceDraft-Note').text()).toBe('home.voiceClip.expired')
    expect(view.get('.HomeVoiceDraft-Action.is-primary').attributes('disabled')).toBeDefined()
    // The draft is back as it was before the send.
    expect(draft(view)).toBe('你好')
  })

  it('recognizes the clip again into the draft', async () => {
    const view = await page([thread('t1')], '/home/c/t1')
    await dictate(view, { fail: 'NETWORK_FAILURE' })
    main.transcript = { text: '补上的话' }

    await view.findAll('.HomeVoiceDraft-Action')[0]!.trigger('click')
    await flushPromises()

    expect(draft(view)).toBe('补上的话')
    expect(view.get('.HomeVoiceDraft-Note').text()).toBe('home.voiceClip.inserted')
  })

  it('waits above the composer on an untouched Home, and survives a voice send that fails', async () => {
    const view = await page([], '/home')
    await dictate(view, { words: '第一句' })
    expect(view.find('.HomePage-VoiceDraftDock').exists()).toBe(true)

    await view.get('.HomeVoiceDraft-Action.is-primary').trigger('click')
    await flushPromises()
    expect(main.pending[0]!.request.create).toBeDefined()
    main.pending[0]!.reply.reject(new Error('WORKSPACE_BUSY'))
    await flushPromises()

    // The minted id was taken back; the clip is still here to try again, its audio kept.
    expect(view.find('.HomePage-VoiceDraftDock').exists()).toBe(true)
    expect(main.discarded).toEqual([])
  })

  it('lets the clip go when another thread opens', async () => {
    const view = await page([thread('t1'), thread('t2')], '/home/c/t1')
    await dictate(view, { words: '你好' })
    const router = view.vm.$router

    await router.push('/home/c/t2')
    await flushPromises()

    expect(view.find('.HomeVoiceDraft').exists()).toBe(false)
    expect(main.discarded).toEqual(['clip-1'])
  })
})
