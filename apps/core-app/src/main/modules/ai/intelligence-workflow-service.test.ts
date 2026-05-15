import { describe, expect, it, vi } from 'vitest'
import type { WorkflowDefinition, WorkflowRunRecord } from '@talex-touch/tuff-intelligence'
import { IntelligenceWorkflowService } from './intelligence-workflow-service'

vi.mock('../database', () => ({
  databaseModule: {
    getClient: vi.fn(),
    getDb: vi.fn()
  }
}))

type WorkflowNormalizer = (
  workflow: WorkflowDefinition,
  existing?: WorkflowDefinition
) => WorkflowDefinition

function createServiceNormalizer(): WorkflowNormalizer {
  const service = new IntelligenceWorkflowService()
  return (
    service as unknown as {
      normalizeWorkflowDefinition: WorkflowNormalizer
    }
  ).normalizeWorkflowDefinition.bind(service)
}

function createRunNormalizer(): (run: WorkflowRunRecord) => WorkflowRunRecord {
  const service = new IntelligenceWorkflowService()
  return (
    service as unknown as {
      normalizeRunRecord: (run: WorkflowRunRecord) => WorkflowRunRecord
    }
  ).normalizeRunRecord.bind(service)
}

function createTemplateSeeder(existingWorkflows: WorkflowDefinition[] = []) {
  const service = new IntelligenceWorkflowService()
  const savedWorkflows: WorkflowDefinition[] = []
  const existingById = new Map(existingWorkflows.map((workflow) => [workflow.id, workflow]))
  const target = service as unknown as {
    getWorkflow: (workflowId: string) => Promise<WorkflowDefinition | null>
    saveWorkflow: (workflow: WorkflowDefinition) => Promise<WorkflowDefinition>
    seedBuiltinTemplates: () => Promise<void>
  }

  target.getWorkflow = vi.fn(async (workflowId: string) => existingById.get(workflowId) ?? null)
  target.saveWorkflow = vi.fn(async (workflow: WorkflowDefinition) => {
    savedWorkflows.push(workflow)
    return workflow
  })

  return {
    seedBuiltinTemplates: target.seedBuiltinTemplates.bind(service),
    savedWorkflows,
    getWorkflow: target.getWorkflow,
    saveWorkflow: target.saveWorkflow
  }
}

function createHydrators() {
  const service = new IntelligenceWorkflowService()
  const target = service as unknown as {
    hydrateDefinitions: (rows: unknown[], stepRows: unknown[]) => WorkflowDefinition[]
    hydrateRuns: (rows: unknown[], stepRows: unknown[]) => WorkflowRunRecord[]
  }
  return {
    hydrateDefinitions: target.hydrateDefinitions.bind(service),
    hydrateRuns: target.hydrateRuns.bind(service)
  }
}

function createWorkflow(overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
  return {
    id: 'workflow-test',
    name: 'Workflow Test',
    version: '1',
    enabled: true,
    triggers: [{ type: 'manual', enabled: true }],
    contextSources: [],
    toolSources: ['builtin'],
    steps: [
      {
        id: 'prompt-step',
        name: 'Prompt Step',
        kind: 'prompt',
        prompt: 'Summarize'
      }
    ],
    metadata: {},
    ...overrides
  }
}

