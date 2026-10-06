// @vitest-environment jsdom
/* eslint-disable vue/one-component-per-file */

import type {
  LocalAiCliProviderId,
  LocalAiCliProviderStatus,
  LocalAiCliStatus
} from '@talex-touch/utils/transport/events/local-ai-cli'
import type { VueWrapper } from '@vue/test-utils'
import { LocalAiCliEvents } from '@talex-touch/utils/transport/events/local-ai-cli'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, onMounted, ref } from 'vue'

import LocalAiCliPanel from './components/LocalAiCliPanel.vue'

const transportSendMock = vi.hoisted(() => vi.fn())
const transportOnMock = vi.hoisted(() => vi.fn())
const transportStreamMock = vi.hoisted(() => vi.fn())
const streamState = vi.hoisted(() => ({
  requests: [] as Record<string, unknown>[],
  callbacks: undefined as
    | {
        onData: (chunk: unknown) => void
        onError: (error: unknown) => void
        onEnd: () => void
      }
    | undefined,
  cancel: vi.fn()
}))
const statusState = vi.hoisted(() => ({ current: null as unknown }))

enableAutoUnmount(afterEach)
const terminalListeners = new Map<unknown, Set<(payload: unknown) => void>>()
const terminalCreations = new Map<string, string>()
const killedSessions: string[] = []
function emitTerminal(event: unknown, payload: unknown): void {
  terminalListeners.get(event)?.forEach((listener) => listener(payload))
}
function registerTerminalCreation(payload: unknown, sessionId: string): void {
  if (!payload || typeof payload !== 'object' || !('creationToken' in payload) || typeof payload.creationToken !== 'string')
    throw new Error('Missing SDK creation cancellation token')
  terminalCreations.set(payload.creationToken, sessionId)
}
function finishTerminalKill(payload: unknown): void {
  if (!payload || typeof payload !== 'object') return
  const sessionId = 'sessionId' in payload && typeof payload.sessionId === 'string'
    ? payload.sessionId
    : 'creationToken' in payload && typeof payload.creationToken === 'string'
      ? terminalCreations.get(payload.creationToken) : undefined
  if (!sessionId || ![...terminalCreations.values()].includes(sessionId)) return
  for (const [token, id] of terminalCreations) if (id === sessionId) terminalCreations.delete(token)
  killedSessions.push(sessionId)
  emitTerminal(LocalAiCliEvents.terminal.exit, { sessionId, exitCode: null, signal: 9 })
}

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({
    send: transportSendMock,
    on: transportOnMock,
    stream: transportStreamMock
  })
}))

vi.mock('vue-i18n', () => ({
  // Keys as labels: the assertions target behaviour, not the translated prose.
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('vue-sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() }
}))

vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}))

vi.mock('@talex-touch/tuffex/button', () => ({
  TxButton: defineComponent({
    name: 'TxButton',
    props: {
      size: { type: String, default: undefined },
      variant: { type: String, default: undefined },
      disabled: { type: Boolean, default: false }
    },
    setup(props, { slots }) {
      return () =>
        // Fallthrough `onClick` from the parent lands on the real button element.
        h('button', { type: 'button', disabled: props.disabled }, slots.default?.())
    }
  })
}))

vi.mock('@talex-touch/tuffex/markdown-view', () => ({
  TxMarkdownView: defineComponent({
    name: 'TxMarkdownView',
    props: {
      content: { type: String, default: '' },
      theme: { type: String, default: undefined }
    },
    setup(props) {
      return () => h('div', { class: 'tx-markdown' }, props.content)
    }
  })
}))

vi.mock('@talex-touch/tuffex/terminal', () => ({
  TxTerminal: defineComponent({
    name: 'TxTerminal',
    props: ['readOnly', 'cols', 'rows'],
    emits: ['ready', 'data', 'resize'],
    setup(_props, { expose, emit }) {
      const output = ref('')
      const api = {
        write: async (data: string) => { output.value += data },
        reset: () => { output.value = '' },
        getSize: () => ({ cols: 92, rows: 24 }),
        focus: () => undefined
      }
      expose(api)
      onMounted(() => emit('ready', api))
      return () => h('pre', { 'data-terminal-output': '' }, output.value)
    }
  })
}))

