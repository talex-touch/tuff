import type {
  PreviewAbilityContext,
  PreviewAbilityResult,
  PreviewAbilitySafetyPolicy,
  PreviewCardPayload,
} from "../types";
import { BasePreviewAbility } from "../sdk";
import {
  formatUnitNumber,
  getUnitSuggestions,
  parseUnitQuery,
  resolveUnit,
} from "./unit-conversion-core";

export class UnitConversionAbility extends BasePreviewAbility {
  readonly id = "preview.unit";
  override readonly label = "Unit Conversion";
  readonly priority = 25;
  override readonly safety: PreviewAbilitySafetyPolicy = {
    input: {
      maxLength: 120,
      syntax:
        "numeric unit query with optional to/in/=/->/转/换算/换成 target unit",
      notes: "Uses shared static unit conversion tables; no formula evaluator.",
    },
    dependencies: ["parser"],
    usesDynamicExecution: false,
    usesNetwork: false,
    usesCache: false,
    replacementPlan:
      "Completed: Preview and calculation paths share static unit conversion core.",
  };

  override canHandle(query: { text?: string }): boolean {
    if (!query.text || query.text.length > this.safety.input.maxLength)
      return false;
    return parseUnitQuery(query.text) !== null;
  }

  override async execute(
    context: PreviewAbilityContext,
  ): Promise<PreviewAbilityResult | null> {
    const startedAt = Date.now();
    const text = this.getNormalizedQuery(context.query);
    const parsed = parseUnitQuery(text);
    if (!parsed) return null;

    const fromUnit = resolveUnit(parsed.fromUnit);
    if (!fromUnit) return null;

    const toUnit = parsed.toUnit ? resolveUnit(parsed.toUnit) : null;
    if (toUnit && fromUnit.category !== toUnit.category) {
      return null;
    }

    this.throwIfAborted(context.signal);
    const baseValue = fromUnit.toBase(parsed.value);

    if (toUnit) {
      const converted = toUnit.fromBase(baseValue);
      const formattedResult = formatUnitNumber(converted);

      const payload: PreviewCardPayload = {
        abilityId: this.id,
        title: text,
        subtitle: "单位换算",
        primaryLabel: `${fromUnit.display} → ${toUnit.display}`,
        primaryValue: formattedResult,
        secondaryLabel: "原值",
        secondaryValue: `${parsed.value} ${parsed.fromUnit}`,
        chips: [
          {
            label: fromUnit.display,
            value: `${parsed.value} ${parsed.fromUnit}`,
          },
          {
            label: toUnit.display,
            value: `${formattedResult} ${parsed.toUnit}`,
          },
        ],
        sections: [
          {
            title: "详情",
            rows: [
              { label: "类别", value: fromUnit.category },
              { label: "公式", value: `${parsed.fromUnit} → ${parsed.toUnit}` },
            ],
          },
        ],
      };

      return {
        abilityId: this.id,
        confidence: 0.8,
        payload,
        durationMs: Date.now() - startedAt,
      };
    }

    const filteredRows = getUnitSuggestions(fromUnit.category, fromUnit.unit)
      .slice(0, 3)
      .map((target) => ({
        label: `${fromUnit.display} → ${target.display}`,
        value: `${formatUnitNumber(target.fromBase(baseValue))} ${target.unit.toUpperCase()}`,
      }));

    const payload: PreviewCardPayload = {
      abilityId: this.id,
      title: text,
      subtitle: "单位建议",
      primaryLabel: fromUnit.display,
      primaryValue: `${parsed.value} ${parsed.fromUnit}`,
      sections: filteredRows.length
        ? [
            {
              title: "常用换算",
              rows: filteredRows,
            },
          ]
        : undefined,
    };

    return {
      abilityId: this.id,
      confidence: 0.5,
      payload,
      durationMs: Date.now() - startedAt,
    };
  }
}
