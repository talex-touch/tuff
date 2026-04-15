export type PilotBuiltInScene = 'intent_classification' | 'image_generate'

export interface PilotScenePolicy {
  scene: string
  modelId: string
  routeComboId?: string
}

export const PILOT_BUILT_IN_SCENES: readonly PilotBuiltInScene[] = [
  'intent_classification',
  'image_generate',
]

export function normalizePilotScene(value: unknown): string {
  const text = String(value || '').trim()
  if (!text) {
    return ''
  }

  const builtinCandidate = text
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  if (builtinCandidate === 'intent_classification' || builtinCandidate === 'image_generate') {
    return builtinCandidate
  }

  return text
}

export function isPilotBuiltInScene(value: unknown): value is PilotBuiltInScene {
  const normalized = normalizePilotScene(value)
  return normalized === 'intent_classification' || normalized === 'image_generate'
}
