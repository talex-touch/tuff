import type {
  IntelligenceInvokeResult,
  IntelligenceTranslatePayload
} from '@talex-touch/tuff-intelligence'
import type { CapabilityTestPayload } from './base-tester'
import { t } from '../../../utils/i18n-helper'
import { BaseCapabilityTester } from './base-tester'

export class TranslateCapabilityTester extends BaseCapabilityTester<
  IntelligenceTranslatePayload,
  string
> {
  readonly capabilityType = 'translate'

  async generateTestPayload(input: CapabilityTestPayload): Promise<IntelligenceTranslatePayload> {
    const text = input.userInput || 'Hello, how are you today?'
    return {
      text,
      targetLang: 'Chinese'
    }
  }

  formatTestResult(result: IntelligenceInvokeResult<string>) {
    const preview = result.result.length > 200 ? `${result.result.slice(0, 200)}...` : result.result

    return this.buildTestResult(result, {
      message: t('intelligence.capabilityTest.message.translate'),
      textPreview: preview
    })
  }

  getDefaultInputHint(): string {
    return t('intelligence.capabilityTest.hint.translate')
  }

  requiresUserInput(): boolean {
    return true
  }
}
