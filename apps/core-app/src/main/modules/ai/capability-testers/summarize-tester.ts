import type { AiInvokeResult } from '@talex-touch/utils'
import type { CapabilityTestPayload } from './base-tester'
import { BaseCapabilityTester } from './base-tester'

export class SummarizeCapabilityTester extends BaseCapabilityTester {
  readonly capabilityType = 'summarize'

  async generateTestPayload(input: CapabilityTestPayload): Promise<any> {
    const text = input.userInput || `人工智能（Artificial Intelligence，简称AI）是计算机科学的一个分支，它企图了解智能的实质，并生产出一种新的能以人类智能相似的方式做出反应的智能机器。人工智能的研究包括机器人、语言识别、图像识别、自然语言处理和专家系统等。人工智能从诞生以来，理论和技术日益成熟，应用领域也不断扩大，可以设想，未来人工智能带来的科技产品，将会是人类智慧的"容器"。`
    return {
      text,
      maxLength: 100,
      style: 'concise',
    }
  }

  formatTestResult(result: AiInvokeResult<string>) {
    const preview = result.result.length > 200
      ? `${result.result.slice(0, 200)}...`
      : result.result

    return {
      success: true,
      message: '摘要生成成功',
      textPreview: preview,
      provider: result.provider,
      model: result.model,
      latency: result.latency,
    }
  }

  getDefaultInputHint(): string {
    return '请输入要摘要的长文本'
  }

  requiresUserInput(): boolean {
    return true
  }
}
