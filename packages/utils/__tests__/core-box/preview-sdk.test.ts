import { describe, expect, it } from "vitest";
import {
  AdvancedExpressionAbility,
  BasicExpressionAbility,
  ColorPreviewAbility,
  PercentageAbility,
  ScientificConstantsAbility,
  TextStatsAbility,
  TimeDeltaAbility,
  UnitConversionAbility,
  createPreviewSdk,
  evaluateBasicExpression,
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
});
