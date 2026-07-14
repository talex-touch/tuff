import type {
  IntelligenceAgentPayload,
  IntelligenceAgentResult,
  IntelligenceInvokeResult,
  PromptWorkflowExecution
} from '@talex-touch/tuff-intelligence'
import type { CapabilityTestPayload } from './base-tester'
import { BaseCapabilityTester } from './base-tester'

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
      message: `workflow.execute ${result.result?.status || 'unknown'}，${completedSteps}/${steps.length} steps completed`,
      textPreview: JSON.stringify(result.result?.outputs || {}, null, 2)
    })
  }

  getDefaultInputHint(): string {
    return '请输入要交给内联工作流处理的目标'
  }

  requiresUserInput(): boolean {
    return true
  }
}

export class AgentRunTester extends BaseCapabilityTester<IntelligenceAgentPayload, IntelligenceAgentResult> {
  readonly capabilityType = 'agent-run'

  async generateTestPayload(input: CapabilityTestPayload): Promise<IntelligenceAgentPayload> {
    return {
      task:
        input.userInput ||
        'Compare Talex Touch with Alfred and uTools, then propose one SDK capability improvement.',
      context: 'Capability tester smoke test: prefer concise, actionable output.',
      maxIterations: 3,
      constraints: ['Do not call external tools unless explicitly available.', 'Return a prioritized next action.'],
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
      message: `Agent 运行完成，${stepCount} 个推理步骤，${toolCallCount} 次工具调用`,
      textPreview: result.result?.result || ''
    })
  }

  getDefaultInputHint(): string {
    return '请输入要交给 Agent 执行的任务'
  }

  requiresUserInput(): boolean {
    return true
  }
}
