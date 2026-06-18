import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  WorkflowDefinition,
  WorkflowReviewQueueItemStatus,
  WorkflowRunRecord
} from '@talex-touch/tuff-intelligence'
import type { WorkflowReviewQueueItem } from './useWorkflowEditor'

async function loadTarget() {
  vi.resetModules()

  const agentsSdk = {
    listAll: vi.fn(async () => [
      {
        id: 'builtin.workflow-agent',
        name: 'Workflow Agent',
        enabled: true,
        capabilities: []
      }
    ])
  }

  const savedWorkflows: unknown[] = []
  const intelligenceSdk = {
    workflowList: vi.fn(async (): Promise<WorkflowDefinition[]> => []),
    workflowSave: vi.fn(async (workflow: unknown) => {
      savedWorkflows.push(workflow)
      return workflow
    }),
    workflowDelete: vi.fn(),
    workflowRun: vi.fn(),
    workflowHistory: vi.fn(async () => []),
    workflowReviewUpdate: vi.fn(async ({ runId, itemId, status, error }) => ({
      id: runId,
      workflowId: 'workflow-1',
      workflowName: 'Review Workflow',
      status: 'completed',
      triggerType: 'manual',
      inputs: {},
      outputs: {},
      startedAt: 1,
      completedAt: 2,
      steps: [
        {
          id: 'run-step-1',
          workflowStepId: 'model-step',
          kind: 'model',
          name: 'Summarize',
          status: 'completed',
          input: { capabilityId: 'text.summarize' },
          output: {
            result: 'summary text',
            provider: 'openai',
            model: 'gpt-4.1-mini',
            traceId: 'trace-1',
            capabilityId: 'text.summarize',
            latency: 980.4,
            usage: {
              totalTokens: 42
            }
          },
          metadata: {
            modelContract: {
              output: {
                riskLevel: 'medium'
              }
            }
          },
          completedAt: 2
        }
      ],
      metadata: {
        reviewQueue: {
          items: {
            [itemId]: { status, error, updatedAt: 3 }
          }
        }
      }
    })),
    agentSessionGetState: vi.fn(async () => ({ pendingApprovals: [] })),
    agentToolApprove: vi.fn()
  }

  vi.doMock('@talex-touch/utils/renderer/hooks/use-agents-sdk', () => ({
    useAgentsSdk: () => agentsSdk
  }))

  vi.doMock('@talex-touch/utils/renderer/hooks/use-intelligence-sdk', () => ({
    useIntelligenceSdk: () => intelligenceSdk
  }))

  vi.doMock('~/modules/lang/useI18nText', () => ({
    useI18nText: () => ({
      t: (key: string) => key
    })
  }))

  const target = await import('./useWorkflowEditor')
  return {
    ...target,
    agentsSdk,
    intelligenceSdk,
    savedWorkflows
  }
}

