import type { IntelligenceCodeGenerateResult, IntelligenceCodeReviewResult, AiInvokeResult } from '@talex-touch/utils'
import type { CapabilityTestPayload } from './base-tester'
import { BaseCapabilityTester } from './base-tester'

export class CodeGenerateTester extends BaseCapabilityTester {
  readonly capabilityType = 'code-generate'

  async generateTestPayload(input: CapabilityTestPayload): Promise<any> {
    const description = input.userInput || 'Write a function to calculate fibonacci numbers'
    return {
      description,
      language: 'typescript',
      includeComments: true,
    }
  }

  formatTestResult(result: AiInvokeResult<IntelligenceCodeGenerateResult>) {
    const code = result.result?.code || ''
    const preview = code.length > 300 ? `${code.slice(0, 300)}...` : code

    return {
      success: true,
      message: '代码生成测试成功',
      textPreview: preview,
      provider: result.provider,
      model: result.model,
      latency: result.latency,
    }
  }

  getDefaultInputHint(): string {
    return '请描述要生成的代码功能，例如：写一个排序函数'
  }

  requiresUserInput(): boolean {
    return true
  }
}

export class CodeReviewTester extends BaseCapabilityTester {
  readonly capabilityType = 'code-review'

  async generateTestPayload(input: CapabilityTestPayload): Promise<any> {
    const code = input.userInput || `function add(a, b) {
  return a + b
}

function multiply(x, y) {
  var result = x * y;
  return result
}`
    return {
      code,
      language: 'javascript',
      focusAreas: ['bugs', 'style', 'best-practices'],
    }
  }

  formatTestResult(result: AiInvokeResult<IntelligenceCodeReviewResult>) {
    const summary = result.result?.summary || ''
    const issueCount = result.result?.issues?.length || 0

    return {
      success: true,
      message: `代码审查完成，发现 ${issueCount} 个问题`,
      textPreview: summary,
      provider: result.provider,
      model: result.model,
      latency: result.latency,
    }
  }

  getDefaultInputHint(): string {
    return '请输入要审查的代码'
  }

  requiresUserInput(): boolean {
    return true
  }
}
