import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentPermission } from '@talex-touch/utils'

const {
  mockAdapterCtor,
  mockAdapterRun,
  mockCaptureContext,
  mockCallTool,
  mockGetAllTools,
  mockGetTool,
  mockInvoke,
  mockListStructuredTools,
  mockQueryTrace,
  mockRegisterProfiles,
  mockRegisterTool,
  mockResolveDeepAgentRuntimeConfig,
  mockStartSession
} = vi.hoisted(() => ({
  mockAdapterCtor: vi.fn(),
  mockAdapterRun: vi.fn(),
  mockCaptureContext: vi.fn(),
  mockCallTool: vi.fn(),
  mockGetAllTools: vi.fn(() => []),
  mockGetTool: vi.fn(),
  mockInvoke: vi.fn(),
  mockListStructuredTools: vi.fn(async () => []),
  mockQueryTrace: vi.fn(async () => []),
  mockRegisterProfiles: vi.fn(),
  mockRegisterTool: vi.fn(),
  mockResolveDeepAgentRuntimeConfig: vi.fn(),
  mockStartSession: vi.fn(async () => undefined)
}))

vi.mock('@talex-touch/tuff-intelligence', () => ({
  DeepAgentLangChainEngineAdapter: class DeepAgentLangChainEngineAdapter {
    constructor(options: unknown) {
      mockAdapterCtor(options)
    }

    async run(payload: unknown) {
      return await mockAdapterRun(payload)
    }
  },
  LangChainToolAdapter: {
    fromDefinition: vi.fn((definition: Record<string, unknown>) => ({
      ...definition,
      tuffMetadata: {
        toolId: definition.id,
        metadata: definition.metadata ?? {}
      }
    }))
  }
}))

vi.mock('./intelligence-sdk', () => ({
  tuffIntelligence: {
    resolveDeepAgentRuntimeConfig: mockResolveDeepAgentRuntimeConfig,
    invoke: mockInvoke
  }
}))

vi.mock('./intelligence-desktop-context', () => ({
  intelligenceDesktopContextService: {
    capture: mockCaptureContext
  }
}))

vi.mock('./tuff-intelligence-runtime', () => ({
  tuffIntelligenceRuntime: {
    startSession: mockStartSession,
    callTool: mockCallTool,
    queryTrace: mockQueryTrace
  }
}))

vi.mock('./agents/tool-registry', () => ({
  toolRegistry: {
    getAllTools: mockGetAllTools,
    getTool: mockGetTool,
    registerTool: mockRegisterTool
  }
}))

vi.mock('./intelligence-mcp-registry', () => ({
  intelligenceMcpRegistry: {
    registerProfiles: mockRegisterProfiles,
    listStructuredTools: mockListStructuredTools,
    callTool: vi.fn(),
    closeAll: vi.fn()
  }
}))

