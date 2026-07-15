import type {
  IntelligenceGrammarCheckPayload,
  IntelligenceGrammarCheckResult,
  IntelligenceInvokeResult,
  IntelligenceRewritePayload
} from '@talex-touch/tuff-intelligence'
import type { CapabilityTestPayload } from './base-tester'
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
      message: '文本改写测试成功',
      textPreview: preview
    })
  }

  getDefaultInputHint(): string {
    return '请输入要改写的文本'
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
      message: `语法检查完成，发现 ${issueCount} 个问题，评分 ${result.result?.score ?? 0}`,
      textPreview: correctedText
    })
  }

  getDefaultInputHint(): string {
    return '请输入要检查语法、拼写或风格的文本'
  }

  requiresUserInput(): boolean {
    return true
  }
}
