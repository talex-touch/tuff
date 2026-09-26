import type { ChoiceSelectPayload } from '@talex-touch/tuffex/choice-card'
import type { StreamController } from '@talex-touch/utils/transport'
import type { ClipboardItem } from '@talex-touch/utils/transport/events'
import type { LocalAiCliSessionSummary } from '@talex-touch/utils/transport/events/local-ai-cli'
import type { ConversationRecord } from '@talex-touch/utils/transport/sdk/domains/conversation'
import type { ProjectRecord } from '@talex-touch/utils/transport/sdk/domains/project'
import type {
  IntelligenceChatPayload,
  IntelligenceInvokeOptions,
  IntelligenceStreamEvent,
  IntelligenceStreamOptions
} from '@talex-touch/utils/types/intelligence'
import type { HomeOpeningSdk } from './opening'
import type { UseHomePushReturn } from './useHomePush'
import { flushPromises } from '@vue/test-utils'
import type { Mock } from 'vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { clipboardItem, conversation, fakeT, NOW, project, session } from './home-push.fixtures'
import { guideCategoryOptionId, HOME_GUIDE_SELF_OPTION_ID } from './guide'
import { createHomeOpeningCache } from './opening'
import { useHomePush } from './useHomePush'

vi.mock('@talex-touch/utils/renderer', () => ({
  useIntelligenceSdk: () => {
    throw new Error('tests must inject an opening SDK double')
  }
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => {
    throw new Error('tests must inject the data source and navigation')
  }
}))

const DELTA: IntelligenceStreamEvent<string> = { type: 'delta', capabilityId: 'text.chat' }
const END: IntelligenceStreamEvent<string> = { type: 'end', capabilityId: 'text.chat' }

interface StreamRecord {
  payload: IntelligenceChatPayload
  invokeOptions: IntelligenceInvokeOptions | undefined
  handlers: IntelligenceStreamOptions<string>
  cancel: Mock
}

const scopes: Array<ReturnType<typeof effectScope>> = []

afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop()
})

function setup(
  initial: {
    conversations?: ConversationRecord[]
    projects?: ProjectRecord[]
    sessions?: LocalAiCliSessionSummary[]
    active?: boolean
    load?: () => Promise<void>
    clipboard?: () => Promise<ClipboardItem | null>
    routing?: () => { providerId?: string; model?: string } | undefined
    routingReady?: () => Promise<unknown>
  } = {}
) {
  const active = ref(initial.active ?? true)
  const projectId = ref<string | null>(null)
  const conversations = ref<ConversationRecord[]>(initial.conversations ?? [])
  const projects = ref<ProjectRecord[]>(initial.projects ?? [])
  const sessions = ref<LocalAiCliSessionSummary[]>(initial.sessions ?? [])
  const load = vi.fn<() => Promise<void>>(initial.load ?? (async () => {}))
  const latestClipboardText = vi.fn<() => Promise<ClipboardItem | null>>(
    initial.clipboard ?? (async () => null)
  )
  const composer = { prefill: vi.fn(), send: vi.fn(), focus: vi.fn() }
  const navigation = { openConversation: vi.fn(), enterProject: vi.fn(), continueSession: vi.fn() }
  const streams: StreamRecord[] = []
  const sdk: HomeOpeningSdk = {
    stream: (_capabilityId, payload, handlers, invokeOptions) => {
      const cancel = vi.fn()
      streams.push({ payload, invokeOptions, handlers, cancel })
      const controller: StreamController = { cancel, cancelled: false, streamId: 'opening' }
      return Promise.resolve(controller)
    }
  }

  const scope = effectScope()
  scopes.push(scope)
  const push = scope.run(() =>
    useHomePush({
      active: () => active.value,
      projectId: () => projectId.value,
      routing: initial.routing,
      routingReady: initial.routingReady,
      composer,
      t: fakeT,
      sdk,
      data: {
        conversations: () => conversations.value,
        projects: () => projects.value,
        sessions: () => sessions.value,
        load,
        latestClipboardText
      },
      navigation,
      cache: createHomeOpeningCache(),
      now: () => NOW
    })
  )
  if (!push) throw new Error('useHomePush did not return')
  return {
    push,
    active,
    projectId,
    conversations,
    projects,
    sessions,
    load,
    latestClipboardText,
    composer,
    navigation,
    streams
  }
}

