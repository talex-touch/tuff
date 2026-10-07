import type { ITuffIcon } from '@talex-touch/utils'
import type { ModelChoice } from '~/modules/conversation/useModelOptions'
import { modelFamilyIconFor } from '~/modules/intelligence/model-family-icons'
import { providerIconForId } from '~/modules/intelligence/provider-icons'

/** 「自动选择」's mark in the model popover's left column; the pills wear it while routing is automatic. */
export const AUTO_MODEL_ICON: ITuffIcon = { type: 'class', value: 'i-ri-magic-line' }

export interface ModelPillFace {
  label: string
  icon: ITuffIcon
}

/**
 * What both model pills show (`home-composer` › 工具条与胶囊: always an icon and a name): the
 * pinned model's display name with its family's mark — the provider's when the family has none —
 * or, on auto, the routing label with the auto mark.
 */
export function modelPillFace(resolved: ModelChoice | undefined, autoLabel: string): ModelPillFace {
  if (!resolved) return { label: autoLabel, icon: AUTO_MODEL_ICON }
  return {
    label: resolved.displayName,
    icon:
      modelFamilyIconFor(resolved.model) ??
      providerIconForId(resolved.providerId, resolved.providerType)
  }
}
