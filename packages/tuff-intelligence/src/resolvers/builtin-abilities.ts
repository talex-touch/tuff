import type { IntelligenceCapabilityType } from '../types/intelligence'
import { toRegistryCapabilityId, toRuntimeCapabilityId } from './capabilities'

export type BuiltinAbilityCategory =
  | 'analysis'
  | 'audio'
  | 'code'
  | 'exchange'
  | 'image'
  | 'overlay'
  | 'rag'
  | 'text'
  | 'vision'

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
    id: 'text.summarize',
    type: 'summarize',
    category: 'text',
    meteringUnit: 'token',
    description: 'Summarizes text into a concise output.',
  }),
  createBuiltinAbility({
    id: 'content.extract',
    type: 'content-extract',
    category: 'analysis',
    meteringUnit: 'token',
    description: 'Extracts structured facts from unstructured content.',
  }),
  createBuiltinAbility({
    id: 'text.translate',
    type: 'translate',
    category: 'text',
    meteringUnit: 'character',
    description: 'Translates text between languages.',
  }),
  createBuiltinAbility({
    id: 'image.translate',
    type: 'image-translate-e2e',
    category: 'image',
    meteringUnit: 'image',
    description: 'Translates image content through OCR and rendering.',
  }),
  createBuiltinAbility({
    id: 'image.translate.e2e',
    type: 'image-translate-e2e',
    category: 'image',
    meteringUnit: 'image',
    description: 'Runs end-to-end image translation.',
  }),
  createBuiltinAbility({
    id: 'vision.ocr',
    type: 'vision-ocr',
    category: 'vision',
    meteringUnit: 'token',
    description: 'Extracts text from images.',
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
    id: 'code.review',
    type: 'code-review',
    category: 'code',
    meteringUnit: 'token',
    description: 'Reviews code and returns quality feedback.',
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
    id: 'keywords.extract',
    type: 'keywords-extract',
    category: 'analysis',
    meteringUnit: 'token',
    description: 'Extracts keywords from text.',
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
