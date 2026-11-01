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
import { t } from '../../../utils/i18n-helper'
import { BaseCapabilityTester } from './base-tester'

const SENTIMENT_KEYS: Record<IntelligenceSentimentAnalyzeResult['sentiment'], string> = {
  positive: 'intelligence.capabilityTest.sentiment.positive',
  negative: 'intelligence.capabilityTest.sentiment.negative',
  neutral: 'intelligence.capabilityTest.sentiment.neutral',
  mixed: 'intelligence.capabilityTest.sentiment.mixed'
}

/**
 * A sentiment in the interface's words. A value the type doesn't name is shown as the model
 * gave it.
 */
function sentimentLabel(sentiment: IntelligenceSentimentAnalyzeResult['sentiment']): string {
  const key: string | undefined = SENTIMENT_KEYS[sentiment]
  return key ? t(key) : sentiment
}

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
    const intent = result.result?.intent || t('intelligence.capabilityTest.preview.unknown')
    const confidence = result.result?.confidence || 0

    return this.buildTestResult(result, {
      message: t('intelligence.capabilityTest.message.intentDetect', {
        intent,
        confidence: (confidence * 100).toFixed(1)
      }),
      textPreview: JSON.stringify(result.result, null, 2)
    })
  }

  getDefaultInputHint(): string {
    return t('intelligence.capabilityTest.hint.intentDetect')
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
      message: t('intelligence.capabilityTest.message.sentimentAnalyze', {
        sentiment: sentimentLabel(sentiment),
        score: score.toFixed(2)
      }),
      textPreview: JSON.stringify(result.result, null, 2)
    })
  }

  getDefaultInputHint(): string {
    return t('intelligence.capabilityTest.hint.sentimentAnalyze')
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
      message: t('intelligence.capabilityTest.message.keywordsExtract', { count: keywords.length }),
      textPreview: keywordList || t('intelligence.capabilityTest.preview.noKeywords')
    })
  }

  getDefaultInputHint(): string {
    return t('intelligence.capabilityTest.hint.keywordsExtract')
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
      message: t('intelligence.capabilityTest.message.contentExtract', { count: entityCount }),
      textPreview: JSON.stringify(result.result, null, 2)
    })
  }

  getDefaultInputHint(): string {
    return t('intelligence.capabilityTest.hint.contentExtract')
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
      message: t('intelligence.capabilityTest.message.textClassify', { count: predictions.length }),
      textPreview: preview || result.result?.explanation || ''
    })
  }

  getDefaultInputHint(): string {
    return t('intelligence.capabilityTest.hint.textClassify')
  }

  requiresUserInput(): boolean {
    return true
  }
}
