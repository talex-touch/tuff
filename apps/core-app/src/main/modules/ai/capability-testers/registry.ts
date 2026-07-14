import type { BaseCapabilityTester } from './base-tester'
import {
  ContentExtractTester,
  IntentDetectTester,
  KeywordsExtractTester,
  SentimentAnalyzeTester,
  TextClassifyTester,
} from './analysis-tester'
import { AudioTranscribeTester, SttCapabilityTester, TtsCapabilityTester } from './audio-tester'
import { ChatCapabilityTester } from './chat-tester'
import {
  CodeDebugTester,
  CodeExplainTester,
  CodeGenerateTester,
  CodeRefactorTester,
  CodeReviewTester,
} from './code-tester'
import { EmbeddingCapabilityTester } from './embedding-tester'
import {
  ImageAnalyzeTester,
  ImageCaptionTester,
  ImageEditTester,
  ImageGenerateTester,
  ImageTranslateE2eTester,
} from './image-tester'
import { RagQueryTester, RerankTester, SemanticSearchTester } from './search-tester'
import { SummarizeCapabilityTester } from './summarize-tester'
import { GrammarCheckTester, TextRewriteTester } from './text-tester'
import { TranslateCapabilityTester } from './translate-tester'
import { VisionCapabilityTester } from './vision-tester'
import { AgentRunTester, WorkflowExecuteTester } from './workflow-agent-tester'

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
capabilityTesterRegistry.register('text.rewrite', new TextRewriteTester())
capabilityTesterRegistry.register('text.grammar', new GrammarCheckTester())
capabilityTesterRegistry.register('text.classify', new TextClassifyTester())

// Embedding capabilities
capabilityTesterRegistry.register('embedding.generate', new EmbeddingCapabilityTester())

// Code capabilities
capabilityTesterRegistry.register('code.generate', new CodeGenerateTester())
capabilityTesterRegistry.register('code.explain', new CodeExplainTester())
capabilityTesterRegistry.register('code.review', new CodeReviewTester())
capabilityTesterRegistry.register('code.refactor', new CodeRefactorTester())
capabilityTesterRegistry.register('code.debug', new CodeDebugTester())

// Analysis capabilities
capabilityTesterRegistry.register('intent.detect', new IntentDetectTester())
capabilityTesterRegistry.register('sentiment.analyze', new SentimentAnalyzeTester())
capabilityTesterRegistry.register('content.extract', new ContentExtractTester())
capabilityTesterRegistry.register('keywords.extract', new KeywordsExtractTester())

// Vision capabilities
capabilityTesterRegistry.register('vision.ocr', new VisionCapabilityTester())
capabilityTesterRegistry.register('image.caption', new ImageCaptionTester())
capabilityTesterRegistry.register('image.analyze', new ImageAnalyzeTester())
capabilityTesterRegistry.register('image.translate.e2e', new ImageTranslateE2eTester())
capabilityTesterRegistry.register('image.generate', new ImageGenerateTester())
capabilityTesterRegistry.register('image.edit', new ImageEditTester())

// Audio capabilities
capabilityTesterRegistry.register('audio.tts', new TtsCapabilityTester())
capabilityTesterRegistry.register('audio.stt', new SttCapabilityTester())
capabilityTesterRegistry.register('audio.transcribe', new AudioTranscribeTester())

// RAG & Search capabilities
capabilityTesterRegistry.register('rag.query', new RagQueryTester())
capabilityTesterRegistry.register('search.semantic', new SemanticSearchTester())
capabilityTesterRegistry.register('search.rerank', new RerankTester())

// Workflow & Agent capabilities
capabilityTesterRegistry.register('workflow.execute', new WorkflowExecuteTester())
capabilityTesterRegistry.register('agent.run', new AgentRunTester())