function choose(push: UseHomePushReturn, optionId: string): Promise<void> {
  const steps = push.steps.value
  for (const [stepIndex, step] of steps.entries()) {
    const option = step.options.find((candidate) => candidate.id === optionId)
    if (option) return push.choose({ step, stepIndex, option } satisfies ChoiceSelectPayload)
  }
  throw new Error(`no option ${optionId}`)
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

describe('useHomePush entering the blank state', () => {
  it('reads the stores first, then writes one opening from titles and names only', async () => {
    const stores = {
      projects: [
        project({ id: 'p1', name: 'talex-touch', rootPath: '/Users/me/Workspace/talex-touch' })
      ],
      conversations: [conversation({ id: 'c1', title: '周报' })]
    }
    const loaded = deferred<void>()
    const harness = setup({
      load: () => loaded.promise,
      clipboard: async () => clipboardItem({ value: 'the secret launch date is friday' })
    })

    // Cold start: the stores are still empty while their first load is out, so nothing is asked yet.
    expect(harness.push.opening.phase.value).toBe('pending')
    expect(harness.streams).toHaveLength(0)

    harness.projects.value = stores.projects
    harness.conversations.value = stores.conversations
    loaded.resolve()
    await flushPromises()

    expect(harness.streams).toHaveLength(1)
    const summary = String(harness.streams[0]?.payload.messages[1]?.content)
    expect(summary).toContain('周报')
    expect(summary).toContain('talex-touch')
    expect(summary).not.toContain('/Users/')
    expect(summary).not.toContain('the secret launch date')
  })

  it('holds the card skeleton until the clipboard read lands, then offers the clipboard row', async () => {
    const copied = deferred<ClipboardItem | null>()
    const harness = setup({
      conversations: [conversation({ id: 'c1' })],
      clipboard: () => copied.promise
    })
    await flushPromises()
    expect(harness.push.loading.value).toBe(true)

    copied.resolve(clipboardItem({ value: 'draft reply to Lin' }))
    await flushPromises()

    expect(harness.push.loading.value).toBe(false)
    expect(harness.push.mode.value).toBe('feed')
    expect(harness.push.feed.value.map((item) => item.kind)).toEqual(['conversation', 'clipboard'])
  })

  it('streams the opening into view', async () => {
    const harness = setup()
    await flushPromises()

    harness.streams[0]?.handlers.onDelta?.('你好，我是塔芙。', DELTA)
    harness.streams[0]?.handlers.onEnd?.(END)

    expect(harness.push.opening.phase.value).toBe('done')
    expect(harness.push.opening.text.value).toBe('你好，我是塔芙。')
  })

  it('drops the opening in flight when the blank state is left', async () => {
    const harness = setup()
    await flushPromises()
    harness.streams[0]?.handlers.onDelta?.('你好', DELTA)

    harness.active.value = false
    await nextTick()

    expect(harness.streams[0]?.cancel).toHaveBeenCalledTimes(1)
    expect(harness.push.opening.phase.value).toBe('cancelled')
  })

  it('starts a fresh entry when the blank conversation moves to a project', async () => {
    const harness = setup({ projects: [project({ id: 'p1', name: 'talex-touch' })] })
    await flushPromises()

    harness.projectId.value = 'p1'
    await flushPromises()

    expect(harness.streams).toHaveLength(2)
    expect(harness.streams[0]?.cancel).toHaveBeenCalledTimes(1)
    expect(String(harness.streams[1]?.payload.messages[1]?.content)).toContain(
      'home.opening.summary.currentProject{"name":"talex-touch"}'
    )
  })

  /**
   * The stores keep themselves current after their first load, so re-reading them on every entry
   * would be a round trip per blank conversation for nothing.
   */
  it('loads the stores once and reads them as they stand on a later entry', async () => {
    const harness = setup()
    await flushPromises()

    harness.active.value = false
    await nextTick()
    // A conversation saved in between reaches the store on its own, as `persist` refreshes it.
    harness.conversations.value = [conversation({ id: 'c1', title: '周报' })]
    harness.active.value = true
    await flushPromises()

    expect(harness.load).toHaveBeenCalledTimes(1)
    expect(harness.streams).toHaveLength(2)
    expect(String(harness.streams[1]?.payload.messages[1]?.content)).toContain('周报')
  })

  it('makes an entry made while the first load is out wait on that same load', async () => {
    const loaded = deferred<void>()
    const harness = setup({
      projects: [project({ id: 'p1', name: 'talex-touch' })],
      load: () => loaded.promise
    })

    harness.projectId.value = 'p1'
    await nextTick()
    expect(harness.load).toHaveBeenCalledTimes(1)
    expect(harness.streams).toHaveLength(0)

    loaded.resolve()
    await flushPromises()

    // Only the entry still on screen writes an opening.
    expect(harness.streams).toHaveLength(1)
    expect(String(harness.streams[0]?.payload.messages[1]?.content)).toContain(
      'home.opening.summary.currentProject{"name":"talex-touch"}'
    )
  })

  it('stays idle while the blank state is not on screen', async () => {
    const harness = setup({ active: false })
    await flushPromises()
    expect(harness.load).not.toHaveBeenCalled()
    expect(harness.streams).toHaveLength(0)
  })

  /**
   * The composer's pin resolves only once its model list has loaded and reads as auto until then;
   * a cold start that did not wait would open on auto while every chat turn goes to the pin.
   */
  it('opens on the composer’s route once the pin has resolved', async () => {
    const resolved = deferred<void>()
    let routing: { providerId?: string; model?: string } = {}
    const harness = setup({ routing: () => routing, routingReady: () => resolved.promise })
    await flushPromises()
    expect(harness.streams).toHaveLength(0)

    routing = { providerId: 'claude-cli', model: 'claude-opus-5-5' }
    resolved.resolve()
    await flushPromises()

    expect(harness.streams).toHaveLength(1)
    expect(harness.streams[0]?.invokeOptions).toMatchObject({
      preferredProviderId: 'claude-cli',
      modelPreference: ['claude-opus-5-5']
    })
  })
})

describe('useHomePush taking the opening', () => {
  it('hands over a finished opening as the lead', async () => {
    const harness = setup()
    await flushPromises()
    harness.streams[0]?.handlers.onDelta?.('要先推进哪件事？', DELTA)
    harness.streams[0]?.handlers.onEnd?.(END)

    expect(harness.push.takeLead()).toBe('要先推进哪件事？')
    expect(harness.push.leadNote('要先推进哪件事？')).toBe(
      'home.opening.leadNote{"text":"要先推进哪件事？"}'
    )
  })

  it('cancels an opening still streaming and hands over nothing', async () => {
    const harness = setup()
    await flushPromises()
    harness.streams[0]?.handlers.onDelta?.('你好', DELTA)

    expect(harness.push.takeLead()).toBeNull()
    expect(harness.streams[0]?.cancel).toHaveBeenCalledTimes(1)
  })

  it('starts no opening at all when the user sends before the summary is written', async () => {
    const loaded = deferred<void>()
    const harness = setup({ load: () => loaded.promise })

    expect(harness.push.takeLead()).toBeNull()
    loaded.resolve()
    await flushPromises()

    expect(harness.streams).toHaveLength(0)
  })
})

describe('useHomePush card actions', () => {
  it('turns the guide to page two on a category and remembers it', async () => {
    const harness = setup()
    await flushPromises()
    expect(harness.push.mode.value).toBe('guide')

    await choose(harness.push, guideCategoryOptionId('files'))

    expect(harness.push.step.value).toBe(1)
    expect(harness.push.selected.value).toBe(guideCategoryOptionId('files'))
    expect(harness.push.steps.value[1]?.id).toBe('guide:starters:files')
  })

  it('sends a starter through the composer, and 「我自己说」 only focuses it', async () => {
    const harness = setup()
    await flushPromises()

    await choose(harness.push, guideCategoryOptionId('files'))
    await choose(harness.push, 'guide:starter:files.downloads')
    expect(harness.composer.send).toHaveBeenCalledWith('home.push.guide.files.downloads')

    await choose(harness.push, HOME_GUIDE_SELF_OPTION_ID)
    expect(harness.composer.focus).toHaveBeenCalledTimes(1)
    expect(harness.composer.send).toHaveBeenCalledTimes(1)
  })

  it('runs every feed row’s own action, and only prefills the clipboard', async () => {
    const harness = setup({
      projects: [project({ id: 'p2', name: 'sheet-music' })],
      conversations: [conversation({ id: 'c1' })],
      sessions: [session({ sessionRef: 'ref-1', provider: 'codex' })],
      clipboard: async () => clipboardItem({ id: 9, value: 'draft reply to Lin' })
    })
    await flushPromises()
    expect(harness.push.mode.value).toBe('feed')

    await choose(harness.push, 'feed:conversation:c1')
    await choose(harness.push, 'feed:session:ref-1')
    await choose(harness.push, 'feed:clipboard:9')
    await choose(harness.push, 'feed:project:p2')

    expect(harness.navigation.openConversation).toHaveBeenCalledWith('c1')
    expect(harness.navigation.continueSession).toHaveBeenCalledWith({
      state: 'available',
      sessionRef: 'ref-1',
      provider: 'codex',
      projectId: null
    })
    expect(harness.composer.prefill).toHaveBeenCalledWith('draft reply to Lin')
    expect(harness.composer.send).not.toHaveBeenCalled()
    expect(harness.navigation.enterProject).toHaveBeenCalledWith('p2')
  })

  it('swallows a failing action instead of rejecting the card’s handler', async () => {
    const harness = setup({ conversations: [conversation({ id: 'c1' })] })
    await flushPromises()
    harness.navigation.openConversation.mockImplementation(() => {
      throw new Error('navigation aborted')
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(choose(harness.push, 'feed:conversation:c1')).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})
