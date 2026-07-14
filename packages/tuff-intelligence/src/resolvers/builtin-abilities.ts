import type { IntelligenceCapabilityType } from '../types/intelligence'
import { toRegistryCapabilityId, toRuntimeCapabilityId } from './capabilities'

export type BuiltinAbilityCategory
  = | 'agent'
    | 'analysis'
    | 'audio'
    | 'code'
    | 'exchange'
    | 'image'
    | 'overlay'
    | 'rag'
    | 'search'
    | 'text'
    | 'vision'
    | 'workflow'
export interface TuffIntelligenceBuiltinAbility {
  id: string
  runtimeId: string
  registryId: string
  type?: IntelligenceCapabilityType | string
  category: BuiltinAbilityCategory
  schemaRef: string
  meteringUnit: string
  description: string
}

function createBuiltinAbility(input: {
  id: string
  type?: IntelligenceCapabilityType | string
  category: BuiltinAbilityCategory
  schemaRef?: string
  meteringUnit: string
  description: string
}): TuffIntelligenceBuiltinAbility {
  const runtimeId = toRuntimeCapabilityId(input.id)
  const registryId = toRegistryCapabilityId(runtimeId)
  const id = registryId || runtimeId || input.id
  return {
    id,
    runtimeId,
    registryId: id,
    type: input.type,
    category: input.category,
    schemaRef: input.schemaRef ?? `nexus://schemas/provider/${id.replace(/\./g, '-')}.v1`,
    meteringUnit: input.meteringUnit,
    description: input.description,
  }
}

