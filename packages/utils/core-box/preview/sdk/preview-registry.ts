import type {
  PreviewAbility,
  PreviewAbilityContext,
  PreviewAbilityInventoryItem,
  PreviewAbilityResult,
} from "../types";
import { toPreviewAbilityInventoryItem } from "./preview-safety";

export type PreviewAbilityErrorHandler = (
  error: unknown,
  ability: PreviewAbility,
) => void;

export interface PreviewAbilityRegistryOptions {
  onAbilityError?: PreviewAbilityErrorHandler;
}

export class PreviewAbilityRegistry {
  private readonly abilities: PreviewAbility[] = [];

  constructor(private readonly options: PreviewAbilityRegistryOptions = {}) {}

  register(ability: PreviewAbility): void {
    if (this.abilities.some((item) => item.id === ability.id)) {
      return;
    }

    this.abilities.push(ability);
    this.abilities.sort((a, b) => {
      if (a.priority === b.priority) {
        return a.id.localeCompare(b.id);
      }
      return a.priority - b.priority;
    });
  }

  list(): PreviewAbility[] {
    return [...this.abilities];
  }

  listInventory(): PreviewAbilityInventoryItem[] {
    return this.abilities.map((ability) =>
      toPreviewAbilityInventoryItem(ability),
    );
  }

  async resolve(
    context: PreviewAbilityContext,
  ): Promise<PreviewAbilityResult | null> {
    for (const ability of this.abilities) {
      if (context.signal.aborted) {
        return null;
      }

      if (!(await ability.canHandle(context.query))) {
        continue;
      }

      try {
        const result = await ability.execute(context);
        if (result) {
          return result;
        }
      } catch (error) {
        if ((error as DOMException).name === "AbortError") {
          return null;
        }
        this.options.onAbilityError?.(error, ability);
      }
    }

    return null;
  }
}
