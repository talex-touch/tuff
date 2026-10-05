import type { AiAttachment } from '@talex-touch/tuffex/ai-elements'
import type {
  AgentWorkspaceSdk,
  ConversationWorkspaceSettings,
  ConversationWorkspaceState,
  WorkspaceHostMessage,
  WorkspaceMessageUpdate,
  WorkspaceSubmitRequest
} from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import type { UseAgentWorkspaceReturn, WorkspaceDraftDefaults } from './useAgentWorkspace'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useAgentWorkspace } from './useAgentWorkspace'

vi.mock('@talex-touch/utils/renderer', () => ({
  useIntelligenceSdk: () => ({
    orchestratorListProfiles: async () => {
      throw new Error('Profile discovery is outside submission')
    }
  })
}))
vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: () => ({ error: () => {}, warn: () => {} })
}))

afterAll(() => {
  vi.doUnmock('@talex-touch/utils/renderer')
  vi.doUnmock('~/utils/renderer-log')
})
const cleanup: Array<() => void> = []
afterEach(() => {
  for (const dispose of cleanup.splice(0).reverse()) dispose()
  vi.restoreAllMocks()
})

const leftSettings: ConversationWorkspaceSettings = {
  mode: 'agent',
  profileId: 'profile-left',
  providerId: 'provider-left',
  model: 'model-left',
  reasoningEffort: 'low',
  autoContext: false
}
const rightSettings: ConversationWorkspaceSettings = {
  mode: 'agent',
  profileId: 'profile-right',
  providerId: 'provider-right',
  model: 'model-right',
  reasoningEffort: 'high',
  autoContext: true
}
function hostState(
  id: string,
  settings: ConversationWorkspaceSettings,
  projectId = 'project-left'
): ConversationWorkspaceState {
  return {
    conversationId: id,
    projectId,
    settings: { ...settings },
    status: 'idle',
    queueHeld: false,
    queue: [],
    revision: 1,
    updatedAt: 1,
    messages: [
      {
        id: `${id}-answer`,
        role: 'assistant',
        content: `${id} visible answer`,
        status: 'complete',
        seq: 0,
        createdAt: 1
      }
    ]
  }
}

/** Main SDK boundary only. Vue watches, attachment serialization and state adoption remain real. */
function host(initial: ConversationWorkspaceState[]) {
  const states = new Map(initial.map((state) => [state.conversationId, state]))
  const listeners = new Set<(state: ConversationWorkspaceState) => void>()
  const frameListeners = new Set<(frame: WorkspaceMessageUpdate) => void>()
  const requests: WorkspaceSubmitRequest[] = []
  const replies = Promise.withResolvers<void>()
  const submitted = Promise.withResolvers<void>()
  const unexpected = async (): Promise<never> => {
    throw new Error('Unexpected workspace action')
  }
  const publish = (state: ConversationWorkspaceState) => {
    states.set(state.conversationId, state)
    for (const listener of listeners) listener(state)
  }
  const emit = (frame: WorkspaceMessageUpdate) => {
    for (const listener of frameListeners) listener(frame)
  }
  const sdk: AgentWorkspaceSdk = {
    get: async (id) => states.get(id) ?? null,
    configure: async (id, settings) => {
      const previous = states.get(id)!
      const state = { ...previous, settings: { ...settings }, revision: previous.revision + 1 }
      publish(state)
      return state
    },
    submit: async (request) => {
      requests.push(structuredClone(request))
      submitted.resolve()
      await replies.promise
      const previous = states.get(request.conversationId)
      const state =
        previous ?? hostState(request.conversationId, request.settings!, request.create!.projectId!)
      const result: ConversationWorkspaceState = {
        ...state,
        revision: state.revision + 1,
        queue: [
          {
            id: request.id,
            conversationId: request.conversationId,
            text: request.text,
            settings: { ...request.settings! },
            projectId: state.projectId,
            createdAt: 2
          }
        ]
      }
      publish(result)
      return { disposition: 'queued', state: result }
    },
    fork: async () => states.get('child')!,
    pause: unexpected,
    resume: unexpected,
    removeQueued: unexpected,
    reorderQueued: unexpected,
    promoteQueued: unexpected,
    approveRun: unexpected,
    rejectRun: unexpected,
    onChanged: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    onMessageUpdate: (listener) => {
      frameListeners.add(listener)
      return () => {
        frameListeners.delete(listener)
      }
    }
  }
  cleanup.push(() => replies.resolve())
  return { sdk, states, requests, replies, submitted, publish, emit }
}