describe('IntelligenceDeepAgentOrchestrationService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCaptureContext.mockResolvedValue({
      capturedAt: 1,
      contextSources: []
    })
    mockStartSession.mockResolvedValue(undefined)
    mockQueryTrace.mockResolvedValue([])
    mockGetAllTools.mockReturnValue([])
    mockListStructuredTools.mockResolvedValue([])
    mockInvoke.mockResolvedValue({ result: undefined })
  })

  it('executes prompt workflow capability through DeepAgent runtime config', async () => {
    mockResolveDeepAgentRuntimeConfig.mockResolvedValue({
      providerId: 'openai-default',
      providerType: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'openai-key',
      model: 'gpt-4.1-mini',
      instructions: 'be precise',
      runtimeOptions: {
        metadata: {
          trace: 'workflow'
        }
      }
    })
    mockAdapterRun.mockResolvedValue({
      text: '整理完成',
      metadata: {
        provider: 'openai',
        model: 'gpt-4.1-mini'
      }
    })

    const { IntelligenceDeepAgentOrchestrationService } =
      await import('./intelligence-deepagent-orchestration')
    const service = new IntelligenceDeepAgentOrchestrationService()

    const result = await service.executeWorkflowCapability(
      {
        steps: [
          {
            id: 'step-1',
            name: '整理剪贴板',
            kind: 'prompt',
            prompt: '请把剪贴板内容整理成 Markdown',
            input: {
              outputFormat: 'markdown'
            }
          }
        ],
        inputs: {
          topic: 'clipboard'
        }
      },
      {
        metadata: {
          sessionId: 'sess-1'
        }
      }
    )

    expect(result.result.status).toBe('completed')
    expect(result.result.steps[0]).toMatchObject({
      stepId: 'step-1',
      status: 'completed'
    })
    expect(result.result.outputs).toMatchObject({
      'step-1': {
        text: '整理完成',
        provider: 'openai',
        model: 'gpt-4.1-mini'
      }
    })
    expect(mockResolveDeepAgentRuntimeConfig).toHaveBeenCalledWith(
      'workflow.execute',
      expect.objectContaining({
        metadata: expect.objectContaining({
          sessionId: 'sess-1'
        })
      })
    )
    expect(mockAdapterCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'openai-key',
        model: 'gpt-4.1-mini'
      })
    )
    const [adapterPayload] = mockAdapterRun.mock.calls[0] ?? []
    expect(adapterPayload).toMatchObject({
      sessionId: 'sess-1',
      metadata: {
        capabilityId: 'workflow.execute'
      }
    })
    expect(adapterPayload.messages[0].content).toContain('工作流输入')
    expect(adapterPayload.messages[0].content).toContain('clipboard')
  })

  it('normalizes inline prompt and tool workflow steps without retired workflow ids', async () => {
    mockAdapterRun.mockResolvedValueOnce({
      text: 'prompt done',
      metadata: {
        provider: 'openai',
        model: 'gpt-4.1-mini'
      }
    })
    mockGetTool.mockReturnValue({
      id: 'clipboard.read',
      name: 'Read Clipboard',
      description: 'Read clipboard history',
      permissions: [],
      inputSchema: {
        type: 'object',
        properties: {}
      }
    })
    mockCallTool.mockResolvedValue({
      success: true,
      output: {
        text: 'clipboard data'
      }
    })

    const { IntelligenceDeepAgentOrchestrationService } =
      await import('./intelligence-deepagent-orchestration')
    const service = new IntelligenceDeepAgentOrchestrationService()

    const result = await service.executeWorkflowCapability(
      {
        steps: [
          {
            id: 'prompt-step',
            kind: 'prompt',
            prompt: 'Summarize the text',
            input: {
              text: 'hello'
            }
          },
          {
            id: 'tool-step',
            kind: 'tool',
            toolId: 'clipboard.read',
            toolSource: 'mcp',
            input: {
              limit: 3
            }
          }
        ]
      },
      {
        metadata: {
          sessionId: 'sess-inline',
          workingDirectory: '/tmp/workflow'
        }
      }
    )

    expect(result.result.status).toBe('completed')
    expect(result.result.workflowId).toBe('inline.workflow')
    expect(result.result.outputs).toMatchObject({
      'prompt-step': {
        text: 'prompt done'
      },
      'tool-step': {
        text: 'clipboard data'
      }
    })
    expect(mockInvoke).not.toHaveBeenCalled()
    expect(mockCallTool).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'sess-inline',
        toolId: 'clipboard.read',
        input: {
          limit: 3
        },
        metadata: expect.objectContaining({
          toolSource: 'mcp',
          workingDirectory: '/tmp/workflow',
          approvalContext: expect.objectContaining({
            workflowId: 'inline.workflow',
            stepId: 'tool-step'
          })
        })
      })
    )
  })

  it('marks inline workflow as current workflow.execute contract', async () => {
    const { IntelligenceDeepAgentOrchestrationService } =
      await import('./intelligence-deepagent-orchestration')
    const service = new IntelligenceDeepAgentOrchestrationService()
    const normalized = (
      service as unknown as {
        normalizeInlineWorkflowPayload: (payload: unknown) => {
          description?: string
          metadata?: Record<string, unknown>
        }
      }
    ).normalizeInlineWorkflowPayload({
      steps: [
        {
          id: 'prompt-step',
          kind: 'prompt',
          prompt: 'Summarize'
        }
      ]
    })

    expect(normalized.description).toBe(
      'Inline workflow contract normalized from workflow.execute payload.'
    )
    expect(normalized.metadata).toEqual({
      contract: 'workflow.execute.inline'
    })
  })

  it('rejects inline workflow capabilityId routing', async () => {
    const { IntelligenceDeepAgentOrchestrationService } =
      await import('./intelligence-deepagent-orchestration')
    const service = new IntelligenceDeepAgentOrchestrationService()

    await expect(
      service.executeWorkflowCapability(
        {
          steps: [
            {
              id: 'capability-step',
              kind: 'prompt',
              capabilityId: 'text.summarize',
              input: {
                text: 'hello'
              }
            }
          ]
        },
        {
          metadata: {
            sessionId: 'sess-inline-reject-capability'
          }
        }
      )
    ).rejects.toThrow('[Intelligence] workflow.execute step capability-step rejects capabilityId')
  })

  it('rejects inline workflow steps without explicit kind', async () => {
    const { IntelligenceDeepAgentOrchestrationService } =
      await import('./intelligence-deepagent-orchestration')
    const service = new IntelligenceDeepAgentOrchestrationService()

    await expect(
      service.executeWorkflowCapability(
        {
          steps: [
            {
              id: 'implicit-tool-step',
              toolId: 'clipboard.read',
              input: {
                limit: 3
              }
            }
          ]
        },
        {
          metadata: {
            sessionId: 'sess-inline-invalid'
          }
        }
      )
    ).rejects.toThrow(
      '[Intelligence] workflow.execute step implicit-tool-step requires explicit kind'
    )
  })

  it('returns waiting approval when direct tool step requires approval', async () => {
    mockGetTool.mockReturnValue({
      id: 'browser.extract',
      name: 'Extract Web Page Text',
      description: 'Extract a web page',
      permissions: [AgentPermission.NETWORK_ACCESS],
      inputSchema: {
        type: 'object',
        properties: {}
      }
    })
    mockCallTool.mockResolvedValue({
      success: false,
      error: 'approval required',
      approvalTicket: {
        id: 'ticket-1'
      }
    })

    const { IntelligenceDeepAgentOrchestrationService } =
      await import('./intelligence-deepagent-orchestration')
    const service = new IntelligenceDeepAgentOrchestrationService()
    const onUpdate = vi.fn(async () => undefined)

    const result = await service.executeWorkflowRun({
      workflow: {
        id: 'wf_1',
        name: 'Review URL',
        triggers: [{ type: 'manual', enabled: true }],
        contextSources: [],
        toolSources: ['builtin'],
        steps: [
          {
            id: 'step-1',
            name: 'Extract Page',
            kind: 'tool',
            toolId: 'browser.extract',
            toolSource: 'builtin',
            input: {
              url: 'https://example.com'
            }
          }
        ]
      },
      run: {
        id: 'run_1',
        workflowId: 'wf_1',
        workflowName: 'Review URL',
        status: 'pending',
        triggerType: 'manual',
        inputs: {},
        steps: [
          {
            id: 'run_step_1',
            workflowStepId: 'step-1',
            kind: 'tool',
            name: 'Extract Page',
            status: 'pending',
            toolId: 'browser.extract',
            toolSource: 'builtin',
            input: {
              url: 'https://example.com'
            },
            metadata: {}
          }
        ],
        startedAt: 1,
        metadata: {}
      },
      inputs: {},
      sessionId: 'sess-approval',
      triggerType: 'manual',
      continueOnError: false,
      metadata: {
        workingDirectory: '/tmp'
      },
      onUpdate
    })

    expect(result.status).toBe('waiting_approval')
    expect(result.steps[0]).toMatchObject({
      status: 'waiting_approval',
      metadata: expect.objectContaining({
        approvalTicketId: 'ticket-1'
      })
    })
    expect(mockCallTool).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'sess-approval',
        toolId: 'browser.extract',
        metadata: expect.objectContaining({
          toolSource: 'builtin',
          approvalContext: expect.objectContaining({
            workflowId: 'wf_1',
            stepId: 'step-1'
          }),
          contextSources: []
        })
      })
    )
    expect(onUpdate).toHaveBeenCalled()
  })
})
