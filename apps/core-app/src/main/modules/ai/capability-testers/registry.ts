import type { BaseCapabilityTester } from './base-tester'
import { IntentDetectTester, KeywordsExtractTester, SentimentAnalyzeTester } from './analysis-tester'
import { ChatCapabilityTester } from './chat-tester'
import { CodeGenerateTester, CodeReviewTester } from './code-tester'
import { EmbeddingCapabilityTester } from './embedding-tester'
import { SummarizeCapabilityTester } from './summarize-tester'
import { TranslateCapabilityTester } from './translate-tester'
import { VisionCapabilityTester } from './vision-tester'

class CapabilityTesterRegistry {
  private testers = new Map<string, BaseCapabilityTester>()

  register(capabilityId: string, tester: BaseCapabilityTester): void {
    this.testers.set(capabilityId, tester)
  }

  get(capabilityId: string): BaseCapabilityTester | undefined {
    return this.testers.get(capabilityId)
  }

  has(capabilityId: string): boolean {
    return this.testers.has(capabilityId)
  }
}

export const capabilityTesterRegistry = new CapabilityTesterRegistry()

// Text capabilities
capabilityTesterRegistry.register('text.chat', new ChatCapabilityTester())
capabilityTesterRegistry.register('text.translate', new TranslateCapabilityTester())
capabilityTesterRegistry.register('text.summarize', new SummarizeCapabilityTester())

// Embedding capabilities
capabilityTesterRegistry.register('embedding.generate', new EmbeddingCapabilityTester())

// Vision capabilities
capabilityTesterRegistry.register('vision.ocr', new VisionCapabilityTester())

// Code capabilities
capabilityTesterRegistry.register('code.generate', new CodeGenerateTester())
capabilityTesterRegistry.register('code.review', new CodeReviewTester())

// Analysis capabilities
capabilityTesterRegistry.register('intent.detect', new IntentDetectTester())
capabilityTesterRegistry.register('sentiment.analyze', new SentimentAnalyzeTester())
capabilityTesterRegistry.register('keywords.extract', new KeywordsExtractTester())
