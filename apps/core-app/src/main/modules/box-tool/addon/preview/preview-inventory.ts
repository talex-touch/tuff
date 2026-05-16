import type { PreviewAbilityInventoryItem } from '@talex-touch/utils/core-box/preview'
import { toPreviewAbilityInventoryItem } from '@talex-touch/utils/core-box/preview'
import { previewAbilityRegistry } from './preview-registry'

export interface DynamicExecutionInventoryItem {
  id: string
  file: string
  owner: 'preview-sdk' | 'core-app'
  boundary: 'parser' | 'sandbox' | 'network' | 'cache'
  dynamicExecution: boolean
  network: boolean
  cache: boolean
  status: 'migrated' | 'adapter' | 'planned'
  replacementPlan: string
}

const CORE_APP_ADAPTER_ABILITY_IDS = new Set(['preview.currency'])

const MIGRATED_ABILITY_IDS = new Set([
  'preview.expression.advanced',
  'preview.expression.basic',
  'preview.percent',
  'preview.textstats',
  'preview.color',
  'preview.unit',
  'preview.constants.scientific',
  'preview.time'
])

const ABILITY_FILES: Record<string, string> = {
  'preview.expression.basic':
    'packages/utils/core-box/preview/abilities/basic-expression-ability.ts',
  'preview.expression.advanced':
    'packages/utils/core-box/preview/abilities/advanced-expression-ability.ts',
  'preview.percent': 'packages/utils/core-box/preview/abilities/percentage-ability.ts',
  'preview.textstats': 'packages/utils/core-box/preview/abilities/text-stats-ability.ts',
  'preview.color': 'packages/utils/core-box/preview/abilities/color-ability.ts',
  'preview.unit': 'packages/utils/core-box/preview/abilities/unit-conversion-ability.ts',
  'preview.constants.scientific':
    'packages/utils/core-box/preview/abilities/scientific-constants-ability.ts',
  'preview.time': 'packages/utils/core-box/preview/abilities/time-delta-ability.ts',
  'preview.currency':
    'apps/core-app/src/main/modules/box-tool/addon/preview/abilities/currency-ability.ts'
}

const EXTERNAL_DYNAMIC_EXECUTION_ITEMS: DynamicExecutionInventoryItem[] = [
  {
    id: 'widget.runtime.sandbox',
    file: 'apps/core-app/src/renderer/src/modules/plugin/widget-registry.ts',
    owner: 'core-app',
    boundary: 'sandbox',
    dynamicExecution: true,
    network: false,
    cache: true,
    status: 'planned',
    replacementPlan:
      'Keep out of PreviewSDK. Continue Runtime Safety work around sandbox facade, dependency allowlist and storage/cache quota.'
  }
]

export function listPreviewAbilityInventory(): PreviewAbilityInventoryItem[] {
  return previewAbilityRegistry.list().map((ability) => {
    const status = MIGRATED_ABILITY_IDS.has(ability.id)
      ? 'migrated'
      : CORE_APP_ADAPTER_ABILITY_IDS.has(ability.id)
        ? 'adapter'
        : 'planned'
    const owner = status === 'migrated' ? 'preview-sdk' : 'core-app'
    return toPreviewAbilityInventoryItem(ability, owner, status)
  })
}

export function listPreviewDynamicExecutionInventory(): DynamicExecutionInventoryItem[] {
  const abilityItems = listPreviewAbilityInventory().map((item): DynamicExecutionInventoryItem => {
    const dependencies = item.safety.dependencies
    return {
      id: item.id,
      file: ABILITY_FILES[item.id] ?? 'unknown',
      owner: item.owner,
      boundary: dependencies.includes('sandbox')
        ? 'sandbox'
        : dependencies.includes('network')
          ? 'network'
          : dependencies.includes('cache')
            ? 'cache'
            : 'parser',
      dynamicExecution: item.safety.usesDynamicExecution,
      network: item.safety.usesNetwork,
      cache: item.safety.usesCache,
      status: item.status,
      replacementPlan: item.safety.replacementPlan ?? 'No replacement required.'
    }
  })

  return [...abilityItems, ...EXTERNAL_DYNAMIC_EXECUTION_ITEMS]
}
