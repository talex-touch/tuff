import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentDescriptor } from '@talex-touch/utils'
import type { IntelligenceUsageInfo } from '@talex-touch/utils/types/intelligence'
import { AgentExecutor, type IntelligenceSDKInterface } from './agent-executor'
import { agentRegistry, type AgentImpl } from './agent-registry'

const AGENT_ID = 'test.agent-executor-llm-fallback'
const SECRET = 'do-not-leak-this-prompt'

const descriptor: AgentDescriptor = {
  id: AGENT_ID,
  name: 'LLM fallback test agent',
  description: 'Delegates to the Intelligence SDK when no custom implementation exists.',
  version: '1.0.0',
  capabilities: [
    {
      id: 'respond',
      type: 'action',
      name: 'Respond',
      description: 'Responds through the Intelligence SDK.'
    }
  ]
}

function registerLlmFallbackAgent(): void {
  agentRegistry.registerAgent(descriptor, { execute: undefined } as unknown as AgentImpl)
}

function createSdk(response: Awaited<ReturnType<IntelligenceSDKInterface['invoke']>>) {
  const invoke = vi.fn().mockResolvedValue(response)
  const sdk: IntelligenceSDKInterface = { invoke }
  return { invoke, sdk }
}

function invokedMetadata(invoke: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const options = invoke.mock.calls[0]?.[2] as { metadata?: Record<string, unknown> } | undefined
  expect(options).toBeDefined()
  expect(options?.metadata).toBeDefined()
  return options?.metadata ?? {}
}

describe('AgentExecutor Intelligence SDK fallback', () => {
  let executor: AgentExecutor

  beforeEach(() => {
    registerLlmFallbackAgent()
    executor = new AgentExecutor()
  })

  afterEach(() => {
    agentRegistry.unregisterAgent(AGENT_ID)
  })

  it('forwards the canonical execute identity and provider usage without prompt metadata', async () => {
    const providerUsage: IntelligenceUsageInfo = {
      promptTokens: 13,
      completionTokens: 8,
      totalTokens: 21,
      cost: 0.0075
    }
    const { invoke, sdk } = createSdk({
      success: true,
      data: { answer: 'completed' },
      usage: providerUsage
    })
    executor.setIntelligenceSDK(sdk)

    const result = await executor.executeTask({
      id: 'task-provided-7',
      agentId: AGENT_ID,
      type: 'execute',
      input: { prompt: SECRET },
      caller: 'host:workflow',
      context: { sessionId: 'session-42' }
    })

    expect(invoke).toHaveBeenCalledWith('text.chat', expect.any(Object), {
      strategy: 'adaptive-default',
      modelPreference: ['gpt-4o-mini', 'deepseek-chat'],
      metadata: {
        caller: 'host:workflow',
        agentId: AGENT_ID,
        taskId: 'task-provided-7',
        sessionId: 'session-42'
      }
    })
    expect(invokedMetadata(invoke)).toEqual({
      caller: 'host:workflow',
      agentId: AGENT_ID,
      taskId: 'task-provided-7',
      sessionId: 'session-42'
    })
    expect(JSON.stringify(invokedMetadata(invoke))).not.toContain(SECRET)
    expect(result).toMatchObject({
      success: true,
      taskId: 'task-provided-7',
      agentId: AGENT_ID,
      output: { answer: 'completed' },
      status: 'completed'
    })
    expect(result.usage).toEqual({
      ...providerUsage,
      toolCalls: 0,
      duration: expect.any(Number)
    })
    expect(result.usage?.duration).toBeGreaterThanOrEqual(0)
  })

  it('uses the stable default caller and generated task id for the plan fallback', async () => {
    const { invoke, sdk } = createSdk({
      success: true,
      data: '[{"id":"step-1","description":"Inspect the request"}]',
      usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5 }
    })
    executor.setIntelligenceSDK(sdk)

    const result = await executor.executeTask({
      agentId: AGENT_ID,
      type: 'plan',
      input: { prompt: SECRET }
    })

    expect(result).toMatchObject({
      success: true,
      agentId: AGENT_ID,
      status: 'completed',
      output: {
        agentId: AGENT_ID,
        steps: [{ id: 'step-1', description: 'Inspect the request' }]
      }
    })
    expect(result.taskId).toMatch(/^task_\d+_[a-z0-9]+$/)
    expect(invokedMetadata(invoke)).toEqual({
      caller: 'intelligence.agent-executor',
      agentId: AGENT_ID,
      taskId: result.taskId
    })
    expect(JSON.stringify(invokedMetadata(invoke))).not.toContain(SECRET)
  })

  it('surfaces a failed Intelligence SDK fallback as a failed agent result', async () => {
    const { invoke, sdk } = createSdk({
      success: false,
      error: 'provider quota denied'
    })
    executor.setIntelligenceSDK(sdk)

    const result = await executor.executeTask({
      id: 'task-provider-failure',
      agentId: AGENT_ID,
      type: 'execute',
      input: { prompt: SECRET }
    })

    expect(invokedMetadata(invoke)).toEqual({
      caller: 'intelligence.agent-executor',
      agentId: AGENT_ID,
      taskId: 'task-provider-failure'
    })
    expect(result).toMatchObject({
      success: false,
      taskId: 'task-provider-failure',
      agentId: AGENT_ID,
      status: 'failed',
      error: 'provider quota denied'
    })
    expect(result.usage).toBeUndefined()
  })
})
