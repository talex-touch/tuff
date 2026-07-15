import type {
  IntelligenceClassificationPayload,
  IntelligenceClassificationResult,
  IntelligenceContentExtractPayload,
  IntelligenceContentExtractResult,
  IntelligenceIntentDetectResult,
  IntelligenceInvokeResult,
  IntelligenceKeywordsExtractResult,
  IntelligenceSentimentAnalyzeResult
} from '@talex-touch/tuff-intelligence'
import type { CapabilityTestPayload } from './base-tester'
import { BaseCapabilityTester } from './base-tester'

export class IntentDetectTester extends BaseCapabilityTester {
  readonly capabilityType = 'intent-detect'

  async generateTestPayload(input: CapabilityTestPayload): Promise<unknown> {
    const text = input.userInput || '帮我打开聊天应用'
    return {
      text,
      possibleIntents: ['open_app', 'search', 'calculate', 'translate', 'unknown']
    }
  }

  formatTestResult(result: IntelligenceInvokeResult<IntelligenceIntentDetectResult>) {
    const intent = result.result?.intent || 'unknown'
    const confidence = result.result?.confidence || 0

    return this.buildTestResult(result, {
      message: `意图识别: ${intent} (置信度: ${(confidence * 100).toFixed(1)}%)`,
      textPreview: JSON.stringify(result.result, null, 2)
    })
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

  formatTestResult(result: IntelligenceInvokeResult<IntelligenceSentimentAnalyzeResult>) {
    const sentiment = result.result?.sentiment || 'neutral'
    const score = result.result?.score || 0

    return this.buildTestResult(result, {
      message: `情感分析: ${sentiment} (得分: ${score.toFixed(2)})`,
      textPreview: JSON.stringify(result.result, null, 2)
    })
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

  formatTestResult(result: IntelligenceInvokeResult<IntelligenceKeywordsExtractResult>) {
    const keywords = result.result?.keywords || []
    const keywordList = keywords.map((k) => k.term).join(', ')

    return this.buildTestResult(result, {
      message: `提取了 ${keywords.length} 个关键词`,
      textPreview: keywordList || '无关键词'
    })
  }

  getDefaultInputHint(): string {
    return '请输入要提取关键词的文本'
  }

  requiresUserInput(): boolean {
    return true
  }
}

export class ContentExtractTester extends BaseCapabilityTester<
  IntelligenceContentExtractPayload,
  IntelligenceContentExtractResult
> {
  readonly capabilityType = 'content-extract'

  async generateTestPayload(
    input: CapabilityTestPayload
  ): Promise<IntelligenceContentExtractPayload> {
    return {
      text:
        input.userInput ||
        'Talex 团队计划在 2026-07-15 发布 Touch AI SDK，联系人是 dev@example.com。',
      extractTypes: ['dates', 'people', 'organizations', 'products', 'emails'],
      language: 'zh-CN',
      includeContext: true
    }
  }

  formatTestResult(result: IntelligenceInvokeResult<IntelligenceContentExtractResult>) {
    const entities = result.result?.entities || {}
    const entityCount = Object.values(entities).reduce((count, items) => count + items.length, 0)

    return this.buildTestResult(result, {
      message: `内容抽取完成，识别 ${entityCount} 个实体`,
      textPreview: JSON.stringify(result.result, null, 2)
    })
  }

  getDefaultInputHint(): string {
    return '请输入要抽取日期、人物、组织或联系方式的文本'
  }

  requiresUserInput(): boolean {
    return true
  }
}

export class TextClassifyTester extends BaseCapabilityTester<
  IntelligenceClassificationPayload,
  IntelligenceClassificationResult
> {
  readonly capabilityType = 'text-classify'

  async generateTestPayload(
    input: CapabilityTestPayload
  ): Promise<IntelligenceClassificationPayload> {
    return {
      text: input.userInput || '帮我把最近复制的会议记录整理成行动项并提醒我跟进。',
      categories: ['search', 'automation', 'writing', 'reminder', 'developer-tool'],
      multiLabel: true,
      threshold: 0.3
    }
  }

  formatTestResult(result: IntelligenceInvokeResult<IntelligenceClassificationResult>) {
    const predictions = result.result?.predictions || []
    const preview = predictions
      .map((item) => `${item.category} ${(item.confidence * 100).toFixed(1)}%`)
      .join(', ')

    return this.buildTestResult(result, {
      message: `文本分类完成，返回 ${predictions.length} 个分类`,
      textPreview: preview || result.result?.explanation || ''
    })
  }

  getDefaultInputHint(): string {
    return '请输入要分类的文本'
  }

  requiresUserInput(): boolean {
    return true
  }
}
