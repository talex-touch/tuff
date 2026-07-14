export type IntelligenceCapabilityNamespace = 'runtime' | 'registry'

const RUNTIME_CAPABILITY_ALIASES: Record<string, string> = {
  'chat.completion': 'text.chat',
  'chat': 'text.chat',
  'completion': 'text.chat',
  'text.completion': 'text.chat',
  'completion.create': 'text.chat',
  'translation.text': 'text.translate',
  'translation': 'text.translate',
  'translate': 'text.translate',
  'summarize': 'text.summarize',
  'summary': 'text.summarize',
  'text.summary': 'text.summarize',
  'rewrite': 'text.rewrite',
  'grammar': 'text.grammar',
  'grammar-check': 'text.grammar',
  'text.grammar-check': 'text.grammar',
  'classify': 'text.classify',
  'classification': 'text.classify',
  'text.classification': 'text.classify',
  'content-extract': 'content.extract',
  'content.extraction': 'content.extract',
  'keyword.extract': 'keywords.extract',
  'keywords-extract': 'keywords.extract',
  'keywords.generate': 'keywords.extract',
  'intent-detect': 'intent.detect',
  'sentiment-analyze': 'sentiment.analyze',
  'code-generate': 'code.generate',
  'code-explain': 'code.explain',
  'code-review': 'code.review',
  'code-refactor': 'code.refactor',
  'code-debug': 'code.debug',
  'vision': 'vision.ocr',
  'vision-ocr': 'vision.ocr',
  'ocr': 'vision.ocr',
  'image.ocr': 'vision.ocr',
  'image-to-text': 'vision.ocr',
  'image-caption': 'image.caption',
  'image.captioning': 'image.caption',
  'image.describe': 'image.caption',
  'vision.caption': 'image.caption',
  'image-analyze': 'image.analyze',
  'image.analysis': 'image.analyze',
  'vision.analyze': 'image.analyze',
  'image-translate-e2e': 'image.translate.e2e',
  'image.translation': 'image.translate.e2e',
  'image.translate': 'image.translate.e2e',
  'vision.translate': 'image.translate.e2e',
  'image-generate': 'image.generate',
  'image.generation': 'image.generate',
  'image.create': 'image.generate',
  'images.generate': 'image.generate',
  'image-edit': 'image.edit',
  'image.variation': 'image.edit',
  'image.inpaint': 'image.edit',
  'images.edit': 'image.edit',
  'tts': 'audio.tts',
  'text-to-speech': 'audio.tts',
  'audio.speech': 'audio.tts',
  'stt': 'audio.stt',
  'audio-stt': 'audio.stt',
  'speech-to-text': 'audio.stt',
  'transcribe': 'audio.transcribe',
  'transcription': 'audio.transcribe',
  'audio-transcribe': 'audio.transcribe',
  'audio.transcription': 'audio.transcribe',
  'embedding': 'embedding.generate',
  'embeddings': 'embedding.generate',
  'embedding.create': 'embedding.generate',
  'text.embedding': 'embedding.generate',
  'rag-query': 'rag.query',
  'semantic-search': 'search.semantic',
  'semantic.search': 'search.semantic',
  'semantic_search': 'search.semantic',
  'rerank': 'search.rerank',
  'document.rerank': 'search.rerank',
  'search.reranking': 'search.rerank',
  'workflow': 'workflow.execute',
  'workflow-execute': 'workflow.execute',
  'workflow.run': 'workflow.execute',
  'agent': 'agent.run',
  'agent-run': 'agent.run',
}

const REGISTRY_CAPABILITY_ALIASES: Record<string, string> = {
  'text.chat': 'chat.completion',
  'chat': 'chat.completion',
  'text.completion': 'chat.completion',
  'completion.create': 'chat.completion',
  'image.generation': 'image.generate',
  'image.create': 'image.generate',
  'images.generate': 'image.generate',
  'image.variation': 'image.edit',
  'image.inpaint': 'image.edit',
  'images.edit': 'image.edit',
}

export function normalizeIntelligenceCapabilityId(
  capabilityId: unknown,
  namespace: IntelligenceCapabilityNamespace = 'runtime',
): string {
  if (typeof capabilityId !== 'string') {
    return ''
  }

  const normalized = capabilityId.trim().toLowerCase().replace(/_/g, '.')
  if (!normalized) {
    return ''
  }

  const aliases = namespace === 'registry'
    ? REGISTRY_CAPABILITY_ALIASES
    : RUNTIME_CAPABILITY_ALIASES
  return aliases[normalized] ?? normalized
}

export function toRuntimeCapabilityId(capabilityId: unknown): string {
  return normalizeIntelligenceCapabilityId(capabilityId, 'runtime')
}

export function toRegistryCapabilityId(capabilityId: unknown): string {
  const runtimeId = toRuntimeCapabilityId(capabilityId)
  if (!runtimeId) {
    return ''
  }
  return normalizeIntelligenceCapabilityId(runtimeId, 'registry')
}

export function uniqueCapabilityIds(capabilityIds: Array<string | null | undefined>): string[] {
  const result = new Set<string>()
  for (const capabilityId of capabilityIds) {
    const normalized = toRuntimeCapabilityId(capabilityId)
    if (normalized) {
      result.add(normalized)
    }
  }
  return [...result]
}

export function uniqueRegistryCapabilityIds(capabilityIds: Array<string | null | undefined>): string[] {
  const result = new Set<string>()
  for (const capabilityId of capabilityIds) {
    const normalized = toRegistryCapabilityId(capabilityId)
    if (normalized) {
      result.add(normalized)
    }
  }
  return [...result]
}
