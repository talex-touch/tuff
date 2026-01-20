/**
 * WorkflowAgent - 工作流智能体
 *
 * 能力:
 * - 多步骤任务串联
 * - 顺序执行子任务
 */

import type { AgentDescriptor, AgentPlanStep, AgentTask } from '@talex-touch/utils'
import type { AgentExecutionContext, AgentImpl } from '../agent-registry'
import { AgentStatus } from '@talex-touch/utils'
import { agentManager } from '../agent-manager'
import { agentRegistry } from '../agent-registry'

const WORKFLOW_AGENT_ID = 'builtin.workflow-agent'

interface WorkflowStep {
  id?: string
  agentId: string
  type?: 'execute' | 'plan' | 'chat'
  input?: unknown
}

interface WorkflowRunParams {
  steps: WorkflowStep[]
  continueOnError?: boolean
}

const descriptor: AgentDescriptor = {
  id: WORKFLOW_AGENT_ID,
  name: 'Workflow Agent',
  description: '轻量级工作流智能体，支持串联多个 Agent 任务',
  version: '1.0.0',
  category: 'workflow',
  capabilities: [
    {
      id: 'workflow.run',
      name: '执行工作流',
      type: 'workflow',
      description: '按顺序执行多个智能体任务',
      inputSchema: {
        type: 'object',
        properties: {
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                agentId: { type: 'string' },
                type: { type: 'string' },
                input: { type: 'object' }
              },
              required: ['agentId']
            }
          },
          continueOnError: { type: 'boolean' }
        },
        required: ['steps']
      }
    },
    {
      id: 'workflow.plan',
      name: '生成工作流计划',
      type: 'workflow',
      description: '基于输入生成简单的工作流计划'
    }
  ],
  enabled: true
}

const implementation: AgentImpl = {
  async execute(input: unknown, ctx: AgentExecutionContext): Promise<unknown> {
    const { capability, ...params } = input as { capability: string; [key: string]: unknown }

    switch (capability) {
      case 'workflow.run':
        return executeWorkflow(
          {
            steps: Array.isArray(params.steps) ? (params.steps as WorkflowStep[]) : [],
            continueOnError: Boolean(params.continueOnError)
          },
          ctx
        )
      case 'workflow.plan':
        return planWorkflow(params as { steps?: AgentPlanStep[] })
      default:
        throw new Error(`Unknown capability: ${capability}`)
    }
  },

  async plan(input: unknown, _ctx: AgentExecutionContext): Promise<AgentPlanStep[]> {
    return planWorkflow(input as { steps?: AgentPlanStep[] })
  }
}

async function executeWorkflow(
  params: WorkflowRunParams,
  ctx: AgentExecutionContext
): Promise<unknown> {
  const steps = Array.isArray(params.steps) ? params.steps : []
  const continueOnError = Boolean(params.continueOnError)
  const results: Array<{ stepId: string; success: boolean; result?: unknown }> = []

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index]
    const stepId = step.id ?? `step-${index + 1}`

    if (!step.agentId) {
      throw new Error(`Missing agentId for workflow step ${stepId}`)
    }
    if (step.agentId === WORKFLOW_AGENT_ID) {
      throw new Error('WorkflowAgent cannot invoke itself')
    }

    const task: AgentTask = {
      agentId: step.agentId,
      type: step.type ?? 'execute',
      input: step.input ?? {},
      context: {
        sessionId: ctx.sessionId,
        workingDirectory: ctx.workingDirectory,
        metadata: ctx.metadata
      }
    }

    const result = await agentManager.executeTaskImmediate(task)
    results.push({ stepId, success: result.success, result })

    if (!result.success && !continueOnError) {
      return { success: false, results }
    }
  }

  return { success: true, results }
}

function planWorkflow(params: { steps?: AgentPlanStep[] }): AgentPlanStep[] {
  const steps = params.steps
  if (Array.isArray(steps) && steps.length > 0) {
    return steps
  }

  return [
    {
      id: 'step-1',
      description: '执行工作流步骤',
      status: AgentStatus.IDLE
    }
  ]
}

export function registerWorkflowAgent(): void {
  agentRegistry.registerAgent(descriptor, implementation)
}
