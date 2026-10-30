import type {
  IntelligenceInvokeResult,
  IntelligenceChatPayload
} from '@talex-touch/tuff-intelligence'
import type { CapabilityTestPayload } from './base-tester'
import { t } from '../../../utils/i18n-helper'
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

  formatTestResult(result: IntelligenceInvokeResult<string>) {
    const preview = result.result.length > 200 ? `${result.result.slice(0, 200)}...` : result.result

    return this.buildTestResult(result, {
      message: t('intelligence.capabilityTest.message.chat'),
      textPreview: preview
    })
  }

  getDefaultInputHint(): string {
    return t('intelligence.capabilityTest.hint.chat')
  }

  requiresUserInput(): boolean {
    return true
  }
}