function providerStatus(
  id: LocalAiCliProviderId,
  overrides: Partial<LocalAiCliProviderStatus> = {}
): LocalAiCliProviderStatus {
  return {
    id,
    label: id,
    enabled: true,
    installed: true,
    version: '1.0.0',
    capabilities: {
      taskRead: true,
      taskWriteApproval: true,
      terminalRead: true,
      terminalWriteApproval: true,
      taskResume: true,
      terminalResume: true
    },
    ...overrides
  }
}

function localAiStatus(providers: LocalAiCliProviderStatus[]): LocalAiCliStatus {
  return {
    betaAvailable: true,
    enabled: true,
    defaultProvider: providers[0]?.id ?? null,
    providers
  }
}

async function mountPanel(): Promise<VueWrapper> {
  const wrapper = mount(LocalAiCliPanel)
  await flushPromises()
  return wrapper
}

/** `open`/`reset`/`newTask` are the panel's exposed surface; the rest is internal state. */
function panelApi(wrapper: VueWrapper) {
  return wrapper.vm as unknown as {
    open: (draft: {
      prompt: string
      projectId?: string
      sessionRef?: string
      provider?: LocalAiCliProviderId
    }) => Promise<void>
    reset: () => Promise<void>
    newTask: () => Promise<void>
  }
}

function findButton(wrapper: VueWrapper, label: string) {
  const button = wrapper.findAll('button').find((item) => item.text() === label)
  if (!button) throw new Error(`Missing button: ${label}`)
  return button
}

async function startTask(wrapper: VueWrapper, prompt: string): Promise<void> {
  await wrapper.find('textarea').setValue(prompt)
  await findButton(wrapper, 'localAiCliPanel.run').trigger('click')
  await flushPromises()
}

/** Mirrors main: the session chunk lands first, then the terminal completion chunk. */
async function finishTask(sessionRef: string): Promise<void> {
  streamState.callbacks?.onData({
    type: 'session',
    callId: 'call',
    provider: 'pi',
    sessionRef
  })
  streamState.callbacks?.onData({ type: 'complete', callId: 'call', text: 'done' })
  await flushPromises()
}

beforeEach(() => {
  transportSendMock.mockReset()
  transportOnMock.mockReset()
  transportStreamMock.mockReset()
  streamState.requests = []
  streamState.callbacks = undefined
  terminalCreations.clear()
  killedSessions.length = 0
  streamState.cancel = vi.fn()
  statusState.current = localAiStatus([providerStatus('pi')])

  terminalListeners.clear()
  transportOnMock.mockImplementation((event: unknown, listener: (payload: unknown) => void) => {
    const listeners = terminalListeners.get(event) ?? new Set()
    listeners.add(listener)
    terminalListeners.set(event, listeners)
    return () => listeners.delete(listener)
  })
  transportSendMock.mockImplementation(async (event: unknown, payload: unknown) => {
    if (event === LocalAiCliEvents.status.get) return statusState.current
    if (event === LocalAiCliEvents.status.openSettings) return true
    if (event === LocalAiCliEvents.terminal.create) {
      registerTerminalCreation(payload, 'term-1')
      return { sessionId: 'term-1' }
    }
    if (event === LocalAiCliEvents.terminal.kill) { finishTerminalKill(payload); return undefined }
    if (event === LocalAiCliEvents.terminal.resize) return undefined
    throw new Error('Unexpected transport event from LocalAiCliPanel')
  })
  transportStreamMock.mockImplementation(
    async (
      _event: unknown,
      request: Record<string, unknown>,
      callbacks: typeof streamState.callbacks
    ) => {
      streamState.requests.push(request)
      streamState.callbacks = callbacks
      return { cancel: streamState.cancel }
    }
  )
})

