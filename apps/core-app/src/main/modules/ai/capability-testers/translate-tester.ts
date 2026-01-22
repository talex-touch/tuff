import type { AiInvokeResult, IntelligenceTranslatePayload } from '@talex-touch/utils'
import type { CapabilityTestPayload } from './base-tester'
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

  formatTestResult(result: AiInvokeResult<string>) {
    const preview = result.result.length > 200 ? `${result.result.slice(0, 200)}...` : result.result

    return {
      success: true,
      message: '翻译测试成功',
      textPreview: preview,
      provider: result.provider,
      model: result.model,
      latency: result.latency
    }
  }

  getDefaultInputHint(): string {
    return '请输入要翻译的文本，例如：Hello World'
  }

  requiresUserInput(): boolean {
    return true
  }
}
