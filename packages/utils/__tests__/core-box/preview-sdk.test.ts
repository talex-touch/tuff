import { describe, expect, it, vi } from "vitest";
import type { PreviewAbility } from "../../core-box/preview";
import {
  AdvancedExpressionAbility,
  BasicExpressionAbility,
  ColorPreviewAbility,
  PercentageAbility,
  ScientificConstantsAbility,
  TextStatsAbility,
  TimeDeltaAbility,
  UnitConversionAbility,
  createDefaultPurePreviewAbilities,
  createPreviewSdk,
  createStaticPreviewSafetyPolicy,
  evaluateBasicExpression,
  runPreviewSdkBenchmark,
} from "../../core-box/preview";

function signal(): AbortSignal {
  return new AbortController().signal;
}

describe("PreviewSDK", () => {
  it("resolves abilities by priority and returns pure preview payloads", async () => {
    const sdk = createPreviewSdk({
      abilities: [
        new TextStatsAbility(),
        new PercentageAbility(),
        new BasicExpressionAbility(),
      ],
    });

    const result = await sdk.resolve({
      query: { text: "2 + 2", inputs: [] },
      signal: signal(),
    });

    expect(result?.abilityId).toBe("preview.expression.basic");
    expect(result?.payload.primaryValue).toBe("4");
  });

  it("exposes ability inventory with safety declarations", () => {
    const sdk = createPreviewSdk({
      abilities: [new ColorPreviewAbility(), new UnitConversionAbility()],
    });

    expect(sdk.listInventory()).toEqual([
      expect.objectContaining({
        id: "preview.color",
        owner: "preview-sdk",
        status: "migrated",
        safety: expect.objectContaining({
          usesDynamicExecution: false,
          usesNetwork: false,
          usesCache: false,
        }),
      }),
      expect.objectContaining({
        id: "preview.unit",
        safety: expect.objectContaining({
          replacementPlan: expect.stringContaining(
            "share static unit conversion core",
          ),
        }),
      }),
    ]);
  });

  it("evaluates basic arithmetic without dynamic code execution semantics", () => {
    expect(evaluateBasicExpression("2 * (3 + 4)")).toBe(14);
    expect(evaluateBasicExpression("-2 + 3 * 4")).toBe(10);
    expect(evaluateBasicExpression("process.exit()")).toBeNull();
  });

  it("converts units through the shared static conversion core", async () => {
    const ability = new UnitConversionAbility();
    const result = await ability.execute({
      query: { text: "100 cm to m", inputs: [] },
      signal: signal(),
    });

    expect(result?.abilityId).toBe("preview.unit");
    expect(result?.payload.primaryValue).toBe("1");
  });

  it("resolves advanced expression, constants and time abilities inside PreviewSDK", async () => {
    const advanced = await new AdvancedExpressionAbility().execute({
      query: { text: "sqrt(16)", inputs: [] },
      signal: signal(),
    });
    const constant = await new ScientificConstantsAbility().execute({
      query: { text: "speed of light constant", inputs: [] },
      signal: signal(),
    });
    const time = await new TimeDeltaAbility().execute({
      query: { text: "1h", inputs: [] },
      signal: signal(),
    });

    expect(advanced?.payload.primaryValue).toBe("4");
    expect(constant?.payload.title).toBe("真空光速");
    expect(time?.payload.subtitle).toBe("时长换算");
  });

  it("keeps time, percentage and unit boundaries specific in default registry order", async () => {
    const sdk = createPreviewSdk({
      abilities: createDefaultPurePreviewAbilities(),
    });

    const chineseTime = await sdk.resolve({
      query: { text: "1小时30分钟后", inputs: [] },
      signal: signal(),
    });
    const chinesePercentage = await sdk.resolve({
      query: { text: "100 增加 20%", inputs: [] },
      signal: signal(),
    });
    const invalidRelativeTime = await sdk.resolveWithDiagnostics({
      query: { text: "now + abc", inputs: [] },
      signal: signal(),
    });
    const incompatibleUnit = await sdk.resolveWithDiagnostics({
      query: { text: "10 kg to m", inputs: [] },
      signal: signal(),
    });

    expect(chineseTime?.abilityId).toBe("preview.time");
    expect(chineseTime?.payload.subtitle).toBe("时间偏移");
    expect(chinesePercentage?.abilityId).toBe("preview.percent");
    expect(chinesePercentage?.payload.primaryValue).toBe("120");
    expect(invalidRelativeTime.result).toBeNull();
    expect(invalidRelativeTime.diagnostics.status).toBe("no-match");
    expect(incompatibleUnit.result).toBeNull();
    expect(incompatibleUnit.diagnostics.status).toBe("no-match");
  });

  it("guards overlong input before ability matching", async () => {
    const canHandle = vi.fn(() => true);
    const sdk = createPreviewSdk({
      maxInputLength: 4,
      abilities: [
        {
          id: "preview.test",
          priority: 1,
          safety: createStaticPreviewSafetyPolicy("test", 4),
          canHandle,
          execute: vi.fn(async () => null),
        },
      ],
    });

    const output = await sdk.resolveWithDiagnostics({
      query: { text: "12345", inputs: [] },
      signal: signal(),
    });

    expect(output.result).toBeNull();
    expect(output.diagnostics).toEqual(
      expect.objectContaining({
        status: "input-too-long",
        inputLength: 5,
        maxInputLength: 4,
        checkedAbilityCount: 0,
        executedAbilityCount: 0,
      }),
    );
    expect(canHandle).not.toHaveBeenCalled();
  });

  it("returns resolve diagnostics and enriches preview payload metadata", async () => {
    let now = 0;
    const ability: PreviewAbility = {
      id: "preview.test",
      priority: 1,
      safety: createStaticPreviewSafetyPolicy("test", 20),
      canHandle: () => true,
      execute: async () => ({
        abilityId: "preview.test",
        confidence: 0.9,
        payload: {
          abilityId: "preview.test",
          title: "test",
          primaryValue: "ok",
        },
      }),
    };
    const sdk = createPreviewSdk({
      abilities: [ability],
      now: () => now++,
    });

    const output = await sdk.resolveWithDiagnostics({
      query: { text: "test", inputs: [] },
      signal: signal(),
      budgetMs: 2,
    });

    expect(output.result?.durationMs).toBe(1);
    expect(output.diagnostics).toEqual(
      expect.objectContaining({
        status: "success",
        durationMs: 3,
        checkedAbilityCount: 1,
        executedAbilityCount: 1,
        exceededBudget: true,
        matchedAbilityId: "preview.test",
      }),
    );
    expect(output.result?.payload.meta?.previewSdk).toEqual(
      expect.objectContaining({
        status: "success",
        resolveDurationMs: 3,
        abilityDurationMs: 1,
        inputLength: 4,
        checkedAbilityCount: 1,
        executedAbilityCount: 1,
        exceededBudget: true,
      }),
    );
  });

  it("runs deterministic PreviewSDK benchmark cases", async () => {
    let now = 0;
    const ability: PreviewAbility = {
      id: "preview.benchmark",
      priority: 1,
      safety: createStaticPreviewSafetyPolicy("benchmark", 20),
      canHandle: (query) => query.text === "hit",
      execute: async () => ({
        abilityId: "preview.benchmark",
        confidence: 0.8,
        payload: {
          abilityId: "preview.benchmark",
          title: "benchmark",
          primaryValue: "ok",
        },
      }),
    };
    const sdk = createPreviewSdk({
      abilities: [ability],
      now: () => now++,
    });

    const result = await runPreviewSdkBenchmark(
      sdk,
      [
        {
          id: "hit",
          query: { text: "hit", inputs: [] },
          expectedAbilityId: "preview.benchmark",
          budgetMs: 2,
        },
        {
          id: "miss",
          query: { text: "miss", inputs: [] },
          expectNoResult: true,
        },
      ],
      signal(),
    );

    expect(result.summary).toEqual(
      expect.objectContaining({
        total: 2,
        matchedExpected: 2,
        mismatchedExpected: 0,
        exceededBudget: 1,
        failed: 1,
        p50DurationMs: 1,
        p95DurationMs: 3,
        maxDurationMs: 3,
      }),
    );
    expect(result.failures).toEqual([
      expect.objectContaining({
        kind: "budget-exceeded",
        caseId: "hit",
        expectedAbilityId: "preview.benchmark",
        actualAbilityId: "preview.benchmark",
        status: "success",
      }),
    ]);
    expect(result.cases.map((item) => item.matchedExpected)).toEqual([
      true,
      true,
    ]);
  });

  it("surfaces benchmark ability mismatches as actionable failures", async () => {
    const sdk = createPreviewSdk({
      abilities: [
        {
          id: "preview.actual",
          priority: 1,
          safety: createStaticPreviewSafetyPolicy("benchmark", 20),
          canHandle: () => true,
          execute: async () => ({
            abilityId: "preview.actual",
            confidence: 0.8,
            payload: {
              abilityId: "preview.actual",
              title: "benchmark",
              primaryValue: "ok",
            },
          }),
        },
      ],
    });

    const result = await runPreviewSdkBenchmark(
      sdk,
      [
        {
          id: "wrong-ability",
          query: { text: "hit", inputs: [] },
          expectedAbilityId: "preview.expected",
          budgetMs: 40,
        },
      ],
      signal(),
    );

    expect(result.summary).toEqual(
      expect.objectContaining({
        total: 1,
        matchedExpected: 0,
        mismatchedExpected: 1,
        exceededBudget: 0,
        failed: 1,
      }),
    );
    expect(result.failures).toEqual([
      expect.objectContaining({
        kind: "ability-mismatch",
        caseId: "wrong-ability",
        expectedAbilityId: "preview.expected",
        actualAbilityId: "preview.actual",
        status: "success",
      }),
    ]);
  });
});
