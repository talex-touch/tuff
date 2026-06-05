import type {
  PreviewAbility,
  PreviewAbilityContext,
  PreviewAbilityInventoryItem,
  PreviewAbilityResult,
  PreviewResolveDiagnostics,
  PreviewResolveOutput,
} from "../types";
import {
  DEFAULT_PREVIEW_INPUT_MAX_LENGTH,
  toPreviewAbilityInventoryItem,
} from "./preview-safety";

export type PreviewAbilityErrorHandler = (
  error: unknown,
  ability: PreviewAbility,
) => void;

export interface PreviewAbilityRegistryOptions {
  onAbilityError?: PreviewAbilityErrorHandler;
  maxInputLength?: number;
  now?: () => number;
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

  async resolveWithDiagnostics(
    context: PreviewAbilityContext,
    budgetMs?: number,
  ): Promise<PreviewResolveOutput> {
    const startedAt = this.now();
    const inputLength = getPreviewInputLength(context);
    const maxInputLength = this.getMaxInputLength();
    let checkedAbilityCount = 0;
    let executedAbilityCount = 0;
    let errorCount = 0;

    const diagnostics = (
      status: PreviewResolveDiagnostics["status"],
      matchedAbilityId?: string,
    ): PreviewResolveDiagnostics => {
      const durationMs = this.now() - startedAt;
      return {
        status,
        durationMs,
        inputLength,
        maxInputLength,
        checkedAbilityCount,
        executedAbilityCount,
        errorCount,
        budgetMs,
        exceededBudget:
          typeof budgetMs === "number" && Number.isFinite(budgetMs)
            ? durationMs > budgetMs
            : false,
        matchedAbilityId,
      };
    };

    if (inputLength > maxInputLength) {
      return {
        result: null,
        diagnostics: diagnostics("input-too-long"),
      };
    }

    for (const ability of this.abilities) {
      if (context.signal.aborted) {
        return {
          result: null,
          diagnostics: diagnostics("aborted"),
        };
      }

      checkedAbilityCount += 1;
      try {
        if (!(await ability.canHandle(context.query))) {
          continue;
        }
      } catch (error) {
        if ((error as DOMException).name === "AbortError") {
          return {
            result: null,
            diagnostics: diagnostics("aborted"),
          };
        }
        errorCount += 1;
        this.options.onAbilityError?.(error, ability);
        continue;
      }

      try {
        executedAbilityCount += 1;
        const abilityStartedAt = this.now();
        const result = await ability.execute(context);
        if (result) {
          const durationMs = result.durationMs ?? this.now() - abilityStartedAt;
          const matchedDiagnostics = diagnostics("success", result.abilityId);
          return {
            result: withPreviewSdkDiagnostics(
              {
                ...result,
                durationMs,
              },
              matchedDiagnostics,
            ),
            diagnostics: matchedDiagnostics,
          };
        }
      } catch (error) {
        if ((error as DOMException).name === "AbortError") {
          return {
            result: null,
            diagnostics: diagnostics("aborted"),
          };
        }
        errorCount += 1;
        this.options.onAbilityError?.(error, ability);
      }
    }

    return {
      result: null,
      diagnostics: diagnostics("no-match"),
    };
  }

  async resolve(
    context: PreviewAbilityContext,
  ): Promise<PreviewAbilityResult | null> {
    const output = await this.resolveWithDiagnostics(context);
    return output.result;
  }

  private getMaxInputLength(): number {
    if (
      typeof this.options.maxInputLength === "number" &&
      Number.isFinite(this.options.maxInputLength) &&
      this.options.maxInputLength > 0
    ) {
      return this.options.maxInputLength;
    }

    return this.abilities.reduce(
      (maxLength, ability) => Math.max(maxLength, ability.safety.input.maxLength),
      DEFAULT_PREVIEW_INPUT_MAX_LENGTH,
    );
  }

  private now(): number {
    return this.options.now?.() ?? globalPreviewNow();
  }
}

function getPreviewInputLength(context: PreviewAbilityContext): number {
  return context.query.text?.trim().length ?? 0;
}

function globalPreviewNow(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function withPreviewSdkDiagnostics(
  result: PreviewAbilityResult,
  diagnostics: PreviewResolveDiagnostics,
): PreviewAbilityResult {
  return {
    ...result,
    payload: {
      ...result.payload,
      meta: {
        ...result.payload.meta,
        previewSdk: {
          status: diagnostics.status,
          resolveDurationMs: diagnostics.durationMs,
          abilityDurationMs: result.durationMs,
          inputLength: diagnostics.inputLength,
          checkedAbilityCount: diagnostics.checkedAbilityCount,
          executedAbilityCount: diagnostics.executedAbilityCount,
          exceededBudget: diagnostics.exceededBudget,
        },
      },
    },
  };
}
