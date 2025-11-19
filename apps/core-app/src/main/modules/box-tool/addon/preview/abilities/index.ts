import type { PreviewAbilityRegistry } from '../preview-registry'
import { BasicExpressionAbility } from './basic-expression-ability'
import { ColorPreviewAbility } from './color-ability'
import { CurrencyPreviewAbility } from './currency-ability'
import { PercentageAbility } from './percentage-ability'
import { ScientificConstantsAbility } from './scientific-constants-ability'
import { TextStatsAbility } from './text-stats-ability'
import { TimeDeltaAbility } from './time-delta-ability'
import { UnitConversionAbility } from './unit-conversion-ability'

export function registerDefaultPreviewAbilities(registry: PreviewAbilityRegistry): void {
  registry.register(new BasicExpressionAbility())
  registry.register(new UnitConversionAbility())
  registry.register(new ScientificConstantsAbility())
  registry.register(new ColorPreviewAbility())
  registry.register(new TimeDeltaAbility())
  registry.register(new CurrencyPreviewAbility())
  registry.register(new PercentageAbility())
  registry.register(new TextStatsAbility())
}
