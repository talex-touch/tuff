import type {
  AiInvokeResult,
  IntelligenceIntentDetectResult,
  IntelligenceKeywordsExtractResult,
  IntelligenceSentimentAnalyzeResult
} from '@talex-touch/utils'
import type { CapabilityTestPayload } from './base-tester'
import { BaseCapabilityTester } from './base-tester'

export class IntentDetectTester extends BaseCapabilityTester {
  readonly capabilityType = 'intent-detect'

  async generateTestPayload(input: CapabilityTestPayload): Promise<unknown> {
    const text = input.userInput || '帮我打开微信'
    return {
      text,
      possibleIntents: ['open_app', 'search', 'calculate', 'translate', 'unknown']
    }
  }

  formatTestResult(result: AiInvokeResult<IntelligenceIntentDetectResult>) {
    const intent = result.result?.intent || 'unknown'
    const confidence = result.result?.confidence || 0

    return {
      success: true,
      message: `意图识别: ${intent} (置信度: ${(confidence * 100).toFixed(1)}%)`,
      textPreview: JSON.stringify(result.result, null, 2),
      provider: result.provider,
      model: result.model,
      latency: result.latency
    }
  }

  getDefaultInputHint(): string {
    return '请输入要识别意图的文本，例如：打开计算器'
  }

  requiresUserInput(): boolean {
    return true
  }
}

export class SentimentAnalyzeTester extends BaseCapabilityTester {
  readonly capabilityType = 'sentiment-analyze'

  async generateTestPayload(input: CapabilityTestPayload): Promise<unknown> {
    const text = input.userInput || '这个产品真的太棒了，我非常喜欢！'
    return {
      text,
      granularity: 'document'
    }
  }

  formatTestResult(result: AiInvokeResult<IntelligenceSentimentAnalyzeResult>) {
    const sentiment = result.result?.sentiment || 'neutral'
    const score = result.result?.score || 0

    return {
      success: true,
      message: `情感分析: ${sentiment} (得分: ${score.toFixed(2)})`,
      textPreview: JSON.stringify(result.result, null, 2),
      provider: result.provider,
      model: result.model,
      latency: result.latency
    }
  }

  getDefaultInputHint(): string {
    return '请输入要分析情感的文本'
  }

  requiresUserInput(): boolean {
    return true
  }
}

export class KeywordsExtractTester extends BaseCapabilityTester {
  readonly capabilityType = 'keywords-extract'

  async generateTestPayload(input: CapabilityTestPayload): Promise<unknown> {
    const text =
      input.userInput ||
      '人工智能正在改变我们的生活方式，从智能手机到自动驾驶汽车，AI技术无处不在。'
    return {
      text,
      maxKeywords: 5
    }
  }

  formatTestResult(result: AiInvokeResult<IntelligenceKeywordsExtractResult>) {
    const keywords = result.result?.keywords || []
    const keywordList = keywords.map((k) => k.term).join(', ')

    return {
      success: true,
      message: `提取了 ${keywords.length} 个关键词`,
      textPreview: keywordList || '无关键词',
      provider: result.provider,
      model: result.model,
      latency: result.latency
    }
  }

  getDefaultInputHint(): string {
    return '请输入要提取关键词的文本'
  }

  requiresUserInput(): boolean {
    return true
  }
}
