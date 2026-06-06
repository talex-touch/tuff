import type {
  PreviewAbility,
  PreviewBenchmarkCase,
  PreviewBenchmarkCaseResult,
  PreviewBenchmarkFailure,
  PreviewBenchmarkResult,
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
    maxInputLength: options.maxInputLength,
    now: options.now,
  });

  for (const ability of options.abilities ?? []) {
    registry.register(ability);
  }

  return {
    register: (ability) => registry.register(ability),
    listAbilities: () => registry.list(),
    listInventory: () => registry.listInventory(),
    resolveWithDiagnostics: ({ query, signal, budgetMs }: PreviewResolveOptions) =>
      registry.resolveWithDiagnostics({ query, signal }, budgetMs),
    resolve: ({ query, signal }: PreviewResolveOptions) =>
      registry.resolve({ query, signal }),
  };
}

export async function runPreviewSdkBenchmark(
  sdk: Pick<PreviewSdk, "resolveWithDiagnostics">,
  cases: PreviewBenchmarkCase[],
  signal: AbortSignal,
): Promise<PreviewBenchmarkResult> {
  const results: PreviewBenchmarkCaseResult[] = [];

  for (const benchmarkCase of cases) {
    const output = await sdk.resolveWithDiagnostics({
      query: benchmarkCase.query,
      signal,
      budgetMs: benchmarkCase.budgetMs,
    });
    const actualAbilityId = output.result?.abilityId;
    results.push({
      id: benchmarkCase.id,
      expectedAbilityId: benchmarkCase.expectedAbilityId,
      actualAbilityId,
      matchedExpected: benchmarkCase.expectNoResult
        ? !actualAbilityId
        : benchmarkCase.expectedAbilityId
          ? actualAbilityId === benchmarkCase.expectedAbilityId
          : true,
      diagnostics: output.diagnostics,
    });
  }

  const failures = resolvePreviewBenchmarkFailures(cases, results);
  const durations = results
    .map((result) => result.diagnostics.durationMs)
    .sort((a, b) => a - b);

  return {
    cases: results,
    failures,
    summary: {
      total: results.length,
      matchedExpected: results.filter((result) => result.matchedExpected).length,
      mismatchedExpected: results.filter((result) => !result.matchedExpected)
        .length,
      exceededBudget: results.filter(
        (result) => result.diagnostics.exceededBudget,
      ).length,
      failed: failures.length,
      p50DurationMs: percentile(durations, 0.5),
      p95DurationMs: percentile(durations, 0.95),
      maxDurationMs: durations.at(-1) ?? 0,
    },
  };
}

function resolvePreviewBenchmarkFailures(
  cases: PreviewBenchmarkCase[],
  results: PreviewBenchmarkCaseResult[],
): PreviewBenchmarkFailure[] {
  const caseById = new Map(cases.map((benchmarkCase) => [benchmarkCase.id, benchmarkCase]));
  const failures: PreviewBenchmarkFailure[] = [];

  for (const result of results) {
    const benchmarkCase = caseById.get(result.id);
    const base = {
      caseId: result.id,
      expectedAbilityId: benchmarkCase?.expectedAbilityId,
      expectNoResult: benchmarkCase?.expectNoResult,
      actualAbilityId: result.actualAbilityId,
      status: result.diagnostics.status,
      durationMs: result.diagnostics.durationMs,
      budgetMs: result.diagnostics.budgetMs,
    };

    if (!result.matchedExpected) {
      failures.push({
        ...base,
        kind: "ability-mismatch",
      });
    }

    if (result.diagnostics.exceededBudget) {
      failures.push({
        ...base,
        kind: "budget-exceeded",
      });
    }
  }

  return failures;
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0;
  const index = Math.min(
    values.length - 1,
    Math.max(0, Math.ceil(values.length * ratio) - 1),
  );
  return values[index] ?? 0;
}
