import type {
  PreviewAbility,
  PreviewAbilityContext,
  PreviewAbilityResult,
} from "../types";
import { createStaticPreviewSafetyPolicy } from "./preview-safety";

export abstract class BasePreviewAbility implements PreviewAbility {
  abstract readonly id: string;
  abstract readonly priority: number;
  readonly label?: string;
  readonly safety = createStaticPreviewSafetyPolicy("non-empty text");

  canHandle(query: PreviewAbilityContext["query"]): boolean | Promise<boolean> {
    return !!query.text?.trim();
  }

  abstract execute(
    context: PreviewAbilityContext,
  ): Promise<PreviewAbilityResult | null>;

  protected getNormalizedQuery(query: PreviewAbilityContext["query"]): string {
    return query.text?.trim() ?? "";
  }

  protected isInputWithinLimit(context: PreviewAbilityContext): boolean {
    return (
      this.getNormalizedQuery(context.query).length <=
      this.safety.input.maxLength
    );
  }

  protected throwIfAborted(signal: AbortSignal): void {
    if (signal.aborted) {
      throw new DOMException("Preview ability aborted", "AbortError");
    }
  }
}
