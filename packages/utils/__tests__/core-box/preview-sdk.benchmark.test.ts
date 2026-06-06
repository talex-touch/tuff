import { describe, expect, it } from "vitest";
import type { PreviewBenchmarkCase } from "../../core-box/preview";
import {
  createDefaultPurePreviewAbilities,
  createPreviewSdk,
  runPreviewSdkBenchmark,
} from "../../core-box/preview";

function signal(): AbortSignal {
  return new AbortController().signal;
}

const PREVIEW_BENCHMARK_BUDGET_MS = 40;
const PREVIEW_BENCHMARK_COLD_IMPORT_BUDGET_MS = 500;

const benchmarkCases: PreviewBenchmarkCase[] = [
  {
    id: "basic-expression",
    query: { text: "2 * (3 + 4)", inputs: [] },
    expectedAbilityId: "preview.expression.basic",
    budgetMs: PREVIEW_BENCHMARK_BUDGET_MS,
  },
  {
    id: "advanced-expression",
    query: { text: "sqrt(144)", inputs: [] },
    expectedAbilityId: "preview.expression.advanced",
    budgetMs: PREVIEW_BENCHMARK_COLD_IMPORT_BUDGET_MS,
  },
  {
    id: "unit-conversion",
    query: { text: "100 cm to m", inputs: [] },
    expectedAbilityId: "preview.unit",
    budgetMs: PREVIEW_BENCHMARK_BUDGET_MS,
  },
  {
    id: "scientific-constant",
    query: { text: "speed of light constant", inputs: [] },
    expectedAbilityId: "preview.constants.scientific",
    budgetMs: PREVIEW_BENCHMARK_BUDGET_MS,
  },
  {
    id: "color",
    query: { text: "#336699", inputs: [] },
    expectedAbilityId: "preview.color",
    budgetMs: PREVIEW_BENCHMARK_BUDGET_MS,
  },
  {
    id: "time-delta",
    query: { text: "now + 1h", inputs: [] },
    expectedAbilityId: "preview.time",
    budgetMs: PREVIEW_BENCHMARK_BUDGET_MS,
  },
  {
    id: "percentage",
    query: { text: "80 的 20%", inputs: [] },
    expectedAbilityId: "preview.percent",
    budgetMs: PREVIEW_BENCHMARK_BUDGET_MS,
  },
  {
    id: "text-stats",
    query: { text: "words hello world", inputs: [] },
    expectedAbilityId: "preview.textstats",
    budgetMs: PREVIEW_BENCHMARK_BUDGET_MS,
  },
  {
    id: "expected-no-result",
    query: { text: "open browser bookmarks", inputs: [] },
    expectNoResult: true,
    budgetMs: PREVIEW_BENCHMARK_BUDGET_MS,
  },
  {
    id: "overlong-input",
    query: { text: "x".repeat(520), inputs: [] },
    expectNoResult: true,
    budgetMs: PREVIEW_BENCHMARK_BUDGET_MS,
  },
];

describe("PreviewSDK benchmark", () => {
  it("keeps default pure abilities inside the preview latency and boundary budget", async () => {
    const sdk = createPreviewSdk({
      abilities: createDefaultPurePreviewAbilities(),
    });

    const result = await runPreviewSdkBenchmark(
      sdk,
      benchmarkCases,
      signal(),
    );

    console.info(
      "[PreviewSDK benchmark]",
      JSON.stringify(result.summary, null, 2),
    );
    console.table(
      result.failures.length > 0
        ? result.failures.map((item) => ({
            id: item.caseId,
            kind: item.kind,
            expected: item.expectNoResult
              ? "no-result"
              : item.expectedAbilityId ?? "any-result",
            actual: item.actualAbilityId ?? "no-result",
            status: item.status,
            durationMs: item.durationMs,
            budgetMs: item.budgetMs ?? "none",
          }))
        : result.cases.map((item) => ({
            id: item.id,
            expected: item.expectedAbilityId ?? "no-result",
            actual: item.actualAbilityId ?? "no-result",
            status: item.diagnostics.status,
            durationMs: item.diagnostics.durationMs,
            checked: item.diagnostics.checkedAbilityCount,
            executed: item.diagnostics.executedAbilityCount,
            exceededBudget: item.diagnostics.exceededBudget,
            matchedExpected: item.matchedExpected,
          })),
    );

    expect(result.summary.total).toBe(benchmarkCases.length);
    expect(result.summary.matchedExpected).toBe(benchmarkCases.length);
    expect(result.summary.exceededBudget).toBe(0);
    expect(result.failures).toHaveLength(0);
  });
});
