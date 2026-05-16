import type {
  PreviewAbility,
  PreviewResolveOptions,
  PreviewSdk,
} from "../types";
import {
  PreviewAbilityRegistry,
  type PreviewAbilityRegistryOptions,
} from "./preview-registry";

export interface CreatePreviewSdkOptions extends PreviewAbilityRegistryOptions {
  abilities?: PreviewAbility[];
}

export function createPreviewSdk(
  options: CreatePreviewSdkOptions = {},
): PreviewSdk {
  const registry = new PreviewAbilityRegistry({
    onAbilityError: options.onAbilityError,
  });

  for (const ability of options.abilities ?? []) {
    registry.register(ability);
  }

  return {
    register: (ability) => registry.register(ability),
    listAbilities: () => registry.list(),
    listInventory: () => registry.listInventory(),
    resolve: ({ query, signal }: PreviewResolveOptions) =>
      registry.resolve({ query, signal }),
  };
}
