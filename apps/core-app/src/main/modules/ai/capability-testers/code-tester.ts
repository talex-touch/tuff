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
  IntelligenceInvokeResult
} from '@talex-touch/tuff-intelligence'
import type { CapabilityTestPayload } from './base-tester'
import { t } from '../../../utils/i18n-helper'
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

  async generateTestPayload(
    input: CapabilityTestPayload
  ): Promise<IntelligenceCodeGeneratePayload> {
    const description = input.userInput || 'Write a function to calculate fibonacci numbers'
    return {
      description,
      language: 'typescript',
      includeComments: true
    }
  }

  formatTestResult(result: IntelligenceInvokeResult<IntelligenceCodeGenerateResult>) {
    const code = result.result?.code || ''
    const preview = code.length > 300 ? `${code.slice(0, 300)}...` : code

    return this.buildTestResult(result, {
      message: t('intelligence.capabilityTest.message.codeGenerate'),
      textPreview: preview
    })
  }

  getDefaultInputHint(): string {
    return t('intelligence.capabilityTest.hint.codeGenerate')
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
      targetAudience: 'intermediate'
    }
  }

  formatTestResult(result: IntelligenceInvokeResult<IntelligenceCodeExplainResult>) {
    const summary = result.result?.summary || result.result?.explanation || ''
    const preview = summary.length > 300 ? `${summary.slice(0, 300)}...` : summary

    return this.buildTestResult(result, {
      message: t('intelligence.capabilityTest.message.codeExplain', {
        count: result.result?.keyPoints?.length || 0
      }),
      textPreview: preview
    })
  }

  getDefaultInputHint(): string {
    return t('intelligence.capabilityTest.hint.codeExplain')
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
      focusAreas: ['bugs', 'style', 'best-practices']
    }
  }

  formatTestResult(result: IntelligenceInvokeResult<IntelligenceCodeReviewResult>) {
    const summary = result.result?.summary || ''
    const issueCount = result.result?.issues?.length || 0

    return this.buildTestResult(result, {
      message: t('intelligence.capabilityTest.message.codeReview', { count: issueCount }),
      textPreview: summary
    })
  }

  getDefaultInputHint(): string {
    return t('intelligence.capabilityTest.hint.codeReview')
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

  async generateTestPayload(
    input: CapabilityTestPayload
  ): Promise<IntelligenceCodeRefactorPayload> {
    return {
      code: input.userInput || DEFAULT_JAVASCRIPT_SAMPLE,
      language: 'javascript',
      goals: ['readability', 'maintainability'],
      preserveInterface: true
    }
  }

  formatTestResult(result: IntelligenceInvokeResult<IntelligenceCodeRefactorResult>) {
    const code = result.result?.refactoredCode || ''
    const preview = code.length > 300 ? `${code.slice(0, 300)}...` : code

    return this.buildTestResult(result, {
      message: t('intelligence.capabilityTest.message.codeRefactor', {
        count: result.result?.changes?.length || 0
      }),
      textPreview: preview || result.result?.explanation || ''
    })
  }

  getDefaultInputHint(): string {
    return t('intelligence.capabilityTest.hint.codeRefactor')
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
        input.userInput ||
        `function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

console.log(average([]))`,
      language: 'javascript',
      error: 'average([]) returns NaN',
      context: 'Fix the edge case without changing the public function name.'
    }
  }

  formatTestResult(result: IntelligenceInvokeResult<IntelligenceCodeDebugResult>) {
    const diagnosis = result.result?.diagnosis || result.result?.rootCause || ''

    return this.buildTestResult(result, {
      message: t('intelligence.capabilityTest.message.codeDebug'),
      textPreview: diagnosis || result.result?.explanation || result.result?.fixedCode || ''
    })
  }

  getDefaultInputHint(): string {
    return t('intelligence.capabilityTest.hint.codeDebug')
  }

  requiresUserInput(): boolean {
    return true
  }
}
