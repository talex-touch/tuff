import type { AiInvokeResult, IntelligenceChatPayload } from '@talex-touch/utils'
import type { CapabilityTestPayload } from './base-tester'
import { BaseCapabilityTester } from './base-tester'

export class ChatCapabilityTester extends BaseCapabilityTester<IntelligenceChatPayload, string> {
  readonly capabilityType = 'chat'

  async generateTestPayload(input: CapabilityTestPayload): Promise<IntelligenceChatPayload> {
    const userMessage = input.userInput || '请用一句话介绍你自己。'

    return {
      messages: [
        {
          role: 'user' as const,
          content: userMessage
        }
      ]
    }
  }

  formatTestResult(result: AiInvokeResult<string>) {
    const preview = result.result.length > 200 ? `${result.result.slice(0, 200)}...` : result.result

    return {
      success: true,
      message: '对话测试成功',
      textPreview: preview,
      provider: result.provider,
      model: result.model,
      latency: result.latency
    }
  }

  getDefaultInputHint(): string {
    return '请输入测试消息，例如：你好'
  }

  requiresUserInput(): boolean {
    return true
  }
}