export const tuffIntelligenceBuiltinAbilities = [
  createBuiltinAbility({
    id: 'text.chat',
    type: 'chat',
    category: 'text',
    meteringUnit: 'token',
    description: 'General conversational completion capability.',
  }),
  createBuiltinAbility({
    id: 'text.translate',
    type: 'translate',
    category: 'text',
    meteringUnit: 'character',
    description: 'Translates text between languages.',
  }),
  createBuiltinAbility({
    id: 'text.summarize',
    type: 'summarize',
    category: 'text',
    meteringUnit: 'token',
    description: 'Summarizes text into a concise output.',
  }),
  createBuiltinAbility({
    id: 'text.rewrite',
    type: 'rewrite',
    category: 'text',
    meteringUnit: 'token',
    description: 'Rewrites text with a requested style, tone, or audience.',
  }),
  createBuiltinAbility({
    id: 'text.grammar',
    type: 'grammar-check',
    category: 'text',
    meteringUnit: 'token',
    description: 'Checks grammar, spelling, punctuation, and style.',
  }),
  createBuiltinAbility({
    id: 'text.classify',
    type: 'classification',
    category: 'analysis',
    meteringUnit: 'token',
    description: 'Classifies text into one or more categories.',
  }),
  createBuiltinAbility({
    id: 'embedding.generate',
    type: 'embedding',
    category: 'rag',
    meteringUnit: 'token',
    description: 'Generates semantic vector embeddings.',
  }),
  createBuiltinAbility({
    id: 'code.generate',
    type: 'code-generate',
    category: 'code',
    meteringUnit: 'token',
    description: 'Generates code from natural language requirements.',
  }),
  createBuiltinAbility({
    id: 'code.explain',
    type: 'code-explain',
    category: 'code',
    meteringUnit: 'token',
    description: 'Explains code behavior, structure, and intent.',
  }),
  createBuiltinAbility({
    id: 'code.review',
    type: 'code-review',
    category: 'code',
    meteringUnit: 'token',
    description: 'Reviews code and returns quality feedback.',
  }),
  createBuiltinAbility({
    id: 'code.refactor',
    type: 'code-refactor',
    category: 'code',
    meteringUnit: 'token',
    description: 'Refactors code while preserving behavior.',
  }),
  createBuiltinAbility({
    id: 'code.debug',
    type: 'code-debug',
    category: 'code',
    meteringUnit: 'token',
    description: 'Analyzes failures and proposes debugging fixes.',
  }),
  createBuiltinAbility({
    id: 'intent.detect',
    type: 'intent-detect',
    category: 'analysis',
    meteringUnit: 'token',
    description: 'Detects intent from text.',
  }),
  createBuiltinAbility({
    id: 'sentiment.analyze',
    type: 'sentiment-analyze',
    category: 'analysis',
    meteringUnit: 'token',
    description: 'Analyzes sentiment from text.',
  }),
  createBuiltinAbility({
    id: 'content.extract',
    type: 'content-extract',
    category: 'analysis',
    meteringUnit: 'token',
    description: 'Extracts structured facts from unstructured content.',
  }),
  createBuiltinAbility({
    id: 'keywords.extract',
    type: 'keywords-extract',
    category: 'analysis',
    meteringUnit: 'token',
    description: 'Extracts keywords from text.',
  }),
  createBuiltinAbility({
    id: 'vision.ocr',
    type: 'vision-ocr',
    category: 'vision',
    meteringUnit: 'image',
    description: 'Extracts text from images.',
  }),
  createBuiltinAbility({
    id: 'image.caption',
    type: 'image-caption',
    category: 'image',
    meteringUnit: 'image',
    description: 'Generates descriptive captions for images.',
  }),
  createBuiltinAbility({
    id: 'image.analyze',
    type: 'image-analyze',
    category: 'image',
    meteringUnit: 'image',
    description: 'Analyzes image content, objects, and scenes.',
  }),
  createBuiltinAbility({
    id: 'image.translate.e2e',
    type: 'image-translate-e2e',
    category: 'image',
    meteringUnit: 'image',
    description: 'Translates image content through OCR and rendering.',
  }),
  createBuiltinAbility({
    id: 'image.generate',
    type: 'image-generate',
    category: 'image',
    meteringUnit: 'image',
    description: 'Generates images from text prompts.',
  }),
  createBuiltinAbility({
    id: 'image.edit',
    type: 'image-edit',
    category: 'image',
    meteringUnit: 'image',
    description: 'Edits or inpaints images using a prompt.',
  }),
  createBuiltinAbility({
    id: 'audio.tts',
    type: 'tts',
    category: 'audio',
    meteringUnit: 'character',
    description: 'Converts text into speech audio.',
  }),
  createBuiltinAbility({
    id: 'audio.stt',
    type: 'stt',
    category: 'audio',
    meteringUnit: 'audio_second',
    description: 'Converts speech audio into text.',
  }),
  createBuiltinAbility({
    id: 'audio.transcribe',
    type: 'audio-transcribe',
    category: 'audio',
    meteringUnit: 'audio_second',
    description: 'Transcribes audio with optional timestamps and diarization.',
  }),
  createBuiltinAbility({
    id: 'rag.query',
    type: 'rag-query',
    category: 'rag',
    meteringUnit: 'token',
    description: 'Answers questions with retrieval-augmented generation.',
  }),
  createBuiltinAbility({
    id: 'search.semantic',
    type: 'semantic-search',
    category: 'search',
    meteringUnit: 'token',
    description: 'Searches documents by semantic similarity.',
  }),
  createBuiltinAbility({
    id: 'search.rerank',
    type: 'rerank',
    category: 'search',
    meteringUnit: 'token',
    description: 'Reranks candidate documents by relevance.',
  }),
  createBuiltinAbility({
    id: 'workflow.execute',
    type: 'workflow',
    category: 'workflow',
    meteringUnit: 'run',
    description: 'Executes multi-step prompt workflows.',
  }),
  createBuiltinAbility({
    id: 'agent.run',
    type: 'agent',
    category: 'agent',
    meteringUnit: 'run',
    description: 'Runs autonomous AI agents with tool access.',
  }),
  createBuiltinAbility({
    id: 'fx.rate.latest',
    category: 'exchange',
    meteringUnit: 'fx_quote',
    description: 'Fetches latest foreign exchange rates.',
  }),
  createBuiltinAbility({
    id: 'fx.convert',
    category: 'exchange',
    meteringUnit: 'fx_quote',
    description: 'Converts money values across currencies.',
  }),
  createBuiltinAbility({
    id: 'overlay.render',
    category: 'overlay',
    meteringUnit: 'image',
    description: 'Renders local visual overlays on screenshots.',
  }),
] as const satisfies readonly TuffIntelligenceBuiltinAbility[]

export type TuffIntelligenceBuiltinAbilityId = typeof tuffIntelligenceBuiltinAbilities[number]['id']

export function listTuffIntelligenceBuiltinAbilities(): TuffIntelligenceBuiltinAbility[] {
  return tuffIntelligenceBuiltinAbilities.map(ability => ({ ...ability }))
}

export function getTuffIntelligenceBuiltinAbility(id: string): TuffIntelligenceBuiltinAbility | null {
  const runtimeId = toRuntimeCapabilityId(id)
  const registryId = toRegistryCapabilityId(runtimeId)
  const ability = tuffIntelligenceBuiltinAbilities.find(item =>
    item.id === id
    || item.runtimeId === runtimeId
    || item.registryId === registryId,
  )
  return ability ? { ...ability } : null
}

export function pickTuffIntelligenceBuiltinAbilities(ids: readonly string[]): TuffIntelligenceBuiltinAbility[] {
  return ids
    .map(id => getTuffIntelligenceBuiltinAbility(id))
    .filter((ability): ability is TuffIntelligenceBuiltinAbility => ability !== null)
}