describe('localAiCliPanel native session continuation', () => {
  it('locks the provider to the resumed session and unlocks it for a fresh draft', async () => {
    statusState.current = localAiStatus([providerStatus('pi'), providerStatus('codex')])
    const wrapper = await mountPanel()
    const api = panelApi(wrapper)

    await api.open({ prompt: '', projectId: 'p1', sessionRef: 'ref-1', provider: 'codex' })
    await flushPromises()

    const locked = wrapper.find('select[aria-label="localAiCliPanel.provider"]')
    expect(locked.attributes('disabled')).toBeDefined()
    expect(locked.findAll('option').map((option) => option.attributes('value'))).toEqual(['codex'])

    await api.reset()
    await api.open({ prompt: '' })
    await flushPromises()

    const unlocked = wrapper.find('select[aria-label="localAiCliPanel.provider"]')
    expect(unlocked.attributes('disabled')).toBeUndefined()
    expect(unlocked.findAll('option').map((option) => option.attributes('value'))).toEqual([
      'pi',
      'codex'
    ])
  })

  it('continues the same session on a repeated run and keeps a leaked native id out of the request', async () => {
    const wrapper = await mountPanel()
    const api = panelApi(wrapper)

    await api.open({ prompt: '', projectId: 'p1', provider: 'pi' })
    await flushPromises()
    await startTask(wrapper, 'first prompt')

    expect(streamState.requests).toEqual([
      {
        provider: 'pi',
        prompt: 'first prompt',
        access: 'answer-only',
        context: [],
        projectId: 'p1'
      }
    ])

    // Main also knows the raw native id here; it must not reach any request the panel sends.
    streamState.callbacks?.onData({
      type: 'session',
      callId: 'call',
      provider: 'pi',
      sessionRef: 'ref-9',
      nativeSessionId: 'native-raw',
      sessionFile: '/tmp/private-session.jsonl'
    })
    streamState.callbacks?.onData({ type: 'complete', callId: 'call', text: 'done' })
    await flushPromises()

    // The row is now resumable: the provider is locked and a fresh task can be started instead.
    expect(
      wrapper.find('select[aria-label="localAiCliPanel.provider"]').attributes('disabled')
    ).toBeDefined()
    expect(wrapper.findAll('button').map((item) => item.text())).toContain(
      'localAiCliPanel.newTask'
    )
    expect(streamState.requests).toHaveLength(1)

    await findButton(wrapper, 'localAiCliPanel.run').trigger('click')
    await flushPromises()

    expect(streamState.requests).toHaveLength(2)
    expect(streamState.requests[1]).toEqual({
      provider: 'pi',
      prompt: 'first prompt',
      access: 'answer-only',
      context: [],
      projectId: 'p1',
      sessionRef: 'ref-9'
    })
    expect(streamState.requests[1]?.sessionRef).toBe('ref-9')
    expect(JSON.stringify(streamState.requests)).not.toContain('native-raw')
    expect(JSON.stringify(streamState.requests)).not.toContain('private-session')
  })

  it('carries the same project and session refs into the terminal', async () => {
    const wrapper = await mountPanel()
    const api = panelApi(wrapper)

    await api.open({ prompt: '', projectId: 'p1', provider: 'pi' })
    await flushPromises()
    await startTask(wrapper, 'go')
    await finishTask('ref-9')

    await findButton(wrapper, 'localAiCliPanel.continueInTerminal').trigger('click')
    await flushPromises()

    const createCall = transportSendMock.mock.calls.find(
      ([event]) => event === LocalAiCliEvents.terminal.create
    )
    expect(createCall?.[1]).toMatchObject({
      provider: 'pi',
      access: 'answer-only',
      projectId: 'p1',
      sessionRef: 'ref-9',
    })
  })

  it('starts a genuinely fresh task in the same project after New Task', async () => {
    const wrapper = await mountPanel()
    const api = panelApi(wrapper)

    await api.open({ prompt: '', projectId: 'p1', provider: 'pi' })
    await flushPromises()
    await startTask(wrapper, 'first')
    await finishTask('ref-9')

    await findButton(wrapper, 'localAiCliPanel.newTask').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('button').map((item) => item.text())).not.toContain(
      'localAiCliPanel.newTask'
    )
    expect(
      wrapper.find('select[aria-label="localAiCliPanel.provider"]').attributes('disabled')
    ).toBeUndefined()
    expect(wrapper.find('textarea').element.value).toBe('')
    expect(wrapper.find('.LocalAiCliPanel__result').exists()).toBe(false)

    await startTask(wrapper, 'second')

    expect(streamState.requests).toHaveLength(2)
    expect(streamState.requests[1]).toEqual({
      provider: 'pi',
      prompt: 'second',
      access: 'answer-only',
      context: [],
      projectId: 'p1'
    })
    expect(streamState.requests[1]?.sessionRef).toBeUndefined()
  })

  it('drops the old project and session tuple on a project switch and on reset', async () => {
    statusState.current = localAiStatus([providerStatus('pi'), providerStatus('codex')])
    const wrapper = await mountPanel()
    const api = panelApi(wrapper)

    await api.open({ prompt: '', projectId: 'p1', provider: 'pi' })
    await flushPromises()
    await startTask(wrapper, 'first')
    await finishTask('ref-9')

    await api.open({ prompt: '', projectId: 'p2', provider: 'codex' })
    await flushPromises()

    expect(
      wrapper.find('select[aria-label="localAiCliPanel.provider"]').attributes('disabled')
    ).toBeUndefined()
    expect(wrapper.find('.LocalAiCliPanel__result').exists()).toBe(false)

    await startTask(wrapper, 'second project')

    expect(streamState.requests).toHaveLength(2)
    expect(streamState.requests[1]).toEqual({
      provider: 'codex',
      prompt: 'second project',
      access: 'answer-only',
      context: [],
      projectId: 'p2'
    })
    expect(streamState.requests[1]?.sessionRef).toBeUndefined()

    await api.reset()
    await api.open({ prompt: 'after reset', provider: 'pi' })
    await flushPromises()

    await findButton(wrapper, 'localAiCliPanel.run').trigger('click')
    await flushPromises()

    expect(streamState.requests).toHaveLength(3)
    expect(streamState.requests[2]).toEqual({
      provider: 'pi',
      prompt: 'after reset',
      access: 'answer-only',
      context: []
    })
    expect(streamState.requests[2]?.projectId).toBeUndefined()
    expect(streamState.requests[2]?.sessionRef).toBeUndefined()
  })
})

