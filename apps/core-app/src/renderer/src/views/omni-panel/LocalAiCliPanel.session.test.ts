// @vitest-environment jsdom
/* eslint-disable vue/one-component-per-file */

import type {
  LocalAiCliProviderId,
  LocalAiCliProviderStatus,
  LocalAiCliStatus
} from '@talex-touch/utils/transport/events/local-ai-cli'
import type { VueWrapper } from '@vue/test-utils'
import { LocalAiCliEvents } from '@talex-touch/utils/transport/events/local-ai-cli'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'

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

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    cols = 92
    rows = 24
    loadAddon(): void {}
    open(): void {}
    dispose(): void {}
    writeln(): void {}
    onData(): { dispose: () => void } {
      return { dispose: () => undefined }
    }
  }
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit(): void {}
  }
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
  streamState.cancel = vi.fn()
  statusState.current = localAiStatus([providerStatus('pi')])

  transportOnMock.mockReturnValue(() => undefined)
  transportSendMock.mockImplementation(async (event: unknown) => {
    if (event === LocalAiCliEvents.status.get) return statusState.current
    if (event === LocalAiCliEvents.status.openSettings) return true
    if (event === LocalAiCliEvents.terminal.create) return { sessionId: 'term-1' }
    if (event === LocalAiCliEvents.terminal.kill) return undefined
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
    expect(createCall?.[1]).toEqual({
      provider: 'pi',
      access: 'answer-only',
      projectId: 'p1',
      sessionRef: 'ref-9',
      cols: 92,
      rows: 24
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
