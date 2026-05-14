import { describe, expect, it, vi } from 'vitest'
import type { WorkflowDefinition } from '@talex-touch/tuff-intelligence'

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
})
