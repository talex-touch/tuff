// @vitest-environment jsdom
import type { AgentDescriptor } from '@talex-touch/utils'
import type { VueWrapper } from '@vue/test-utils'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The agent detail pane when a task fails: a task the user's own usage limit stopped arrives with
 * the stable code main records for it (`USAGE_LIMIT_REACHED: AI usage limit reached.`) and is told
 * in the interface's words, with the way to Audit; every other failure keeps its own message.
 */

const REFUSED = 'USAGE_LIMIT_REACHED: AI usage limit reached.'

type TaskListener = (payload: Record<string, unknown>) => void

const sdk = vi.hoisted(() => ({
  listeners: new Map<string, TaskListener>(),
  execute: vi.fn(),
  getTaskStatus: vi.fn(),
  cancel: vi.fn()
}))
const router = vi.hoisted(() => ({ push: vi.fn() }))
const toast = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
  warning: vi.fn()
}))

/** Reduced motion: TxButton draws no ripple, so no ripple timer outlives the file. */
vi.hoisted(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true)
  }))
})

vi.mock('@talex-touch/utils/renderer', () => {
  const on = (name: string) => (listener: TaskListener) => {
    sdk.listeners.set(name, listener)
    return () => sdk.listeners.delete(name)
  }
  return {
    useAgentsSdk: () => ({
      execute: sdk.execute,
      getTaskStatus: sdk.getTaskStatus,
      cancel: sdk.cancel,
      onTaskStarted: on('started'),
      onTaskProgress: on('progress'),
      onTaskCompleted: on('completed'),
      onTaskFailed: on('failed'),
      onTaskCancelled: on('cancelled')
    })
  }
})
vi.mock('vue-router', () => ({ useRouter: () => router }))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: unknown) =>
      params && typeof params === 'object' ? `${key}:${JSON.stringify(params)}` : key,
    locale: { value: 'zh-CN' }
  })
}))
vi.mock('vue-sonner', () => ({ toast }))

import AgentDetail from './AgentDetail.vue'

const AGENT: AgentDescriptor = {
  id: 'builtin.file-agent',
  name: 'File Agent',
  description: 'Works with files.',
  version: '1.0.0',
  capabilities: [],
  enabled: true
}

const mounted: VueWrapper[] = []

async function startTask(): Promise<VueWrapper> {
  const wrapper = mount(AgentDetail, { props: { agent: AGENT } })
  mounted.push(wrapper)
  await wrapper.find('textarea, input').setValue('list my downloads')
  const execute = wrapper
    .findAll('button')
    .find((button) => button.text() === 'intelligence.agents.execute')!
  await execute.trigger('click')
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  sdk.listeners.clear()
  sdk.execute.mockImplementation(async (task: { id: string }) => ({ taskId: task.id }))
  sdk.getTaskStatus.mockResolvedValue({ status: 'running' })
  for (const spy of [router.push, toast.error, toast.success, toast.info, toast.warning])
    spy.mockReset()
})

afterEach(() => {
  while (mounted.length > 0) mounted.pop()!.unmount()
  vi.useRealTimers()
})

function taskId(): string {
  return (sdk.execute.mock.calls.at(-1)![0] as { id: string }).id
}

describe('AgentDetail: a task the usage limit stopped', () => {
  it('says the limit is used up, in the interface’s words, and opens Audit', async () => {
    const wrapper = await startTask()
    sdk.listeners.get('failed')!({ taskId: taskId(), error: REFUSED })
    await flushPromises()

    const notice = wrapper.get('[data-testid="agent-task-usage-limit"]')
    expect(notice.text()).toContain('intelligence.errorRecovery.usageLimitTitle')
    expect(notice.text()).toContain('intelligence.errorRecovery.usageLimitDetailNoTime')
    expect(notice.text()).not.toContain('USAGE_LIMIT_REACHED')
    expect(toast.error).toHaveBeenCalledWith('intelligence.errorRecovery.usageLimitTitle')

    await wrapper.get('[data-testid="agent-task-open-usage-limits"]').trigger('click')
    expect(router.push).toHaveBeenCalledWith('/setting/intelligence/audit')
  })

  it('reads the same code off a completed-but-failed result', async () => {
    const wrapper = await startTask()
    sdk.listeners.get('completed')!({
      taskId: taskId(),
      result: { agentId: AGENT.id, success: false, error: REFUSED }
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="agent-task-usage-limit"]').exists()).toBe(true)
    expect(toast.error).toHaveBeenCalledWith('intelligence.errorRecovery.usageLimitTitle')
  })

  it('keeps any other failure’s own message and offers no way to Audit', async () => {
    const wrapper = await startTask()
    sdk.listeners.get('failed')!({ taskId: taskId(), error: 'AI_RUN_FAILED: AI run failed.' })
    await flushPromises()

    expect(wrapper.find('[data-testid="agent-task-usage-limit"]').exists()).toBe(false)
    expect(wrapper.get('.execute-error').text()).toBe('AI_RUN_FAILED: AI run failed.')
    expect(toast.error).toHaveBeenCalledWith('AI_RUN_FAILED: AI run failed.')
  })
})
