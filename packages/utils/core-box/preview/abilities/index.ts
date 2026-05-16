import type { PreviewAbility } from "../types";
import { AdvancedExpressionAbility } from "./advanced-expression-ability";
import { BasicExpressionAbility } from "./basic-expression-ability";
import { ColorPreviewAbility } from "./color-ability";
import { PercentageAbility } from "./percentage-ability";
import { ScientificConstantsAbility } from "./scientific-constants-ability";
import { TextStatsAbility } from "./text-stats-ability";
import { TimeDeltaAbility } from "./time-delta-ability";
import { UnitConversionAbility } from "./unit-conversion-ability";

export { AdvancedExpressionAbility } from "./advanced-expression-ability";
export {
  BasicExpressionAbility,
  evaluateBasicExpression,
} from "./basic-expression-ability";
export { ColorPreviewAbility } from "./color-ability";
export { PercentageAbility } from "./percentage-ability";
export {
  ScientificConstantsAbility,
  findScientificConstant,
  SCIENTIFIC_CONSTANTS,
  type ScientificConstantDefinition,
} from "./scientific-constants-ability";
export { TimeDeltaAbility } from "./time-delta-ability";
export { TextStatsAbility } from "./text-stats-ability";
export { UnitConversionAbility } from "./unit-conversion-ability";
export {
  convertUnit,
  formatUnitNumber,
  getAvailableCategories,
  getUnitSuggestions,
  getUnitsInCategory,
  looksLikeUnitConversion,
  parseUnitConversion,
  parseUnitQuery,
  resolveUnit,
  type ParsedUnitQuery,
  type UnitConversionResult,
  type UnitDefinition,
} from "./unit-conversion-core";

export function createDefaultPurePreviewAbilities(): PreviewAbility[] {
  return [
    new AdvancedExpressionAbility(),
    new BasicExpressionAbility(),
    new UnitConversionAbility(),
    new ScientificConstantsAbility(),
    new ColorPreviewAbility(),
    new TimeDeltaAbility(),
    new PercentageAbility(),
    new TextStatsAbility(),
  ];
}
