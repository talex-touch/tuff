// @vitest-environment jsdom
import type { WorkflowRunRecord } from '@talex-touch/tuff-intelligence'
import type { VueWrapper } from '@vue/test-utils'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The Workflows page when a run fails: a run the user's own usage limit stopped is recorded with
 * the stable code main writes for it (`USAGE_LIMIT_REACHED: AI usage limit reached.`) on the run
 * and its steps, and the page tells it in the interface's words with the way to Audit — on the run
 * just started and on one reopened from history. Every other failure keeps its own message.
 */

const REFUSED = 'USAGE_LIMIT_REACHED: AI usage limit reached.'
const OTHER_FAILURE = 'AI_RUN_FAILED: AI run failed.'

const sdk = vi.hoisted(() => ({
  workflowList: vi.fn(),
  workflowRun: vi.fn(),
  workflowHistory: vi.fn(),
  agentSessionGetState: vi.fn(),
  listAll: vi.fn()
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

vi.mock('@talex-touch/utils/renderer', () => ({
  useIntelligenceSdk: () => ({
    workflowList: sdk.workflowList,
    workflowRun: sdk.workflowRun,
    workflowHistory: sdk.workflowHistory,
    agentSessionGetState: sdk.agentSessionGetState
  }),
  useAgentsSdk: () => ({ listAll: sdk.listAll })
}))
vi.mock('vue-router', () => ({
  useRouter: () => router,
  useRoute: () => ({ matched: [], name: undefined })
}))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: unknown) =>
      params && typeof params === 'object' ? `${key}:${JSON.stringify(params)}` : key,
    locale: { value: 'zh-CN' }
  })
}))
vi.mock('vue-sonner', () => ({ toast }))
vi.mock('~/components/base/template/ViewTemplate.vue', () => ({
  default: { name: 'ViewTemplate', props: ['title'], template: '<main><slot /></main>' }
}))

import IntelligenceWorkflowPage from './IntelligenceWorkflowPage.vue'

function failedRun(error: string): WorkflowRunRecord {
  return {
    id: 'run-1',
    workflowId: 'workflow-1',
    workflowName: 'Morning digest',
    status: 'failed',
    triggerType: 'manual',
    inputs: {},
    error,
    steps: [
      {
        id: 'run-step-1',
        workflowStepId: 'step-1',
        kind: 'agent',
        name: 'Agent Step 1',
        status: 'failed',
        error,
        startedAt: 1,
        completedAt: 2
      }
    ],
    startedAt: 1,
    completedAt: 2
  }
}

const mounted: VueWrapper[] = []

async function mountPage(): Promise<VueWrapper> {
  const wrapper = mount(IntelligenceWorkflowPage)
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

async function run(wrapper: VueWrapper): Promise<void> {
  const button = wrapper
    .findAll('button')
    .find((candidate) => candidate.text() === 'intelligence.workflow.run')!
  await button.trigger('click')
  await flushPromises()
}

function stepErrors(wrapper: VueWrapper): string[] {
  return wrapper.findAll('.small-card .runtime-error').map((node) => node.text())
}

beforeEach(() => {
  sdk.listAll.mockResolvedValue([])
  sdk.workflowList.mockResolvedValue([])
  sdk.workflowHistory.mockResolvedValue([])
  sdk.agentSessionGetState.mockResolvedValue({ pendingApprovals: [] })
  sdk.workflowRun.mockReset()
  for (const spy of [router.push, toast.error, toast.success, toast.info, toast.warning])
    spy.mockReset()
})

afterEach(() => {
  while (mounted.length > 0) mounted.pop()!.unmount()
})

describe('IntelligenceWorkflowPage: a run the usage limit stopped', () => {
  it('says the limit is used up, in the interface’s words, and opens Audit', async () => {
    sdk.workflowRun.mockResolvedValue(failedRun(REFUSED))
    const wrapper = await mountPage()
    await run(wrapper)

    const notice = wrapper.get('[data-testid="workflow-usage-limit"]')
    expect(notice.text()).toContain('intelligence.errorRecovery.usageLimitTitle')
    expect(notice.text()).toContain('intelligence.errorRecovery.usageLimitDetailNoTime')
    expect(stepErrors(wrapper)).toEqual(['intelligence.errorRecovery.usageLimitTitle'])
    expect(wrapper.text()).not.toContain('USAGE_LIMIT_REACHED')

    expect(toast.error).toHaveBeenCalledWith('intelligence.errorRecovery.usageLimitTitle')
    expect(toast.success).not.toHaveBeenCalled()

    await wrapper.get('[data-testid="workflow-open-usage-limits"]').trigger('click')
    expect(router.push).toHaveBeenCalledWith('/setting/intelligence/audit')
  })

  it('tells the same on a refused run reopened from history', async () => {
    sdk.workflowHistory.mockResolvedValue([failedRun(REFUSED)])
    const wrapper = await mountPage()
    expect(wrapper.find('[data-testid="workflow-usage-limit"]').exists()).toBe(false)

    await wrapper.get('.history-item').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="workflow-usage-limit"]').exists()).toBe(true)
    expect(stepErrors(wrapper)).toEqual(['intelligence.errorRecovery.usageLimitTitle'])
  })

  it('keeps any other failure’s own message and offers no way to Audit', async () => {
    sdk.workflowRun.mockResolvedValue(failedRun(OTHER_FAILURE))
    const wrapper = await mountPage()
    await run(wrapper)

    expect(wrapper.find('[data-testid="workflow-usage-limit"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="workflow-open-usage-limits"]').exists()).toBe(false)
    expect(stepErrors(wrapper)).toEqual([OTHER_FAILURE])
    expect(toast.error).not.toHaveBeenCalledWith('intelligence.errorRecovery.usageLimitTitle')
  })
})
