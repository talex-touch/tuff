import type {
  PreviewAbilityContext,
  PreviewAbilityResult,
  PreviewAbilitySafetyPolicy,
  PreviewCardPayload,
} from "../types";
import { BasePreviewAbility } from "../sdk";
import {
  findScientificConstant,
  SCIENTIFIC_CONSTANTS,
} from "./scientific-constants-data";

export {
  findScientificConstant,
  SCIENTIFIC_CONSTANTS,
} from "./scientific-constants-data";
export type { ScientificConstantDefinition } from "./scientific-constants-data";

const CONSTANT_KEYWORDS =
  /(constant|常量|gravity|光速|普朗克|玻尔兹曼|阿伏伽德罗|π|\bpi\b|planck|boltzmann|avogadro|faraday|圆周率|自然常数|元电荷|气体常数|重力)/i;

function formatValue(value: string): {
  formatted: string;
  scientific?: string;
} {
  const scientificMatch = /^-?\d+(\.\d+)?e[+-]?\d+$/i.test(value);
  if (scientificMatch) {
    const [coeff, exp] = value.toLowerCase().split("e");
    const formatted = `${coeff} × 10^${Number(exp)}`;
    return { formatted, scientific: value };
  }

  if (value.includes(".")) {
    const trimmed = value.replace(/\.?0+$/, "");
    return {
      formatted: trimmed,
    };
  }

  return { formatted: value };
}

export class ScientificConstantsAbility extends BasePreviewAbility {
  readonly id = "preview.constants.scientific";
  readonly label = "Scientific Constants";
  readonly priority = 22;
  override readonly safety: PreviewAbilitySafetyPolicy = {
    input: {
      maxLength: 160,
      syntax: "scientific constant keywords or aliases",
      notes:
        "Static PreviewSDK constant lookup; no dynamic execution, network or cache.",
    },
    dependencies: ["parser"],
    usesDynamicExecution: false,
    usesNetwork: false,
    usesCache: false,
    replacementPlan: "Completed: constant table moved into PreviewSDK.",
  };

  override canHandle(query: { text?: string }): boolean {
    if (!query.text || query.text.length > this.safety.input.maxLength)
      return false;
    return CONSTANT_KEYWORDS.test(query.text);
  }

  async execute(
    context: PreviewAbilityContext,
  ): Promise<PreviewAbilityResult | null> {
    const startedAt = Date.now();
    const text = this.getNormalizedQuery(context.query);
    if (!text || !this.isInputWithinLimit(context)) return null;

    const matched = findScientificConstant(text);
    if (!matched) return null;

    const value = formatValue(matched.value);

    const payload: PreviewCardPayload = {
      abilityId: this.id,
      title: matched.name,
      subtitle: matched.category,
      primaryLabel: "常量值",
      primaryValue: value.formatted,
      primaryUnit: matched.unit,
      description: matched.description,
      badges: [matched.symbol ?? "", matched.source ?? ""].filter(Boolean),
      chips: matched.aliases
        .filter((alias) => alias !== matched.name)
        .slice(0, 3)
        .map((alias) => ({ label: "别名", value: alias })),
      sections: [
        {
          title: "常量详情",
          rows: [
            { label: "标识", value: matched.id },
            ...(value.scientific
              ? [{ label: "科学计数法", value: value.scientific }]
              : []),
            { label: "来源", value: matched.source ?? "CODATA 2018" },
          ],
        },
      ],
      meta: {
        constantId: matched.id,
        aliases: matched.aliases,
        source: matched.source,
      },
    };

    return {
      abilityId: this.id,
      confidence: 0.7,
      payload,
      durationMs: Date.now() - startedAt,
    };
  }

  async preload(): Promise<void> {
    void SCIENTIFIC_CONSTANTS;
  }
}