describe('IntelligenceWorkflowService workflow normalization', () => {
  it('seeds all P0 builtin workflow templates with stable model steps', async () => {
    const { seedBuiltinTemplates, savedWorkflows } = createTemplateSeeder()

    await seedBuiltinTemplates()

    expect(savedWorkflows.map((workflow) => workflow.id)).toEqual([
      'builtin.organize-recent-clipboard',
      'builtin.meeting-summary',
      'builtin.batch-text-processing'
    ])
    expect(savedWorkflows.map((workflow) => workflow.metadata)).toMatchObject([
      {
        builtin: true,
        template: true,
        category: 'clipboard',
        templateVersion: 1
      },
      {
        builtin: true,
        template: true,
        category: 'meeting',
        templateVersion: 1
      },
      {
        builtin: true,
        template: true,
        category: 'batch-text',
        templateVersion: 1
      }
    ])
    expect(savedWorkflows.flatMap((workflow) => workflow.steps)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'model',
          input: expect.objectContaining({ capabilityId: 'text.chat' })
        }),
        expect.objectContaining({
          kind: 'model',
          input: expect.objectContaining({ capabilityId: 'text.summarize' })
        })
      ])
    )
    expect(
      savedWorkflows.flatMap((workflow) => workflow.steps).every((step) => step.kind === 'model')
    ).toBe(true)
  })

  it('updates existing builtin templates while preserving user-owned workflows', async () => {
    const existingBuiltin = createWorkflow({
      id: 'builtin.meeting-summary',
      name: 'Old Meeting Template',
      createdAt: 123,
      metadata: {
        builtin: true,
        template: true,
        category: 'meeting',
        templateVersion: 0
      }
    })
    const userOwnedSameId = createWorkflow({
      id: 'builtin.batch-text-processing',
      name: 'User Copy With Reserved ID',
      createdAt: 456,
      metadata: {
        builtin: false,
        template: true,
        category: 'batch-text'
      }
    })
    const { seedBuiltinTemplates, savedWorkflows } = createTemplateSeeder([
      existingBuiltin,
      userOwnedSameId
    ])

    await seedBuiltinTemplates()

    expect(savedWorkflows.map((workflow) => workflow.id)).toEqual([
      'builtin.organize-recent-clipboard',
      'builtin.meeting-summary'
    ])
    expect(
      savedWorkflows.find((workflow) => workflow.id === 'builtin.meeting-summary')
    ).toMatchObject({
      name: '会议纪要 / 摘要',
      createdAt: 123,
      metadata: {
        builtin: true,
        template: true,
        category: 'meeting',
        templateVersion: 1
      }
    })
    expect(savedWorkflows.some((workflow) => workflow.id === 'builtin.batch-text-processing')).toBe(
      false
    )
  })

  it('rejects unsupported workflow step kinds instead of coercing to prompt', () => {
    const normalizeWorkflowDefinition = createServiceNormalizer()

    expect(() =>
      normalizeWorkflowDefinition(
        createWorkflow({
          steps: [
            {
              id: 'retired-step',
              name: 'Retired Step',
              kind: 'capability'
            }
          ]
        })
      )
    ).toThrow('Unsupported workflow step kind: capability')
  })

  it('rejects unsupported tool sources on workflow and tool steps', () => {
    const normalizeWorkflowDefinition = createServiceNormalizer()

    expect(() =>
      normalizeWorkflowDefinition(
        createWorkflow({
          toolSources: ['builtin', 'remote' as never]
        })
      )
    ).toThrow('Unsupported workflow tool source: remote')

    expect(() =>
      normalizeWorkflowDefinition(
        createWorkflow({
          steps: [
            {
              id: 'tool-step',
              name: 'Tool Step',
              kind: 'tool',
              toolId: 'clipboard.read',
              toolSource: 'remote'
            }
          ]
        })
      )
    ).toThrow('Unsupported workflow tool source: remote')
  })

  it('rejects tool and agent steps with missing required identifiers', () => {
    const normalizeWorkflowDefinition = createServiceNormalizer()

    expect(() =>
      normalizeWorkflowDefinition(
        createWorkflow({
          steps: [
            {
              id: 'tool-step',
              name: 'Tool Step',
              kind: 'tool',
              toolSource: 'builtin'
            }
          ]
        })
      )
    ).toThrow('Workflow tool step tool-step requires toolId')

    expect(() =>
      normalizeWorkflowDefinition(
        createWorkflow({
          steps: [
            {
              id: 'agent-step',
              name: 'Agent Step',
              kind: 'agent'
            }
          ]
        })
      )
    ).toThrow('Workflow agent step agent-step requires agentId')
  })

  it('strips tool-only fields from prompt and agent steps', () => {
    const normalizeWorkflowDefinition = createServiceNormalizer()

    const workflow = normalizeWorkflowDefinition(
      createWorkflow({
        steps: [
          {
            id: 'prompt-step',
            name: 'Prompt Step',
            kind: 'prompt',
            prompt: 'Summarize',
            toolId: 'clipboard.read',
            toolSource: 'mcp',
            agentId: 'builtin.workflow-agent'
          },
          {
            id: 'agent-step',
            name: 'Agent Step',
            kind: 'agent',
            agentId: 'builtin.workflow-agent',
            toolId: 'clipboard.read',
            toolSource: 'mcp',
            prompt: 'Should not be kept'
          },
          {
            id: 'model-step',
            name: 'Use Model',
            kind: 'model',
            prompt: 'Summarize',
            toolId: 'clipboard.read',
            toolSource: 'mcp',
            agentId: 'builtin.workflow-agent',
            input: {
              capabilityId: 'text.summarize',
              text: 'hello'
            }
          }
        ]
      })
    )

    expect(workflow.steps).toMatchObject([
      {
        id: 'prompt-step',
        kind: 'prompt',
        prompt: 'Summarize',
        toolId: undefined,
        toolSource: undefined,
        agentId: undefined
      },
      {
        id: 'agent-step',
        kind: 'agent',
        agentId: 'builtin.workflow-agent',
        toolId: undefined,
        toolSource: undefined,
        prompt: undefined
      },
      {
        id: 'model-step',
        kind: 'model',
        prompt: 'Summarize',
        toolId: undefined,
        toolSource: undefined,
        agentId: undefined,
        input: {
          capabilityId: 'text.summarize',
          text: 'hello'
        }
      }
    ])
  })

  it('normalizes model input refs and output contract into metadata', () => {
    const normalizeWorkflowDefinition = createServiceNormalizer()

    const workflow = normalizeWorkflowDefinition(
      createWorkflow({
        steps: [
          {
            id: 'model-step',
            name: 'Use Model',
            kind: 'model',
            prompt: 'Summarize',
            input: {
              capabilityId: 'text.summarize',
              outputFormat: 'markdown'
            },
            inputSources: [
              {
                type: 'workflow.input',
                key: 'text',
                label: 'Input Text'
              },
              {
                type: '',
                key: 'ignored'
              }
            ],
            output: {
              format: 'json',
              schema: { type: 'object' },
              reviewPolicy: 'approval',
              riskLevel: 'medium'
            }
          }
        ]
      })
    )

    expect(workflow.steps[0]).toMatchObject({
      kind: 'model',
      inputSources: [
        {
          type: 'workflow.input',
          key: 'text',
          label: 'Input Text'
        }
      ],
      output: {
        format: 'json',
        schema: { type: 'object' },
        reviewPolicy: 'approval',
        riskLevel: 'medium'
      },
      metadata: {
        modelContract: {
          inputSources: [
            {
              type: 'workflow.input',
              key: 'text',
              label: 'Input Text'
            }
          ],
          output: {
            format: 'json',
            schema: { type: 'object' },
            reviewPolicy: 'approval',
            riskLevel: 'medium'
          }
        }
      }
    })
  })

  it('persists review queue item state in run metadata', async () => {
    const service = new IntelligenceWorkflowService()
    const persistedRuns: WorkflowRunRecord[] = []
    const target = service as unknown as {
      getRun: (runId: string) => Promise<WorkflowRunRecord | null>
      persistRun: (run: WorkflowRunRecord) => Promise<WorkflowRunRecord>
      updateReviewQueueItem: typeof service.updateReviewQueueItem
      initialize: () => Promise<void>
    }
    target.initialize = vi.fn(async () => undefined)
    target.getRun = vi.fn(async () => ({
      id: 'run-1',
      workflowId: 'workflow-1',
      workflowName: 'Workflow',
      status: 'completed',
      triggerType: 'manual',
      inputs: {},
      outputs: {},
      steps: [],
      startedAt: 1,
      completedAt: 2,
      metadata: {}
    }))
    target.persistRun = vi.fn(async (run: WorkflowRunRecord) => {
      persistedRuns.push(run)
      return run
    })

    const result = await target.updateReviewQueueItem.call(service, {
      runId: 'run-1',
      itemId: 'run-1:model-step',
      status: 'copied'
    })

    expect(result.metadata).toMatchObject({
      reviewQueue: {
        items: {
          'run-1:model-step': {
            status: 'copied'
          }
        }
      }
    })
    expect(persistedRuns[0]?.metadata).toMatchObject(result.metadata ?? {})
  })

  it('rejects unsupported run step kinds and invalid tool run steps', () => {
    const normalizeRunRecord = createRunNormalizer()
    const baseRun: WorkflowRunRecord = {
      id: 'run-test',
      workflowId: 'workflow-test',
      workflowName: 'Workflow Test',
      status: 'running',
      triggerType: 'manual',
      inputs: {},
      steps: [],
      startedAt: 1,
      metadata: {}
    }

    expect(() =>
      normalizeRunRecord({
        ...baseRun,
        steps: [
          {
            id: 'run-step-retired',
            workflowStepId: 'retired-step',
            kind: 'capability',
            name: 'Retired',
            status: 'pending'
          }
        ]
      })
    ).toThrow('Unsupported workflow step kind: capability')

    expect(() =>
      normalizeRunRecord({
        ...baseRun,
        steps: [
          {
            id: 'run-tool-step',
            workflowStepId: 'tool-step',
            kind: 'tool',
            name: 'Tool',
            status: 'pending'
          }
        ]
      })
    ).toThrow('Workflow run tool step run-tool-step requires toolId')
  })

  it('applies strict step normalization when hydrating workflow rows', () => {
    const { hydrateDefinitions } = createHydrators()
    const rows = [
      {
        id: 'workflow-row',
        name: 'Workflow Row',
        description: null,
        version: '1',
        enabled: true,
        triggers: '[]',
        contextSources: '[]',
        toolSources: '["builtin"]',
        approvalPolicy: '{}',
        metadata: '{}',
        createdAt: new Date(1),
        updatedAt: new Date(1)
      }
    ]

    expect(() =>
      hydrateDefinitions(rows, [
        {
          id: 'row-step',
          workflowId: 'workflow-row',
          name: 'Row Step',
          kind: 'tool',
          description: null,
          prompt: null,
          toolId: null,
          toolSource: 'builtin',
          agentId: null,
          input: '{}',
          continueOnError: false,
          metadata: '{}'
        }
      ])
    ).toThrow('Workflow tool step row-step requires toolId')
  })

  it('applies strict step normalization when hydrating workflow run rows', () => {
    const { hydrateRuns } = createHydrators()
    const rows = [
      {
        id: 'run-row',
        workflowId: 'workflow-row',
        workflowName: 'Workflow Row',
        triggerType: 'manual',
        status: 'running',
        inputs: '{}',
        outputs: '{}',
        error: null,
        contextSnapshot: '{}',
        metadata: '{}',
        startedAt: new Date(1),
        completedAt: null
      }
    ]

    expect(() =>
      hydrateRuns(rows, [
        {
          id: 'run-row-step',
          runId: 'run-row',
          workflowStepId: 'row-step',
          stepOrder: 0,
          name: 'Run Row Step',
          kind: 'capability',
          status: 'pending',
          toolId: null,
          toolSource: null,
          input: '{}',
          output: null,
          error: null,
          metadata: '{}',
          startedAt: null,
          completedAt: null
        }
      ])
    ).toThrow('Unsupported workflow step kind: capability')
  })
})
