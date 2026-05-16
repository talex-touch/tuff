import type {
  PreviewAbility,
  PreviewAbilityInventoryItem,
  PreviewAbilitySafetyPolicy,
} from "../types";

export const DEFAULT_PREVIEW_INPUT_MAX_LENGTH = 500;

export function createStaticPreviewSafetyPolicy(
  syntax: string,
  maxLength = DEFAULT_PREVIEW_INPUT_MAX_LENGTH,
  notes?: string,
): PreviewAbilitySafetyPolicy {
  return {
    input: {
      maxLength,
      syntax,
      notes,
    },
    dependencies: ["parser"],
    usesDynamicExecution: false,
    usesNetwork: false,
    usesCache: false,
  };
}

export function toPreviewAbilityInventoryItem(
  ability: PreviewAbility,
  owner: PreviewAbilityInventoryItem["owner"] = "preview-sdk",
  status: PreviewAbilityInventoryItem["status"] = "migrated",
): PreviewAbilityInventoryItem {
  return {
    id: ability.id,
    label: ability.label ?? ability.id,
    owner,
    status,
    priority: ability.priority,
    safety: ability.safety,
  };
}