function mounted(sdk: AgentWorkspaceSdk, initialId: string | null) {
  const id = ref(initialId)
  const project = ref('project-left')
  const titlePrefix = ref('left title')
  const defaults = ref<WorkspaceDraftDefaults>({
    providerId: 'provider-left',
    model: 'model-left',
    reasoningEffort: 'low',
    autoContext: false
  })
  const scope = effectScope()
  const workspace = scope.run(() =>
    useAgentWorkspace({
      conversationId: () => id.value,
      projectId: () => project.value,
      title: (text) => `${titlePrefix.value}: ${text}`,
      defaults: () => defaults.value,
      leadNote: (lead) => `Opening: ${lead}`,
      onError: (failure) => {
        throw new Error(failure.detail || failure.code)
      },
      sdk
    })
  )!
  cleanup.push(() => scope.stop())
  return { workspace, id, project, titlePrefix, defaults }
}

function heldEncoding() {
  const entered = Promise.withResolvers<void>()
  const response = Promise.withResolvers<Response>()
  const bytes = new Uint8Array([1, 2, 3, 250])
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    entered.resolve()
    return response.promise
  })
  const release = () => response.resolve(new Response(new Blob([bytes], { type: 'image/png' })))
  cleanup.push(release)
  const attachments: AiAttachment[] = [
    { kind: 'image', id: 'image-left', url: 'blob:app://composer/left', name: 'left.png' }
  ]
  return { entered, release, attachments }
}

async function navigate(
  view: { workspace: UseAgentWorkspaceReturn; id: { value: string | null } },
  id: string
) {
  await view.workspace.prefetch(id)
  view.id.value = id
  await nextTick()
}

function expectRightVisible(workspace: UseAgentWorkspaceReturn, id: string) {
  expect(workspace.state.value).toMatchObject({
    conversationId: id,
    settings: rightSettings,
    queue: []
  })
  expect(workspace.adapter.messages.map((message) => message.content)).toEqual([
    `${id} visible answer`
  ])
  expect(workspace.sessionModel.value).toEqual({
    providerId: 'provider-right',
    model: 'model-right',
    reasoningEffort: 'high'
  })
}

describe('useAgentWorkspace submission belongs to the press before attachment encoding', () => {
  it.each([
    { name: 'unrelated right conversation', target: 'right', project: 'project-right' },
    { name: 'forked child in the same project', target: 'child', project: 'project-left' }
  ])(
    '$name cannot retarget the parent request or adopt its late result',
    async ({ target, project }) => {
      const main = host([
        hostState('left', leftSettings),
        hostState(target, rightSettings, project)
      ])
      const view = mounted(main.sdk, 'left')
      await view.workspace.reload()
      const encoding = heldEncoding()
      const pending = view.workspace.submit('  left question  ', encoding.attachments)
      await encoding.entered.promise
      if (target === 'child')
        expect(await view.workspace.fork({ messageId: 'left-answer' })).toBe('child')
      await navigate(view, target)
      view.project.value = project
      view.titlePrefix.value = 'right title'
      view.defaults.value = {
        providerId: 'new-global-provider',
        model: 'new-global-model',
        reasoningEffort: 'max',
        autoContext: true
      }
      expectRightVisible(view.workspace, target)
      encoding.release()
      await main.submitted.promise
      expect(main.requests[0]).toMatchObject({
        conversationId: 'left',
        text: 'left question',
        settings: leftSettings,
        attachments: [
          { type: 'image', name: 'left.png', dataUrl: 'data:image/png;base64,AQID+g==' }
        ]
      })
      expect(main.requests[0]).not.toHaveProperty('create')
      main.replies.resolve()
      expect(await pending).toBe('queued')
      expect(main.states.get('left')!.queue[0]).toMatchObject({
        projectId: 'project-left',
        settings: leftSettings,
        text: 'left question'
      })
      expectRightVisible(view.workspace, target)
    }
  )

  it('a new draft snapshots its project, generated title, profile and global choices before navigation', async () => {
    const main = host([hostState('right', rightSettings, 'project-right')])
    const view = mounted(main.sdk, null)
    view.workspace.setDraftMode('agent')
    view.workspace.setDraftProfile('profile-left')
    view.id.value = 'new-left'
    await nextTick()
    const encoding = heldEncoding()
    const pending = view.workspace.submit('draft question', encoding.attachments, {
      lead: 'left opening'
    })
    await encoding.entered.promise
    await navigate(view, 'right')
    view.project.value = 'project-right'
    view.titlePrefix.value = 'right title'
    view.defaults.value = {
      providerId: 'provider-right',
      model: 'model-right',
      reasoningEffort: 'high',
      autoContext: true
    }
    view.workspace.setDraftMode('chat')
    view.workspace.setDraftProfile('profile-right')
    encoding.release()
    await main.submitted.promise
    expect(main.requests[0]).toMatchObject({
      conversationId: 'new-left',
      settings: leftSettings,
      create: { projectId: 'project-left', title: 'left title: draft question' },
      lead: { text: 'left opening', note: 'Opening: left opening' }
    })
    main.replies.resolve()
    expect(await pending).toBe('queued')
    expect(main.states.get('new-left')!.queue[0]).toMatchObject({
      projectId: 'project-left',
      settings: leftSettings
    })
    expectRightVisible(view.workspace, 'right')
  })

  it('same-session host mutation and configure while encoding cannot rewrite the already pressed input', async () => {
    const original = hostState('left', leftSettings)
    const main = host([original])
    const view = mounted(main.sdk, 'left')
    await view.workspace.reload()
    const encoding = heldEncoding()
    const pending = view.workspace.submit('before edit', encoding.attachments)
    await encoding.entered.promise
    // A host update can reuse its settings object; capturing its reference is not a snapshot.
    Object.assign(original.settings, rightSettings)
    main.publish({ ...original, revision: 2 })
    await view.workspace.configure({ reasoningEffort: 'max', autoContext: false })
    encoding.release()
    await main.submitted.promise
    expect(main.requests[0]).toMatchObject({ conversationId: 'left', settings: leftSettings })
    main.replies.resolve()
    expect(await pending).toBe('queued')
    expect(view.workspace.queue.value[0]).toMatchObject({
      text: 'before edit',
      settings: leftSettings
    })
    expect(view.workspace.settings.value).toEqual({
      ...rightSettings,
      reasoningEffort: 'max',
      autoContext: false
    })
  })
})

