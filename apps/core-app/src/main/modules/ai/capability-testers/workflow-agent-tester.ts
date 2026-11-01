import type {
  IntelligenceAgentPayload,
  IntelligenceAgentResult,
  IntelligenceInvokeResult,
  PromptWorkflowExecution
} from '@talex-touch/tuff-intelligence'
import type { CapabilityTestPayload } from './base-tester'
import { t } from '../../../utils/i18n-helper'
import { BaseCapabilityTester } from './base-tester'

/** A run status in the words the workflow pages use for it. */
const WORKFLOW_STATUS_KEYS: Record<PromptWorkflowExecution['status'], string> = {
  pending: 'intelligence.workflow.statusPending',
  running: 'intelligence.workflow.statusRunning',
  completed: 'intelligence.workflow.statusCompleted',
  failed: 'intelligence.workflow.statusFailed',
  cancelled: 'intelligence.workflow.statusCancelled'
}

function workflowStatusLabel(status: PromptWorkflowExecution['status'] | undefined): string {
  const key = status ? WORKFLOW_STATUS_KEYS[status] : undefined
  if (key) return t(key)
  return status || t('intelligence.capabilityTest.preview.unknown')
}

export class WorkflowExecuteTester extends BaseCapabilityTester<unknown, PromptWorkflowExecution> {
  readonly capabilityType = 'workflow-execute'

  async generateTestPayload(input: CapabilityTestPayload): Promise<unknown> {
    const topic = input.userInput || '梳理当前 AI SDK 发布准备情况，并输出风险与下一步。'

    return {
      inputs: {
        topic
      },
      steps: [
        {
          id: 'summarize',
          name: 'Summarize request',
          kind: 'model',
          prompt: 'Summarize the user request and identify the desired outcome.',
          input: {
            capabilityId: 'text.summarize',
            text: topic,
            maxLength: 120,
            style: 'bullet-points'
          }
        },
        {
          id: 'rewrite-next-action',
          name: 'Rewrite next action',
          kind: 'model',
          prompt: 'Rewrite the next action as a concise launcher command.',
          input: {
            capabilityId: 'text.rewrite',
            text: topic,
            style: 'professional',
            tone: 'friendly'
          }
        }
      ]
    }
  }

  formatTestResult(result: IntelligenceInvokeResult<PromptWorkflowExecution>) {
    const steps = result.result?.steps || []
    const completedSteps = steps.filter((step) => step.status === 'completed').length

    return this.buildTestResult(result, {
      message: t('intelligence.capabilityTest.message.workflowExecute', {
        status: workflowStatusLabel(result.result?.status),
        completed: completedSteps,
        total: steps.length
      }),
      textPreview: JSON.stringify(result.result?.outputs || {}, null, 2)
    })
  }

  getDefaultInputHint(): string {
    return t('intelligence.capabilityTest.hint.workflowExecute')
  }

  requiresUserInput(): boolean {
    return true
  }
}

export class AgentRunTester extends BaseCapabilityTester<
  IntelligenceAgentPayload,
  IntelligenceAgentResult
> {
  readonly capabilityType = 'agent-run'

  async generateTestPayload(input: CapabilityTestPayload): Promise<IntelligenceAgentPayload> {
    return {
      task:
        input.userInput ||
        'Compare Talex Touch with Alfred and uTools, then propose one SDK capability improvement.',
      context: 'Capability tester smoke test: prefer concise, actionable output.',
      maxIterations: 3,
      constraints: [
        'Do not call external tools unless explicitly available.',
        'Return a prioritized next action.'
      ],
      memory: [
        {
          role: 'system',
          content: 'Talex Touch is a desktop productivity launcher with AI capability routing.'
        }
      ]
    }
  }

  formatTestResult(result: IntelligenceInvokeResult<IntelligenceAgentResult>) {
    const toolCallCount = result.result?.toolCalls?.length || 0
    const stepCount = result.result?.steps?.length || 0

    return this.buildTestResult(result, {
      message: t('intelligence.capabilityTest.message.agentRun', {
        steps: stepCount,
        toolCalls: toolCallCount
      }),
      textPreview: result.result?.result || ''
    })
  }

  getDefaultInputHint(): string {
    return t('intelligence.capabilityTest.hint.agentRun')
  }

  requiresUserInput(): boolean {
    return true
  }
}
