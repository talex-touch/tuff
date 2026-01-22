import type { AiInvokeResult, IntelligenceEmbeddingPayload } from '@talex-touch/utils'
import type { CapabilityTestPayload } from './base-tester'
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

  formatTestResult(result: AiInvokeResult<number[]>) {
    const vectorLength = result.result.length
    const preview = `向量维度: ${vectorLength}, 前5个值: [${result.result
      .slice(0, 5)
      .map((v) => v.toFixed(4))
      .join(', ')}...]`

    return {
      success: true,
      message: 'Embedding 测试成功',
      textPreview: preview,
      provider: result.provider,
      model: result.model,
      latency: result.latency
    }
  }

  getDefaultInputHint(): string {
    return '请输入要生成向量的文本'
  }

  requiresUserInput(): boolean {
    return true
  }
}
