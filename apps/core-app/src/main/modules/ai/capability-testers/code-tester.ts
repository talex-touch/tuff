import type {
  IntelligenceCodeDebugPayload,
  IntelligenceCodeDebugResult,
  IntelligenceCodeExplainPayload,
  IntelligenceCodeExplainResult,
  IntelligenceCodeGeneratePayload,
  IntelligenceCodeGenerateResult,
  IntelligenceCodeRefactorPayload,
  IntelligenceCodeRefactorResult,
  IntelligenceCodeReviewPayload,
  IntelligenceCodeReviewResult,
  IntelligenceInvokeResult,
} from '@talex-touch/tuff-intelligence'
import type { CapabilityTestPayload } from './base-tester'
import { BaseCapabilityTester } from './base-tester'

const DEFAULT_JAVASCRIPT_SAMPLE = `function add(a, b) {
  return a + b
}

function multiply(x, y) {
  var result = x * y;
  return result
}`

export class CodeGenerateTester extends BaseCapabilityTester<
  IntelligenceCodeGeneratePayload,
  IntelligenceCodeGenerateResult
> {
  readonly capabilityType = 'code-generate'

  async generateTestPayload(input: CapabilityTestPayload): Promise<IntelligenceCodeGeneratePayload> {
    const description = input.userInput || 'Write a function to calculate fibonacci numbers'
    return {
      description,
      language: 'typescript',
      includeComments: true,
    }
  }

  formatTestResult(result: IntelligenceInvokeResult<IntelligenceCodeGenerateResult>) {
    const code = result.result?.code || ''
    const preview = code.length > 300 ? `${code.slice(0, 300)}...` : code

    return this.buildTestResult(result, {
      message: '代码生成测试成功',
      textPreview: preview,
    })
  }

  getDefaultInputHint(): string {
    return '请描述要生成的代码功能，例如：写一个排序函数'
  }

  requiresUserInput(): boolean {
    return true
  }
}

export class CodeExplainTester extends BaseCapabilityTester<
  IntelligenceCodeExplainPayload,
  IntelligenceCodeExplainResult
> {
  readonly capabilityType = 'code-explain'

  async generateTestPayload(input: CapabilityTestPayload): Promise<IntelligenceCodeExplainPayload> {
    return {
      code: input.userInput || DEFAULT_JAVASCRIPT_SAMPLE,
      language: 'javascript',
      depth: 'detailed',
      targetAudience: 'intermediate',
    }
  }

  formatTestResult(result: IntelligenceInvokeResult<IntelligenceCodeExplainResult>) {
    const summary = result.result?.summary || result.result?.explanation || ''
    const preview = summary.length > 300 ? `${summary.slice(0, 300)}...` : summary

    return this.buildTestResult(result, {
      message: `代码解释完成，提炼 ${result.result?.keyPoints?.length || 0} 个要点`,
      textPreview: preview,
    })
  }

  getDefaultInputHint(): string {
    return '请输入要解释的代码'
  }

  requiresUserInput(): boolean {
    return true
  }
}

export class CodeReviewTester extends BaseCapabilityTester<
  IntelligenceCodeReviewPayload,
  IntelligenceCodeReviewResult
> {
  readonly capabilityType = 'code-review'

  async generateTestPayload(input: CapabilityTestPayload): Promise<IntelligenceCodeReviewPayload> {
    return {
      code: input.userInput || DEFAULT_JAVASCRIPT_SAMPLE,
      language: 'javascript',
      focusAreas: ['bugs', 'style', 'best-practices'],
    }
  }

  formatTestResult(result: IntelligenceInvokeResult<IntelligenceCodeReviewResult>) {
    const summary = result.result?.summary || ''
    const issueCount = result.result?.issues?.length || 0

    return this.buildTestResult(result, {
      message: `代码审查完成，发现 ${issueCount} 个问题`,
      textPreview: summary,
    })
  }

  getDefaultInputHint(): string {
    return '请输入要审查的代码'
  }

  requiresUserInput(): boolean {
    return true
  }
}

export class CodeRefactorTester extends BaseCapabilityTester<
  IntelligenceCodeRefactorPayload,
  IntelligenceCodeRefactorResult
> {
  readonly capabilityType = 'code-refactor'

  async generateTestPayload(input: CapabilityTestPayload): Promise<IntelligenceCodeRefactorPayload> {
    return {
      code: input.userInput || DEFAULT_JAVASCRIPT_SAMPLE,
      language: 'javascript',
      goals: ['readability', 'maintainability'],
      preserveInterface: true,
    }
  }

  formatTestResult(result: IntelligenceInvokeResult<IntelligenceCodeRefactorResult>) {
    const code = result.result?.refactoredCode || ''
    const preview = code.length > 300 ? `${code.slice(0, 300)}...` : code

    return this.buildTestResult(result, {
      message: `代码重构完成，包含 ${result.result?.changes?.length || 0} 项变更`,
      textPreview: preview || result.result?.explanation || '',
    })
  }

  getDefaultInputHint(): string {
    return '请输入要重构的代码'
  }

  requiresUserInput(): boolean {
    return true
  }
}

export class CodeDebugTester extends BaseCapabilityTester<
  IntelligenceCodeDebugPayload,
  IntelligenceCodeDebugResult
> {
  readonly capabilityType = 'code-debug'

  async generateTestPayload(input: CapabilityTestPayload): Promise<IntelligenceCodeDebugPayload> {
    return {
      code:
        input.userInput
        || `function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

console.log(average([]))`,
      language: 'javascript',
      error: 'average([]) returns NaN',
      context: 'Fix the edge case without changing the public function name.',
    }
  }

  formatTestResult(result: IntelligenceInvokeResult<IntelligenceCodeDebugResult>) {
    const diagnosis = result.result?.diagnosis || result.result?.rootCause || ''

    return this.buildTestResult(result, {
      message: '代码调试分析完成',
      textPreview: diagnosis || result.result?.explanation || result.result?.fixedCode || '',
    })
  }

  getDefaultInputHint(): string {
    return '请输入要调试的代码，可附带报错信息'
  }

  requiresUserInput(): boolean {
    return true
  }
}
