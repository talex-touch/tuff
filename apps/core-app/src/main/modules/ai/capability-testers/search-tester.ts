import type {
  IntelligenceInvokeResult,
  IntelligenceRAGQueryPayload,
  IntelligenceRAGQueryResult,
  IntelligenceRerankPayload,
  IntelligenceRerankResult,
  IntelligenceSemanticSearchPayload,
  IntelligenceSemanticSearchResult
} from '@talex-touch/tuff-intelligence'
import type { CapabilityTestPayload } from './base-tester'
import { BaseCapabilityTester } from './base-tester'

const SAMPLE_DOCUMENTS = [
  {
    id: 'alfred',
    content: 'Alfred provides keyboard-first launcher workflows, snippets, clipboard history, and automation.',
    metadata: { product: 'Alfred' }
  },
  {
    id: 'utools',
    content: 'uTools focuses on plugin-driven quick actions, search, translation, OCR, and local productivity tools.',
    metadata: { product: 'uTools' }
  },
  {
    id: 'talex-touch',
    content: 'Talex Touch combines desktop command palette, AI capability routing, SDK APIs, and workflow execution.',
    metadata: { product: 'Talex Touch' }
  }
]

export class RagQueryTester extends BaseCapabilityTester<
  IntelligenceRAGQueryPayload,
  IntelligenceRAGQueryResult
> {
  readonly capabilityType = 'rag-query'

  async generateTestPayload(input: CapabilityTestPayload): Promise<IntelligenceRAGQueryPayload> {
    return {
      query: input.userInput || 'Talex Touch 如何对标 Alfred 和 uTools 的效率能力？',
      documents: SAMPLE_DOCUMENTS,
      topK: 2,
      threshold: 0.1,
      rerank: true,
      includeContext: true
    }
  }

  formatTestResult(result: IntelligenceInvokeResult<IntelligenceRAGQueryResult>) {
    const sourceCount = result.result?.sources?.length || 0

    return this.buildTestResult(result, {
      message: `RAG 查询完成，引用 ${sourceCount} 个来源，置信度 ${(result.result?.confidence ?? 0).toFixed(2)}`,
      textPreview: result.result?.answer || ''
    })
  }

  getDefaultInputHint(): string {
    return '请输入要基于内置示例文档回答的问题'
  }

  requiresUserInput(): boolean {
    return true
  }
}

export class SemanticSearchTester extends BaseCapabilityTester<
  IntelligenceSemanticSearchPayload,
  IntelligenceSemanticSearchResult
> {
  readonly capabilityType = 'semantic-search'

  async generateTestPayload(input: CapabilityTestPayload): Promise<IntelligenceSemanticSearchPayload> {
    return {
      query: input.userInput || 'plugin quick action automation',
      documents: SAMPLE_DOCUMENTS,
      topK: 3,
      threshold: 0.1
    }
  }

  formatTestResult(result: IntelligenceInvokeResult<IntelligenceSemanticSearchResult>) {
    const results = result.result?.results || []
    const preview = results.map((item) => `${item.id} ${(item.score * 100).toFixed(1)}%`).join(', ')

    return this.buildTestResult(result, {
      message: `语义搜索完成，返回 ${results.length} 条结果`,
      textPreview: preview
    })
  }

  getDefaultInputHint(): string {
    return '请输入语义搜索查询'
  }

  requiresUserInput(): boolean {
    return true
  }
}

export class RerankTester extends BaseCapabilityTester<IntelligenceRerankPayload, IntelligenceRerankResult> {
  readonly capabilityType = 'rerank'

  async generateTestPayload(input: CapabilityTestPayload): Promise<IntelligenceRerankPayload> {
    return {
      query: input.userInput || 'best launcher workflow automation experience',
      documents: SAMPLE_DOCUMENTS,
      topK: 3
    }
  }

  formatTestResult(result: IntelligenceInvokeResult<IntelligenceRerankResult>) {
    const results = result.result?.results || []
    const preview = results
      .map((item) => `${item.id}: rank ${item.originalRank} → ${(item.score * 100).toFixed(1)}%`)
      .join('\n')

    return this.buildTestResult(result, {
      message: `文档重排序完成，返回 ${results.length} 条结果`,
      textPreview: preview
    })
  }

  getDefaultInputHint(): string {
    return '请输入用于文档重排序的查询'
  }

  requiresUserInput(): boolean {
    return true
  }
}