describe('localAiCliPanel agent named by the project menu', () => {
  function providerSelect(wrapper: VueWrapper) {
    return wrapper.find<HTMLSelectElement>('select[aria-label="localAiCliPanel.provider"]')
  }

  it('opens on the agent the sidebar picked, over the configured default, still switchable', async () => {
    statusState.current = {
      ...localAiStatus([providerStatus('pi'), providerStatus('codex')]),
      defaultProvider: 'pi'
    }
    const wrapper = await mountPanel()

    await panelApi(wrapper).open({ prompt: '', projectId: 'p1', provider: 'codex' })
    await flushPromises()

    expect(providerSelect(wrapper).element.value).toBe('codex')
    // A fresh task, not a resumed session: the choice is a starting point, not a lock.
    expect(providerSelect(wrapper).attributes('disabled')).toBeUndefined()

    await startTask(wrapper, 'look around')
    expect(streamState.requests).toEqual([
      {
        provider: 'codex',
        prompt: 'look around',
        access: 'answer-only',
        context: [],
        projectId: 'p1'
      }
    ])
  })

})

describe('localAiCliPanel terminal lifecycle', () => {
  async function readyPanel(): Promise<VueWrapper> {
    const wrapper = await mountPanel()
    await panelApi(wrapper).open({ prompt: '', projectId: 'p1', provider: 'pi' })
    await startTask(wrapper, 'go')
    await finishTask('ref-9')
    return wrapper
  }

  it('displays complete early output and fast exit without resurrecting input', async () => {
    const wrapper = await readyPanel()
    const output = '\u001B[32m你好\u001B[0m' + 'x'.repeat(80_000)
    transportSendMock.mockImplementation(async (event: unknown, payload: unknown) => {
      if (event === LocalAiCliEvents.terminal.create) {
        registerTerminalCreation(payload, 'fast')
        emitTerminal(LocalAiCliEvents.terminal.data, { sessionId: 'other', data: 'wrong owner' })
        emitTerminal(LocalAiCliEvents.terminal.data, { sessionId: 'fast', data: output })
        emitTerminal(LocalAiCliEvents.terminal.data, { sessionId: 'fast', data: '\r\nlast' })
        emitTerminal(LocalAiCliEvents.terminal.exit, { sessionId: 'fast', exitCode: 7 })
        return { sessionId: 'fast' }
      }
      return undefined
    })
    await findButton(wrapper, 'localAiCliPanel.continueInTerminal').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-terminal-output]').text()).toBe(output + '\r\nlast\r\n[exit 7]')
    emitTerminal(LocalAiCliEvents.terminal.data, { sessionId: 'fast', data: 'late' })
    await flushPromises()
    expect(wrapper.find('[data-terminal-output]').text()).not.toContain('late')
    expect(findButton(wrapper, 'localAiCliPanel.continueInTerminal').exists()).toBe(true)
  })

  it('cancels an unacknowledged creation on reset without reviving or closing it again after a late result', async () => {
    const wrapper = await readyPanel()
    let complete!: (result: { sessionId: string }) => void
    let creationToken: string | undefined
    const pending = new Promise<{ sessionId: string }>((resolve) => { complete = resolve })
    transportSendMock.mockImplementation(async (event: unknown, payload: unknown) => {
      if (event === LocalAiCliEvents.terminal.create) {
        if (!payload || typeof payload !== 'object' || !('creationToken' in payload) || typeof payload.creationToken !== 'string')
          throw new Error('Missing SDK creation cancellation token')
        creationToken = payload.creationToken
        registerTerminalCreation(payload, 'abandoned')
        return pending
      }
      if (event === LocalAiCliEvents.terminal.kill) finishTerminalKill(payload)
      return undefined
    })
    await findButton(wrapper, 'localAiCliPanel.continueInTerminal').trigger('click')
    await flushPromises()
    if (creationToken === undefined) throw new Error('Missing process cancellation identity')
    await panelApi(wrapper).reset()
    const cleanupAttempts = transportSendMock.mock.calls.filter(([event]) => event === LocalAiCliEvents.terminal.kill).length
    expect(cleanupAttempts).toBe(1)
    expect(terminalCreations.has(creationToken)).toBe(false)
    expect(killedSessions).toEqual(['abandoned'])
    complete({ sessionId: 'abandoned' })
    await flushPromises()

    expect(wrapper.find('[data-terminal-output]').exists()).toBe(false)
    expect(killedSessions).toEqual(['abandoned'])
    expect(transportSendMock.mock.calls.filter(([event]) => event === LocalAiCliEvents.terminal.kill)).toHaveLength(cleanupAttempts)
  })

  it('isolates replacement output and removes subscriptions on unmount', async () => {
    const wrapper = await readyPanel()
    await findButton(wrapper, 'localAiCliPanel.continueInTerminal').trigger('click')
    await flushPromises()
    await panelApi(wrapper).open({ prompt: '', projectId: 'p2', provider: 'pi' })
    await startTask(wrapper, 'new project')
    await finishTask('ref-10')
    transportSendMock.mockImplementation(async (event: unknown, payload: unknown) => {
      if (event === LocalAiCliEvents.terminal.create) {
        registerTerminalCreation(payload, 'term-2')
        return { sessionId: 'term-2' }
      }
      if (event === LocalAiCliEvents.terminal.kill) finishTerminalKill(payload)
      return undefined
    })
    await findButton(wrapper, 'localAiCliPanel.continueInTerminal').trigger('click')
    await flushPromises()
    emitTerminal(LocalAiCliEvents.terminal.data, { sessionId: 'term-1', data: 'old output' })
    emitTerminal(LocalAiCliEvents.terminal.exit, { sessionId: 'term-1', exitCode: 9 })
    emitTerminal(LocalAiCliEvents.terminal.data, { sessionId: 'term-2', data: 'new output' })
    await flushPromises()
    expect(wrapper.find('[data-terminal-output]').text()).toBe('new output')
    wrapper.unmount()
    await flushPromises()
    expect(terminalListeners.get(LocalAiCliEvents.terminal.data)?.size).toBe(0)
    expect(terminalListeners.get(LocalAiCliEvents.terminal.exit)?.size).toBe(0)
    expect(killedSessions).toEqual(['term-1', 'term-2'])
  })
})
