import type {
  IntelligenceInvokeResult,
  IntelligenceEmbeddingPayload
} from '@talex-touch/tuff-intelligence'
import type { CapabilityTestPayload } from './base-tester'
import { t } from '../../../utils/i18n-helper'
import { BaseCapabilityTester } from './base-tester'

export class EmbeddingCapabilityTester extends BaseCapabilityTester<
  IntelligenceEmbeddingPayload,
  number[]
> {
  readonly capabilityType = 'embedding'

  async generateTestPayload(input: CapabilityTestPayload): Promise<IntelligenceEmbeddingPayload> {
    const text = input.userInput || '这是一个测试文本，用于生成向量嵌入。'

    return {
      text
    }
  }

  formatTestResult(result: IntelligenceInvokeResult<number[]>) {
    const vectorLength = result.result.length
    const preview = t('intelligence.capabilityTest.preview.embedding', {
      dimensions: vectorLength,
      values: result.result
        .slice(0, 5)
        .map((v) => v.toFixed(4))
        .join(', ')
    })

    return this.buildTestResult(result, {
      message: t('intelligence.capabilityTest.message.embedding'),
      textPreview: preview
    })
  }

  getDefaultInputHint(): string {
    return t('intelligence.capabilityTest.hint.embedding')
  }

  requiresUserInput(): boolean {
    return true
  }
}
