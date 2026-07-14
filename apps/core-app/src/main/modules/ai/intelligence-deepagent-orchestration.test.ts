import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockAdapterCtor,
  mockAdapterRun,
  mockCaptureContext,
  mockContextInvoke,
  mockCallTool,
  mockGetAllTools,
  mockGetTool,
  mockInvoke,
  mockListStructuredTools,
  mockQueryTrace,
  mockRegisterProfiles,
  mockRegisterTool,
  mockResolveDeepAgentRuntimeConfig,
  mockStartSession,
  mockAgentPermission
} = vi.hoisted(() => ({
  mockAdapterCtor: vi.fn(),
  mockAdapterRun: vi.fn(),
  mockCaptureContext: vi.fn(),
  mockContextInvoke: vi.fn(),
  mockCallTool: vi.fn(),
  mockGetAllTools: vi.fn(() => []),
  mockGetTool: vi.fn(),
  mockInvoke: vi.fn(),
  mockListStructuredTools: vi.fn(async () => []),
  mockQueryTrace: vi.fn(async () => []),
  mockRegisterProfiles: vi.fn(),
  mockRegisterTool: vi.fn(),
  mockResolveDeepAgentRuntimeConfig: vi.fn(),
  mockStartSession: vi.fn(async () => undefined),
  mockAgentPermission: {
    SYSTEM_EXEC: 'system.exec',
    FILE_DELETE: 'file.delete',
    CLIPBOARD_WRITE: 'clipboard.write',
    FILE_WRITE: 'file.write',
    NETWORK_ACCESS: 'network.access'
  }
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

vi.mock('@talex-touch/utils', () => ({
  AgentPermission: mockAgentPermission
}))

vi.mock('./intelligence-sdk', () => ({
  tuffIntelligence: {
    resolveDeepAgentRuntimeConfig: mockResolveDeepAgentRuntimeConfig,
    invoke: mockInvoke
  }
}))

vi.mock('./intelligence-context-execution', () => ({
  intelligenceContextExecutionService: {
    invoke: mockContextInvoke
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
    mockContextInvoke.mockResolvedValue({
      invocation: { result: undefined },
      context: { mode: 'continue', scope: 'session', itemCount: 1 }
    })
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

  it('returns adapter metadata usage from agent capability results', async () => {
    mockResolveDeepAgentRuntimeConfig.mockResolvedValue({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'openai-key',
      model: 'gpt-4.1-mini',
      instructions: 'be precise',
      runtimeOptions: { metadata: {} }
    })
    mockAdapterRun.mockResolvedValue({
      text: '任务完成',
      metadata: {
        provider: 'openai',
        model: 'gpt-4.1-mini',
        usage: {
          promptTokens: 17,
          completionTokens: 6,
          totalTokens: 23
        }
      }
    })

    const { IntelligenceDeepAgentOrchestrationService } =
      await import('./intelligence-deepagent-orchestration')
    const service = new IntelligenceDeepAgentOrchestrationService()

    const result = await service.executeAgentCapability(
      { task: '整理本次会议记录' },
      { metadata: { sessionId: 'sess-agent-usage' } }
    )

    expect(result).toMatchObject({
      usage: {
        promptTokens: 17,
        completionTokens: 6,
        totalTokens: 23
      },
      provider: 'openai',
      model: 'gpt-4.1-mini',
      traceId: 'sess-agent-usage'
    })
  })

  it('retains DeepAgent step usage and aggregates stable model workflow usage', async () => {
    mockResolveDeepAgentRuntimeConfig.mockResolvedValue({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'openai-key',
      model: 'gpt-4.1-mini',
      instructions: 'be precise',
      runtimeOptions: { metadata: {} }
    })
    mockAdapterRun.mockResolvedValueOnce({
      text: 'prompt complete',
      metadata: {
        provider: 'openai',
        model: 'gpt-4.1-mini',
        usage: {
          promptTokens: 11,
          completionTokens: 7,
          totalTokens: 18
        }
      }
    })
    mockAdapterRun.mockResolvedValueOnce({
      text: 'agent complete',
      metadata: {
        provider: 'openai',
        model: 'gpt-4.1-mini',
        usage: {
          promptTokens: 5,
          completionTokens: 4,
          totalTokens: 9
        }
      }
    })
    mockInvoke.mockResolvedValue({
      result: 'model complete',
      provider: 'openai',
      model: 'gpt-4.1-mini',
      usage: {
        promptTokens: 13,
        completionTokens: 8,
        totalTokens: 21
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
            prompt: 'Summarize the notes'
          },
          {
            id: 'agent-step',
            kind: 'agent',
            agentId: 'builtin.workflow-agent',
            prompt: 'Review the summary'
          },
          {
            id: 'model-step',
            kind: 'model',
            input: {
              capabilityId: 'text.summarize',
              text: 'stable model input'
            }
          }
        ]
      },
      { metadata: { sessionId: 'sess-workflow-usage' } }
    )

    expect(result.result.outputs).toMatchObject({
      'prompt-step': {
        usage: {
          promptTokens: 11,
          completionTokens: 7,
          totalTokens: 18
        }
      },
      'agent-step': {
        usage: {
          promptTokens: 5,
          completionTokens: 4,
          totalTokens: 9
        }
      },
      'model-step': {
        usage: {
          promptTokens: 13,
          completionTokens: 8,
          totalTokens: 21
        }
      }
    })
    expect(result.usage).toEqual({
      promptTokens: 29,
      completionTokens: 19,
      totalTokens: 48
    })
  })

  it('uses zero workflow usage when no step reports usage', async () => {
    mockResolveDeepAgentRuntimeConfig.mockResolvedValue({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'openai-key',
      model: 'gpt-4.1-mini',
      instructions: 'be precise',
      runtimeOptions: { metadata: {} }
    })
    mockAdapterRun.mockResolvedValue({
      text: 'usage unavailable',
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
            id: 'prompt-step',
            kind: 'prompt',
            prompt: 'Respond briefly'
          }
        ]
      },
      { metadata: { sessionId: 'sess-workflow-no-usage' } }
    )

    expect(result.usage).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0
    })
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

  it('executes model workflow steps through stable intelligence.invoke capability routing', async () => {
    mockInvoke.mockResolvedValue({
      result: 'summary',
      provider: 'openai',
      model: 'gpt-4.1-mini',
      usage: {
        promptTokens: 8,
        completionTokens: 4,
        totalTokens: 12
      },
      latency: 123,
      traceId: 'trace-model'
    })

    const { IntelligenceDeepAgentOrchestrationService } =
      await import('./intelligence-deepagent-orchestration')
    const service = new IntelligenceDeepAgentOrchestrationService()

    const result = await service.executeWorkflowCapability(
      {
        steps: [
          {
            id: 'model-step',
            kind: 'model',
            prompt: 'Summarize this text',
            input: {
              capabilityId: 'text.summarize',
              text: 'hello world',
              outputFormat: 'markdown',
              preferredProviderId: 'openai-default'
            }
          }
        ]
      },
      {
        metadata: {
          sessionId: 'sess-model',
          workingDirectory: '/tmp/workflow'
        }
      }
    )

    expect(result.result.status).toBe('completed')
    expect(result.result.outputs).toMatchObject({
      'model-step': {
        result: 'summary',
        provider: 'openai',
        model: 'gpt-4.1-mini',
        usage: {
          totalTokens: 12
        },
        latency: 123,
        traceId: 'trace-model',
        capabilityId: 'text.summarize'
      }
    })
    expect(mockAdapterRun).not.toHaveBeenCalled()
    expect(mockInvoke).toHaveBeenCalledWith(
      'text.summarize',
      {
        text: 'hello world'
      },
      expect.objectContaining({
        preferredProviderId: 'openai-default',
        metadata: expect.objectContaining({
          caller: 'workflow.use-model',
          source: 'intelligence.workflow.model',
          workflowId: 'inline.workflow',
          workflowRunId: expect.stringMatching(/^inline_/),
          workflowStepId: 'model-step',
          sessionId: 'sess-model'
        })
      })
    )
  })

  it('routes chat model steps through isolated workflow run context sessions', async () => {
    mockContextInvoke.mockResolvedValue({
      invocation: {
        result: 'context answer',
        provider: 'local',
        model: 'qwen',
        traceId: 'context-trace',
        latency: 4
      },
      context: { mode: 'continue', scope: 'session', itemCount: 1 }
    })
    const { IntelligenceDeepAgentOrchestrationService } =
      await import('./intelligence-deepagent-orchestration')
    const service = new IntelligenceDeepAgentOrchestrationService()
    const workflow = {
      steps: [
        {
          id: 'first-chat-step',
          kind: 'model',
          prompt: 'Use only this workflow run context',
          input: { capabilityId: 'text.chat' }
        },
        {
          id: 'second-chat-step',
          kind: 'model',
          prompt: 'Continue using only this workflow run context',
          input: { capabilityId: 'text.chat' }
        }
      ]
    }

    await service.executeWorkflowCapability(workflow, {
      metadata: { sessionId: 'shared-runtime-session' }
    })
    await service.executeWorkflowCapability(workflow, {
      metadata: { sessionId: 'shared-runtime-session' }
    })

    expect(mockContextInvoke).toHaveBeenCalledTimes(4)
    const contextRequests = mockContextInvoke.mock.calls.map(([request]) => request)
    expect(contextRequests.map((request) => request.context.mode)).toEqual([
      'new',
      'continue',
      'new',
      'continue'
    ])
    expect(
      contextRequests.map((request) => ({
        owner: request.context.owner,
        scope: request.context.scope,
        entrypoint: request.options.metadata.contextEntrypoint.id
      }))
    ).toEqual([
      { owner: 'workflow', scope: 'session', entrypoint: 'workflow.use-model' },
      { owner: 'workflow', scope: 'session', entrypoint: 'workflow.use-model' },
      { owner: 'workflow', scope: 'session', entrypoint: 'workflow.use-model' },
      { owner: 'workflow', scope: 'session', entrypoint: 'workflow.use-model' }
    ])

    const [firstRunFirstStep, firstRunSecondStep, secondRunFirstStep, secondRunSecondStep] =
      contextRequests
    const firstRunSessionId = firstRunFirstStep.context.sessionId
    const secondRunSessionId = secondRunFirstStep.context.sessionId

    expect(firstRunSessionId).toEqual(expect.stringMatching(/^workflow-context\.inline_/))
    expect(secondRunSessionId).toEqual(expect.stringMatching(/^workflow-context\.inline_/))
    expect(firstRunSecondStep.context.sessionId).toBe(firstRunSessionId)
    expect(secondRunSecondStep.context.sessionId).toBe(secondRunSessionId)
    expect(secondRunSessionId).not.toBe(firstRunSessionId)
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('rejects non-stable model workflow capabilities', async () => {
    const { IntelligenceDeepAgentOrchestrationService } =
      await import('./intelligence-deepagent-orchestration')
    const service = new IntelligenceDeepAgentOrchestrationService()

    await expect(
      service.executeWorkflowCapability(
        {
          steps: [
            {
              id: 'image-step',
              kind: 'model',
              input: {
                capabilityId: 'image.generate',
                prompt: 'draw a chart'
              }
            }
          ]
        },
        {
          metadata: {
            sessionId: 'sess-model-reject'
          }
        }
      )
    ).resolves.toMatchObject({
      result: {
        status: 'failed',
        error: '[Intelligence] workflow model step image-step only supports stable capabilities'
      }
    })
    expect(mockInvoke).not.toHaveBeenCalled()
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
      permissions: [mockAgentPermission.NETWORK_ACCESS],
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
