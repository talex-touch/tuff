import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkflowDefinition, WorkflowRunRecord } from '@talex-touch/tuff-intelligence'

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
            capabilityId: 'text.summarize'
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
      text: 'summary text',
      status: 'pending'
    })

    await editor.copyReviewItemToClipboard(item!.id)

    expect(writeText).toHaveBeenCalledWith('summary text')
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

    editor.dismissReviewItem(item!.id)

    expect(editor.reviewQueueItems.value).toHaveLength(0)
  })
})