function deltaFrame(
  conversationId: string,
  turnId: string,
  seq: number,
  messageId: string,
  deltaText: string,
  resetText?: true
): WorkspaceMessageUpdate {
  return {
    conversationId,
    turnId,
    seq,
    update: {
      type: 'message_update',
      stream: 'delta',
      message: {
        id: messageId,
        role: 'assistant',
        content: '',
        createdAt: '',
        status: 'streaming'
      },
      deltaText,
      ...(resetText ? { resetText } : {})
    }
  }
}

function snapshotFrame(
  conversationId: string,
  turnId: string,
  seq: number,
  message: WorkspaceHostMessage
): WorkspaceMessageUpdate {
  return {
    conversationId,
    turnId,
    seq,
    update: {
      type: 'message_update',
      message: {
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: '',
        status: message.status === 'failed' ? 'error' : message.status,
        host: structuredClone(message)
      }
    }
  }
}

describe('useAgentWorkspace frames cannot outrank Main admission or durable terminal messages', () => {
  it.each(['complete', 'failed'] as const)(
    'reloading a %s answer rejects old deltas, resets, structural replacements and extra rows',
    async (status) => {
      const expected = [
        {
          id: 'left-answer',
          role: 'assistant' as const,
          content: 'left visible answer',
          status,
          meta: { turnId: 'old-turn' },
          parts: [
            { type: 'text', text: 'left visible answer' },
            {
              type: 'tool-call',
              id: 'saved-tool',
              name: 'tuff_search_files',
              status: 'done',
              output: 'saved result'
            }
          ],
          ...(status === 'failed'
            ? { error: { code: 'PROVIDER_FAILED', detail: 'saved failure' } }
            : {})
        }
      ]
      const saved = hostState('left', leftSettings)
      saved.status = status === 'failed' ? 'failed' : 'idle'
      saved.messages = expected.map((message) => ({
        ...structuredClone(message),
        seq: 0,
        createdAt: 1
      }))
      const main = host([saved])
      const view = mounted(main.sdk, 'left')
      await view.workspace.reload()

      // This window never observed the old turn running or closing.
      const replacement: WorkspaceHostMessage = {
        ...saved.messages[0],
        content: 'DELAYED replacement',
        status: 'streaming',
        parts: [
          { type: 'text', text: 'DELAYED replacement' },
          { type: 'tool-call', id: 'late-tool', name: 'tuff_search_files', status: 'running' }
        ]
      }
      for (const frame of [
        deltaFrame('left', 'old-turn', 1, 'left-answer', ' DELAYED'),
        deltaFrame('left', 'old-turn', 2, 'left-answer', 'RESET', true),
        snapshotFrame('left', 'old-turn', 3, replacement),
        snapshotFrame('left', 'old-turn', 4, { ...replacement, id: 'late-answer' })
      ]) {
        main.emit(frame)
        expect(view.workspace.adapter.messages, `late frame ${frame.seq}`).toEqual(expected)
      }
    }
  )

  it('the durable answer wins before finishTurn clears the still-running active turn', async () => {
    const admitted = hostState('left', leftSettings)
    admitted.status = 'running'
    admitted.activeTurnId = 'ending-turn'
    admitted.messages[0] = {
      ...admitted.messages[0],
      content: 'in progress',
      status: 'streaming',
      meta: { turnId: 'ending-turn' },
      parts: [{ type: 'text', text: 'in progress' }]
    }
    const main = host([admitted])
    const view = mounted(main.sdk, 'left')
    await view.workspace.reload()
    main.emit(deltaFrame('left', 'ending-turn', 1, 'left-answer', ' +live'))
    expect(view.workspace.adapter.messages[0]).toMatchObject({
      content: 'in progress +live',
      status: 'streaming',
      parts: [{ type: 'text', text: 'in progress +live' }]
    })

    const expected = [
      {
        id: 'left-answer',
        role: 'assistant' as const,
        content: 'Main committed answer',
        status: 'complete' as const,
        meta: { turnId: 'ending-turn' },
        parts: [
          { type: 'text', text: 'Main committed answer' },
          {
            type: 'tool-call',
            id: 'committed-tool',
            name: 'tuff_search_files',
            status: 'done',
            output: 'committed result'
          }
        ]
      }
    ]
    const durable = {
      ...admitted,
      revision: 2,
      messages: expected.map((message) => ({ ...structuredClone(message), seq: 1, createdAt: 1 }))
    }
    // Main broadcasts mutateMessages before the terminal snapshot and finishTurn.
    main.publish(durable)
    expect(view.workspace.adapter.messages).toEqual(expected)
    // Inject late traffic before the terminal snapshot can populate closed-turn bookkeeping.
    for (const frame of [
      deltaFrame('left', 'ending-turn', 3, 'left-answer', ' DELAYED'),
      snapshotFrame('left', 'ending-turn', 4, {
        ...admitted.messages[0],
        content: 'stale running snapshot'
      }),
      snapshotFrame('left', 'ending-turn', 5, {
        ...admitted.messages[0],
        id: 'extra-ending-answer'
      })
    ]) {
      main.emit(frame)
      expect(view.workspace.adapter.messages, `ending frame ${frame.seq}`).toEqual(expected)
    }
    main.emit(snapshotFrame('left', 'ending-turn', 6, durable.messages[0]))
    expect(view.workspace.adapter.messages).toEqual(expected)
  })

  it.each(['running', 'pending_approval'] as const)(
    'an admitted %s turn accepts live text and tool structure, then yields to Main without old-turn contamination',
    async (status) => {
      const admitted = hostState('left', leftSettings)
      admitted.messages[0].meta = { turnId: 'old-turn' }
      admitted.status = status
      admitted.activeTurnId = 'new-turn'
      const active: WorkspaceHostMessage = {
        id: 'new-answer',
        role: 'assistant',
        content: 'new answer',
        status: 'streaming',
        meta: { turnId: 'new-turn' },
        parts: [{ type: 'text', text: 'new answer' }],
        seq: 1,
        createdAt: 2
      }
      admitted.messages.push(active)
      const main = host([admitted])
      const view = mounted(main.sdk, 'left')
      await view.workspace.reload()
      main.emit(deltaFrame('left', 'new-turn', 1, 'new-answer', ' +live'))
      expect(
        view.workspace.adapter.messages.map(({ id, content, status }) => ({ id, content, status }))
      ).toEqual([
        { id: 'left-answer', content: 'left visible answer', status: 'complete' },
        { id: 'new-answer', content: 'new answer +live', status: 'streaming' }
      ])

      const liveParts = [
        { type: 'text', text: 'new answer +live' },
        { type: 'tool-call', id: 'new-tool', name: 'tuff_search_files', status: 'running' }
      ]
      const structural = { ...active, content: 'new answer +live', parts: liveParts }
      main.emit(snapshotFrame('left', 'new-turn', 2, structural))
      expect(view.workspace.adapter.messages[1]).toMatchObject({
        content: 'new answer +live',
        status: 'streaming',
        parts: liveParts
      })
      for (const frame of [
        deltaFrame('left', 'old-turn', 100, 'new-answer', ' OLD'),
        snapshotFrame('left', 'old-turn', 101, {
          ...active,
          meta: { turnId: 'old-turn' },
          content: 'old snapshot replacing active answer',
          parts: []
        }),
        snapshotFrame('left', 'old-turn', 102, {
          ...admitted.messages[0],
          id: 'extra-old-answer',
          content: 'old extra answer',
          status: 'streaming'
        })
      ]) {
        main.emit(frame)
        expect(
          view.workspace.adapter.messages.map(({ id, content, status }) => ({
            id,
            content,
            status
          })),
          `old frame ${frame.seq}`
        ).toEqual([
          { id: 'left-answer', content: 'left visible answer', status: 'complete' },
          { id: 'new-answer', content: 'new answer +live', status: 'streaming' }
        ])
        expect(view.workspace.adapter.messages[1].parts).toEqual(liveParts)
      }
      main.emit(deltaFrame('left', 'new-turn', 3, 'new-answer', ' after tool'))
      expect(view.workspace.adapter.messages[1]).toMatchObject({
        content: 'new answer +live after tool',
        status: 'streaming',
        parts: [...liveParts, { type: 'text', text: ' after tool' }]
      })

      const durableParts = [
        { type: 'text', text: 'Main final answer' },
        {
          type: 'tool-call',
          id: 'new-tool',
          name: 'tuff_search_files',
          status: 'done',
          output: 'Main saved result'
        }
      ]
      const durable: ConversationWorkspaceState = {
        ...admitted,
        status: 'running',
        revision: 2,
        messages: [
          admitted.messages[0],
          { ...active, content: 'Main final answer', status: 'complete', parts: durableParts }
        ]
      }
      main.publish(durable)
      main.emit(snapshotFrame('left', 'new-turn', 4, durable.messages[1]))
      main.publish({ ...durable, revision: 3, status: 'idle', activeTurnId: undefined })
      main.emit(deltaFrame('left', 'new-turn', 5, 'new-answer', ' DELAYED'))
      expect(
        view.workspace.adapter.messages.map(({ id, content, status }) => ({ id, content, status }))
      ).toEqual([
        { id: 'left-answer', content: 'left visible answer', status: 'complete' },
        { id: 'new-answer', content: 'Main final answer', status: 'complete' }
      ])
      expect(view.workspace.adapter.messages[1].parts).toEqual(durableParts)
    }
  )

  it('unloaded and navigation-gap frames create no visible rows, but the loaded active turn still streams', async () => {
    const left = hostState('left', leftSettings)
    left.status = 'running'
    left.activeTurnId = 'left-turn'
    left.messages[0] = {
      ...left.messages[0],
      status: 'streaming',
      meta: { turnId: 'left-turn' }
    }
    const right = hostState('right', rightSettings, 'project-right')
    right.status = 'running'
    right.activeTurnId = 'right-turn'
    right.messages[0] = {
      ...right.messages[0],
      status: 'streaming',
      meta: { turnId: 'right-turn' }
    }
    const main = host([left, right])
    const leftRead = Promise.withResolvers<ConversationWorkspaceState | null>()
    const rightRead = Promise.withResolvers<ConversationWorkspaceState | null>()
    vi.spyOn(main.sdk, 'get').mockImplementation((id) =>
      id === 'left' ? leftRead.promise : rightRead.promise
    )
    cleanup.push(() => {
      leftRead.resolve(left)
      rightRead.resolve(right)
    })
    const view = mounted(main.sdk, 'left')
    main.emit(snapshotFrame('left', 'left-turn', 10, left.messages[0]))
    main.emit(deltaFrame('left', 'left-turn', 11, 'left-answer', ' UNLOADED'))
    expect(view.workspace.adapter.messages).toEqual([])
    leftRead.resolve(left)
    await view.workspace.reload()

    // currentId switches before the Vue watcher discards the previous host mirror.
    view.id.value = 'right'
    main.emit(snapshotFrame('right', 'right-turn', 10, right.messages[0]))
    expect(view.workspace.adapter.messages.map(({ id, content }) => ({ id, content }))).toEqual([
      { id: 'left-answer', content: 'left visible answer' }
    ])
    await nextTick()
    main.emit(snapshotFrame('right', 'right-turn', 11, right.messages[0]))
    main.emit(deltaFrame('right', 'right-turn', 12, 'right-answer', ' NAVIGATION GAP'))
    main.emit(snapshotFrame('left', 'left-turn', 12, left.messages[0]))
    expect(view.workspace.adapter.messages).toEqual([])

    rightRead.resolve(right)
    await view.workspace.reload()
    main.emit(deltaFrame('right', 'right-turn', 1, 'right-answer', ' +live'))
    expect(
      view.workspace.adapter.messages.map(({ id, content, status }) => ({ id, content, status }))
    ).toEqual([{ id: 'right-answer', content: 'right visible answer +live', status: 'streaming' }])
  })
})
