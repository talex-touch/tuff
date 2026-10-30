import type {
  IntelligenceGrammarCheckPayload,
  IntelligenceGrammarCheckResult,
  IntelligenceInvokeResult,
  IntelligenceRewritePayload
} from '@talex-touch/tuff-intelligence'
import type { CapabilityTestPayload } from './base-tester'
import { t } from '../../../utils/i18n-helper'
import { BaseCapabilityTester } from './base-tester'

export class TextRewriteTester extends BaseCapabilityTester<IntelligenceRewritePayload, string> {
  readonly capabilityType = 'text-rewrite'

  async generateTestPayload(input: CapabilityTestPayload): Promise<IntelligenceRewritePayload> {
    return {
      text:
        input.userInput ||
        '这段说明太长且重点不清，请改写成适合 Alfred / uTools 风格快速启动器的产品介绍。',
      style: 'professional',
      tone: 'friendly',
      targetAudience: '效率工具用户',
      preserveKeywords: ['Alfred', 'uTools']
    }
  }

  formatTestResult(result: IntelligenceInvokeResult<string>) {
    const preview = result.result.length > 300 ? `${result.result.slice(0, 300)}...` : result.result

    return this.buildTestResult(result, {
      message: t('intelligence.capabilityTest.message.textRewrite'),
      textPreview: preview
    })
  }

  getDefaultInputHint(): string {
    return t('intelligence.capabilityTest.hint.textRewrite')
  }

  requiresUserInput(): boolean {
    return true
  }
}

export class GrammarCheckTester extends BaseCapabilityTester<
  IntelligenceGrammarCheckPayload,
  IntelligenceGrammarCheckResult
> {
  readonly capabilityType = 'grammar-check'

  async generateTestPayload(
    input: CapabilityTestPayload
  ): Promise<IntelligenceGrammarCheckPayload> {
    return {
      text: input.userInput || 'This are a short sentence with grammar mistake.',
      language: 'en',
      checkTypes: ['spelling', 'grammar', 'punctuation', 'style'],
      strictness: 'standard'
    }
  }

  formatTestResult(result: IntelligenceInvokeResult<IntelligenceGrammarCheckResult>) {
    const issueCount = result.result?.issues?.length || 0
    const correctedText = result.result?.correctedText || ''

    return this.buildTestResult(result, {
      message: t('intelligence.capabilityTest.message.grammarCheck', {
        count: issueCount,
        score: result.result?.score ?? 0
      }),
      textPreview: correctedText
    })
  }

  getDefaultInputHint(): string {
    return t('intelligence.capabilityTest.hint.grammarCheck')
  }

  requiresUserInput(): boolean {
    return true
  }
}