describe('useWorkflowEditor', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses the registered builtin workflow agent for new agent steps', async () => {
    const { DEFAULT_WORKFLOW_AGENT_ID, useWorkflowEditor } = await loadTarget()

    const editor = useWorkflowEditor()

    expect(editor.workflowDraft.value.steps[0]?.agentId).toBe(DEFAULT_WORKFLOW_AGENT_ID)

    editor.addStep('agent')

    expect(editor.workflowDraft.value.steps[1]?.agentId).toBe(DEFAULT_WORKFLOW_AGENT_ID)
  })

  it('rejects empty agent steps instead of silently defaulting on save', async () => {
    const { intelligenceSdk, useWorkflowEditor } = await loadTarget()

    const editor = useWorkflowEditor()
    editor.workflowDraft.value.name = 'Workflow'
    editor.workflowDraft.value.steps[0]!.agentId = ''

    await expect(editor.saveWorkflow()).rejects.toMatchObject({
      code: 'agent_required',
      stepUid: editor.workflowDraft.value.steps[0]!.uid
    })

    expect(intelligenceSdk.workflowSave).not.toHaveBeenCalled()
  })

  it('maps existing empty agent steps to the registered builtin workflow agent', async () => {
    const { DEFAULT_WORKFLOW_AGENT_ID, intelligenceSdk, useWorkflowEditor } = await loadTarget()
    intelligenceSdk.workflowList.mockResolvedValueOnce([
      {
        id: 'workflow-empty-agent',
        name: 'Existing Workflow',
        version: '1',
        enabled: true,
        triggers: [{ type: 'manual', enabled: true }],
        contextSources: [],
        toolSources: ['builtin'],
        approvalPolicy: {
          requireApprovalAtOrAbove: 'high',
          autoApproveReadOnly: true
        },
        steps: [
          {
            id: 'agent-step',
            name: 'Agent Step',
            kind: 'agent'
          }
        ],
        metadata: {}
      }
    ] satisfies WorkflowDefinition[])

    const editor = useWorkflowEditor()
    await editor.loadWorkflows()

    expect(editor.workflowDraft.value.steps[0]?.agentId).toBe(DEFAULT_WORKFLOW_AGENT_ID)
  })

  it('preserves prompt and tool workflow step contracts when saving mixed workflows', async () => {
    const { intelligenceSdk, useWorkflowEditor } = await loadTarget()

    const editor = useWorkflowEditor()
    editor.workflowDraft.value.name = 'Mixed Workflow'
    editor.workflowDraft.value.steps[0]!.kind = 'prompt'
    editor.workflowDraft.value.steps[0]!.name = 'Summarize'
    editor.workflowDraft.value.steps[0]!.instruction = 'Summarize the input'
    editor.workflowDraft.value.steps[0]!.input = '{"text":"hello"}'
    editor.addStep('tool')
    editor.workflowDraft.value.steps[1]!.name = 'Read Clipboard'
    editor.workflowDraft.value.steps[1]!.toolId = 'clipboard.read'
    editor.workflowDraft.value.steps[1]!.toolSource = 'mcp'
    editor.workflowDraft.value.steps[1]!.input = '{"limit":3}'

    await editor.saveWorkflow()

    const workflow = intelligenceSdk.workflowSave.mock.calls[0]?.[0] as
      | WorkflowDefinition
      | undefined
    expect(workflow?.steps).toMatchObject([
      {
        kind: 'prompt',
        prompt: 'Summarize the input',
        input: { text: 'hello' },
        agentId: undefined,
        toolId: undefined
      },
      {
        kind: 'tool',
        toolId: 'clipboard.read',
        toolSource: 'mcp',
        input: { limit: 3 },
        agentId: undefined
      }
    ])
  })

  it('saves model workflow steps as Use Model contracts', async () => {
    const { intelligenceSdk, useWorkflowEditor } = await loadTarget()

    const editor = useWorkflowEditor()
    editor.workflowDraft.value.name = 'Use Model Workflow'
    editor.workflowDraft.value.steps[0]!.kind = 'model'
    editor.workflowDraft.value.steps[0]!.name = 'Summarize with Model'
    editor.workflowDraft.value.steps[0]!.instruction = 'Summarize the input'
    editor.workflowDraft.value.steps[0]!.input =
      '{"capabilityId":"text.summarize","text":"hello","outputFormat":"markdown"}'
    editor.workflowDraft.value.steps[0]!.inputSources =
      '[{"type":"workflow.input","key":"text","label":"Input"}]'
    editor.workflowDraft.value.steps[0]!.outputContract =
      '{"format":"json","schema":{"type":"object"},"reviewPolicy":"preview","riskLevel":"medium"}'

    await editor.saveWorkflow()

    const workflow = intelligenceSdk.workflowSave.mock.calls[0]?.[0] as
      | WorkflowDefinition
      | undefined
    expect(workflow?.steps).toMatchObject([
      {
        kind: 'model',
        prompt: 'Summarize the input',
        input: {
          capabilityId: 'text.summarize',
          text: 'hello',
          outputFormat: 'markdown'
        },
        inputSources: [{ type: 'workflow.input', key: 'text', label: 'Input' }],
        output: {
          format: 'json',
          schema: { type: 'object' },
          reviewPolicy: 'preview',
          riskLevel: 'medium'
        },
        agentId: undefined,
        toolId: undefined
      }
    ])
  })

  it('builds a page-local review queue from completed model output and gates clipboard replacement', async () => {
    const { intelligenceSdk, useWorkflowEditor } = await loadTarget()
    const writeText = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    const run = {
      id: 'run-1',
      workflowId: 'workflow-1',
      workflowName: 'Review Workflow',
      status: 'completed',
      triggerType: 'manual',
      inputs: {},
      outputs: {},
      startedAt: 1,
      completedAt: 2,
      steps: [
        {
          id: 'run-step-1',
          workflowStepId: 'model-step',
          kind: 'model',
          name: 'Summarize',
          status: 'completed',
          input: { capabilityId: 'text.summarize' },
          output: {
            result: 'summary text',
            provider: 'openai',
            model: 'gpt-4.1-mini',
            traceId: 'trace-1',
            capabilityId: 'text.summarize',
            latency: 980.4,
            usage: {
              totalTokens: 42
            }
          },
          metadata: {
            modelContract: {
              output: {
                riskLevel: 'medium'
              }
            }
          },
          completedAt: 2
        }
      ],
      metadata: {}
    } satisfies WorkflowRunRecord

    intelligenceSdk.workflowRun.mockResolvedValueOnce(run)

    const editor = useWorkflowEditor()
    editor.workflowDraft.value.name = 'Review Workflow'
    editor.workflowDraft.value.steps[0]!.kind = 'model'
    editor.workflowDraft.value.steps[0]!.name = 'Summarize'
    editor.workflowDraft.value.steps[0]!.instruction = 'Summarize the input'
    editor.workflowDraft.value.steps[0]!.input = '{"capabilityId":"text.summarize"}'

    await editor.runWorkflow()

    const item = editor.reviewQueueItems.value[0]
    expect(item).toMatchObject({
      id: 'run-1:model-step',
      runId: 'run-1',
      workflowId: 'workflow-1',
      workflowName: 'Review Workflow',
      stepId: 'model-step',
      stepName: 'Summarize',
      capabilityId: 'text.summarize',
      traceId: 'trace-1',
      provider: 'openai',
      model: 'gpt-4.1-mini',
      latency: 980,
      totalTokens: 42,
      riskLevel: 'medium',
      text: 'summary text',
      status: 'pending'
    })

    await editor.copyReviewItemToClipboard(item!.id)

    expect(writeText).toHaveBeenCalledWith('summary text')
    expect(intelligenceSdk.workflowReviewUpdate).toHaveBeenCalledWith({
      runId: 'run-1',
      itemId: item!.id,
      status: 'copied',
      error: undefined
    })
    expect(editor.reviewQueueItems.value[0]?.status).toBe('copied')

    writeText.mockClear()

    const firstReplace = await editor.replaceClipboardWithReviewItem(item!.id)

    expect(firstReplace.confirmed).toBe(false)
    expect(editor.reviewQueueReplaceConfirmId.value).toBe(item!.id)
    expect(writeText).not.toHaveBeenCalled()

    const secondReplace = await editor.replaceClipboardWithReviewItem(item!.id)

    expect(secondReplace.confirmed).toBe(true)
    expect(writeText).toHaveBeenCalledWith('summary text')
    expect(editor.reviewQueueReplaceConfirmId.value).toBeNull()
    expect(editor.reviewQueueItems.value[0]?.status).toBe('clipboard_replaced')

    await editor.dismissReviewItem(item!.id)

    expect(editor.reviewQueueItems.value).toHaveLength(0)
  })

  it('keeps failed review queue items recoverable', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('Clipboard permission denied')
    })
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    const { intelligenceSdk, useWorkflowEditor } = await loadTarget()
    const run = {
      id: 'run-1',
      workflowId: 'workflow-1',
      workflowName: 'Review Workflow',
      status: 'completed',
      triggerType: 'manual',
      inputs: {},
      outputs: {},
      startedAt: 1,
      completedAt: 2,
      steps: [
        {
          id: 'run-step-1',
          workflowStepId: 'model-step',
          kind: 'model',
          name: 'Summarize',
          status: 'completed',
          input: { capabilityId: 'text.summarize' },
          output: {
            result: 'summary text',
            provider: 'openai',
            model: 'gpt-4.1-mini',
            traceId: 'trace-1',
            capabilityId: 'text.summarize'
          },
          metadata: {
            modelContract: {
              output: {
                riskLevel: 'low'
              }
            }
          },
          completedAt: 2
        }
      ],
      metadata: {}
    } satisfies WorkflowRunRecord

    intelligenceSdk.workflowRun.mockResolvedValueOnce(run)

    const editor = useWorkflowEditor()
    editor.workflowDraft.value.name = 'Review Workflow'
    editor.workflowDraft.value.steps[0]!.kind = 'model'
    editor.workflowDraft.value.steps[0]!.name = 'Summarize'
    editor.workflowDraft.value.steps[0]!.instruction = 'Summarize the input'
    editor.workflowDraft.value.steps[0]!.input = '{"capabilityId":"text.summarize"}'

    await editor.runWorkflow()

    const item = editor.reviewQueueItems.value[0]
    await expect(editor.copyReviewItemToClipboard(item!.id)).rejects.toThrow(
      'Clipboard permission denied'
    )

    expect(intelligenceSdk.workflowReviewUpdate).toHaveBeenLastCalledWith({
      runId: 'run-1',
      itemId: item!.id,
      status: 'failed',
      error: 'Clipboard permission denied'
    })
    expect(editor.reviewQueueItems.value[0]).toMatchObject({
      status: 'failed',
      error: 'Clipboard permission denied'
    })

    editor.reviewQueueReplaceConfirmId.value = item!.id
    await editor.resetReviewItemStatus(item!.id)

    expect(intelligenceSdk.workflowReviewUpdate).toHaveBeenLastCalledWith({
      runId: 'run-1',
      itemId: item!.id,
      status: 'pending',
      error: undefined
    })
    expect(editor.reviewQueueItems.value[0]).toMatchObject({
      status: 'pending',
      error: undefined
    })
    expect(editor.reviewQueueReplaceConfirmId.value).toBeNull()
  })

  it('summarizes Use Model run metadata for runtime display', async () => {
    const { __test } = await loadTarget()

    expect(
      __test.summarizeRunStep({
        id: 'run-step-1',
        workflowStepId: 'model-step',
        kind: 'model',
        name: 'Summarize',
        status: 'completed',
        input: { capabilityId: 'text.summarize' },
        output: {
          result: 'summary text',
          provider: 'openai',
          model: 'gpt-4.1-mini',
          traceId: 'trace-1',
          latency: 1234.4,
          usage: {
            promptTokens: 10,
            completionTokens: 5,
            totalTokens: 15
          }
        },
        metadata: {
          errorCode: 'IGNORED_METADATA_ERROR'
        }
      })
    ).toEqual({
      capabilityId: 'text.summarize',
      provider: 'openai',
      model: 'gpt-4.1-mini',
      traceId: 'trace-1',
      latency: 1234,
      totalTokens: 15,
      errorCode: 'IGNORED_METADATA_ERROR'
    })
  })

  it('summarizes and filters review queue items for the workbench view', async () => {
    const { filterReviewQueueItems, summarizeReviewQueueItems } = await loadTarget()
    const rawItems: Array<{ id: string; status: WorkflowReviewQueueItemStatus }> = [
      { id: 'item-pending', status: 'pending' },
      { id: 'item-copied', status: 'copied' },
      { id: 'item-replaced', status: 'clipboard_replaced' },
      { id: 'item-failed', status: 'failed' },
      { id: 'item-failed-2', status: 'failed' }
    ]
    const items: WorkflowReviewQueueItem[] = rawItems.map((item) => ({
      ...item,
      runId: 'run-1',
      workflowId: 'workflow-1',
      stepId: item.id,
      riskLevel: 'low' as const,
      text: item.id,
      preview: item.id,
      createdAt: 1
    }))

    expect(summarizeReviewQueueItems(items)).toEqual({
      total: 5,
      pending: 1,
      copied: 1,
      clipboardReplaced: 1,
      failed: 2
    })
    expect(filterReviewQueueItems(items, 'all').map((item) => item.id)).toEqual([
      'item-pending',
      'item-copied',
      'item-replaced',
      'item-failed',
      'item-failed-2'
    ])
    expect(filterReviewQueueItems(items, 'failed').map((item) => item.id)).toEqual([
      'item-failed',
      'item-failed-2'
    ])
  })

  it('resolves review queue next-action hints by item status', async () => {
    const { resolveReviewQueueActionHint } = await loadTarget()

    expect(resolveReviewQueueActionHint({ status: 'pending' })).toEqual({
      tone: 'default',
      labelKey: 'reviewHintPending'
    })
    expect(resolveReviewQueueActionHint({ status: 'copied' })).toEqual({
      tone: 'success',
      labelKey: 'reviewHintCopied'
    })
    expect(resolveReviewQueueActionHint({ status: 'clipboard_replaced' })).toEqual({
      tone: 'success',
      labelKey: 'reviewHintClipboardReplaced'
    })
    expect(resolveReviewQueueActionHint({ status: 'failed', error: 'Clipboard denied' })).toEqual({
      tone: 'warning',
      labelKey: 'reviewHintFailedWithError'
    })
  })

  it('creates labeled review queue metadata chips for the workbench', async () => {
    const { resolveReviewQueueMetaChips } = await loadTarget()

    expect(
      resolveReviewQueueMetaChips({
        workflowId: 'workflow-1',
        workflowName: 'Review Workflow',
        stepId: 'model-step',
        stepName: 'Summarize',
        capabilityId: 'text.summarize',
        provider: 'openai',
        model: 'gpt-4.1-mini',
        traceId: 'trace-1',
        latency: 980.4,
        totalTokens: 42,
        riskLevel: 'medium',
        status: 'failed',
        error: 'Clipboard permission denied'
      })
    ).toEqual([
      {
        labelKey: 'reviewMetaSource',
        fallback: 'Source',
        value: 'Review Workflow / Summarize'
      },
      {
        labelKey: 'reviewMetaCapability',
        fallback: 'Capability',
        value: 'text.summarize'
      },
      {
        labelKey: 'reviewMetaProvider',
        fallback: 'Provider',
        value: 'openai / gpt-4.1-mini'
      },
      {
        labelKey: 'reviewMetaTrace',
        fallback: 'Trace',
        value: 'trace-1'
      },
      {
        labelKey: 'reviewMetaLatency',
        fallback: 'Latency',
        value: '980ms'
      },
      {
        labelKey: 'reviewMetaTokens',
        fallback: 'Tokens',
        value: '42'
      },
      {
        labelKey: 'reviewMetaRisk',
        fallback: 'Risk',
        value: 'medium',
        tone: 'warning'
      },
      {
        labelKey: 'reviewMetaFailure',
        fallback: 'Failure',
        value: 'Clipboard permission denied',
        tone: 'warning'
      }
    ])
  })
})
