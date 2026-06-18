export type IntelligenceCapabilityNamespace = 'runtime' | 'registry'

const RUNTIME_CAPABILITY_ALIASES: Record<string, string> = {
  'chat.completion': 'text.chat',
  chat: 'text.chat',
  'text.completion': 'text.chat',
  'completion.create': 'text.chat',
  'translation.text': 'text.translate',
  translation: 'text.translate',
  summarize: 'text.summarize',
  summary: 'text.summarize',
  'text.summary': 'text.summarize',
  rewrite: 'text.rewrite',
  'content.extraction': 'content.extract',
  'keyword.extract': 'keywords.extract',
  'keywords.generate': 'keywords.extract',
  'intent-detect': 'intent.detect',
  'sentiment-analyze': 'sentiment.analyze',
  'code-generate': 'code.generate',
  'code-explain': 'code.explain',
  'code-review': 'code.review',
  'code-refactor': 'code.refactor',
  'code-debug': 'code.debug',
  'vision-ocr': 'vision.ocr',
  ocr: 'vision.ocr',
  'image.ocr': 'vision.ocr',
  'image-to-text': 'vision.ocr',
  'image.captioning': 'image.caption',
  'image.describe': 'image.caption',
  'vision.caption': 'image.caption',
  'image.analysis': 'image.analyze',
  'vision.analyze': 'image.analyze',
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
  tts: 'audio.tts',
  'text-to-speech': 'audio.tts',
  'audio.speech': 'audio.tts',
  stt: 'audio.transcribe',
  'speech-to-text': 'audio.transcribe',
  'audio-transcribe': 'audio.transcribe',
  'audio.transcription': 'audio.transcribe',
  embedding: 'embedding.generate',
  embeddings: 'embedding.generate',
  'embedding.create': 'embedding.generate',
  'text.embedding': 'embedding.generate',
  rerank: 'rerank',
  'semantic-search': 'semantic.search',
  'semantic_search': 'semantic.search',
  'rag-query': 'rag.query',
}

const REGISTRY_CAPABILITY_ALIASES: Record<string, string> = {
  'text.chat': 'chat.completion',
  chat: 'chat.completion',
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
