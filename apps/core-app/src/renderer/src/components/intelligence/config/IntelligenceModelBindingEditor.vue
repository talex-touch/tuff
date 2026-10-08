<script lang="ts" name="IntelligenceModelBindingEditor" setup>
import type {
  IntelligenceEffectiveModel,
  IntelligenceModelBinding,
  IntelligenceProviderConfig,
  IntelligenceSessionThinkingLevel,
  IntelligenceThinkingLevel
} from '@talex-touch/utils/types/intelligence'
import type { IntelligenceReasoningLevel } from '@talex-touch/utils/intelligence/reasoning-effort'
import { formatTokenCount } from '@talex-touch/pi-desktop-reuse/model-catalog'
import { TxCheckbox } from '@talex-touch/tuffex/checkbox'
import { TxFlatRadio, TxFlatRadioItem } from '@talex-touch/tuffex/flat-radio'
import { TxInput } from '@talex-touch/tuffex/input'
import { TxNumberInput } from '@talex-touch/tuffex/number-input'
import { TuffSelect, TuffSelectItem } from '@talex-touch/tuffex/select'
import {
  bindingDefaultThinkingChoices,
  findModelBinding,
  patchModelBinding,
  providerModelIds,
  resolveEffectiveModel
} from '@talex-touch/utils/intelligence/model-binding'
import { REASONING_LEVELS } from '@talex-touch/utils/intelligence/reasoning-effort'
import { useIntelligenceSdk } from '@talex-touch/utils/renderer'
import { intelligenceSettings } from '@talex-touch/utils/renderer/storage'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { reasoningLevelLabelKey } from '~/modules/conversation/reasoning-effort-display'

const props = defineProps<{
  provider: IntelligenceProviderConfig
  disabled?: boolean
}>()

const emits = defineEmits<{
  change: []
}>()

const { t } = useI18n()
const aiClient = useIntelligenceSdk()

const modelIds = computed(() => providerModelIds(props.provider))
const selectedId = ref('')

watch(
  modelIds,
  (ids) => {
    if (!ids.includes(selectedId.value)) selectedId.value = ids[0] ?? ''
  },
  { immediate: true }
)

const binding = computed<IntelligenceModelBinding | undefined>(() =>
  findModelBinding(props.provider, selectedId.value)
)

/**
 * Main's own resolution for this provider's models, when Main offers them for chat: it includes
 * the catalog Main reads (the local CLI catalogues), which this page cannot open. Otherwise the
 * same shared resolver runs here on the stored binding — for a provider Main publishes no catalog
 * for, that is the identical answer.
 */
const mainResolved = ref<Map<string, IntelligenceEffectiveModel>>(new Map())
let refreshTimer: ReturnType<typeof setTimeout> | undefined

async function refreshMainResolution(): Promise<void> {
  try {
    const options = await aiClient.getProviderModelOptions({ capabilityId: 'text.chat' })
    const option = options.find((candidate) => candidate.providerId === props.provider.id)
    mainResolved.value = new Map(
      (option?.effectiveModels ?? []).map((model) => [model.modelId, model])
    )
  } catch {
    // The local resolution below stays authoritative for a provider Main does not offer.
    mainResolved.value = new Map()
  }
}

onMounted(refreshMainResolution)

watch(
  () => JSON.stringify(props.provider.models ?? []),
  () => {
    clearTimeout(refreshTimer)
    // Settings sync to Main asynchronously; a short delay lets Main see the saved binding first.
    refreshTimer = setTimeout(refreshMainResolution, 400)
  }
)

const effective = computed<IntelligenceEffectiveModel | null>(() => {
  const id = selectedId.value
  if (!id) return null
  const local = resolveEffectiveModel(props.provider, id)
  const main = mainResolved.value.get(id)
  if (!main) return local
  // Keep freshly edited user limits while settings sync to Main. Catalog limits must use Main's
  // latest resolution, not the stale catalog values persisted on the local binding.
  return {
    ...local,
    contextWindow: local.contextWindow.source === 'user' ? local.contextWindow : main.contextWindow,
    maxOutputTokens:
      local.maxOutputTokens.source === 'user' ? local.maxOutputTokens : main.maxOutputTokens,
    thinking: local.thinking.source === 'unknown' ? main.thinking : local.thinking,
    imageInput: local.imageInput.state === 'unknown' ? main.imageInput : local.imageInput
  }
})

function patch(fields: Partial<Omit<IntelligenceModelBinding, 'id'>>): void {
  if (props.disabled || !binding.value) return
  intelligenceSettings.updateProvider(props.provider.id, {
    models: patchModelBinding(props.provider.models ?? [], binding.value.id, fields)
  })
  emits('change')
}

const aliasDraft = ref('')
watch(
  binding,
  (current) => {
    aliasDraft.value = current?.alias ?? ''
  },
  { immediate: true }
)

function commitAlias(): void {
  const alias = aliasDraft.value.trim()
  if (alias === (binding.value?.alias ?? '')) return
  patch({ alias: alias || undefined })
}

function commitContextWindow(value: number | null): void {
  patch(
    value && value > 0
      ? { contextWindow: Math.round(value), contextWindowSource: 'user' }
      : { contextWindow: undefined, contextWindowSource: undefined }
  )
}

function commitMaxTokens(value: number | null): void {
  patch(
    value && value > 0
      ? { maxTokens: Math.round(value), maxTokensSource: 'user' }
      : { maxTokens: undefined, maxTokensSource: undefined }
  )
}

type ThinkingMode = 'route' | 'none' | 'custom'

const thinkingMode = computed<ThinkingMode>(() => {
  const levels = binding.value?.thinkingLevels
  if (!levels) return 'route'
  return levels.some((level) => level !== 'off') ? 'custom' : 'none'
})

/** The ladder a user picks from: every level a request can carry, weakest first. */
const selectableLevels = REASONING_LEVELS

function setThinkingMode(mode: ThinkingMode): void {
  if (mode === thinkingMode.value) return
  if (mode === 'route') {
    patch({ thinkingLevels: undefined, defaultThinkingLevel: undefined })
  } else if (mode === 'none') {
    patch({ thinkingLevels: [], defaultThinkingLevel: undefined })
  } else {
    // Start from what the route would offer, so switching to custom changes nothing until edited.
    const current = effective.value?.thinking.levels ?? []
    patch({ thinkingLevels: current.length > 0 ? [...current] : ['low', 'medium', 'high'] })
  }
}

function isLevelEnabled(level: IntelligenceReasoningLevel): boolean {
  return binding.value?.thinkingLevels?.includes(level) ?? false
}

function toggleLevel(level: IntelligenceReasoningLevel, enabled: boolean): void {
  const current = binding.value?.thinkingLevels ?? []
  const next: IntelligenceThinkingLevel[] = enabled
    ? [...current, level]
    : current.filter((candidate) => candidate !== level)
  patch({ thinkingLevels: next })
}

const showsProtocol = computed(() => props.provider.type === 'anthropic')
const protocolValue = computed(() => binding.value?.thinkingProtocol ?? 'route')

function setProtocol(value: string): void {
  patch({ thinkingProtocol: value === 'legacy' || value === 'adaptive' ? value : undefined })
}

/** Defaults a new session can start at; auto is what "not set" already means. */
const defaultChoices = computed<IntelligenceSessionThinkingLevel[]>(() =>
  effective.value?.thinking.wire
    ? bindingDefaultThinkingChoices(effective.value.thinking.levels).filter(
        (level) => level !== 'omit'
      )
    : []
)

const defaultValue = computed({
  get: () => binding.value?.defaultThinkingLevel ?? '',
  set: (value: string) => {
    const level = defaultChoices.value.find((choice) => choice === value)
    patch({ defaultThinkingLevel: level ?? undefined })
  }
})

const imageValue = computed(() => {
  const override = binding.value?.supportsImages
  return override === true ? 'on' : override === false ? 'off' : 'catalog'
})

function setImages(value: string): void {
  patch({ supportsImages: value === 'on' ? true : value === 'off' ? false : undefined })
}

function limitText(limit: { value?: number }): string {
  return limit.value === undefined
    ? t('intelligence.config.model.binding.unknown')
    : formatTokenCount(limit.value)
}

const thinkingSummary = computed(() => {
  const thinking = effective.value?.thinking
  if (!thinking) return ''
  if (!thinking.wire) {
    return thinking.unsupported === 'provider'
      ? t('intelligence.config.model.binding.thinkingUnsupportedProvider')
      : t('intelligence.config.model.binding.thinkingUnsupportedModel')
  }
  return thinking.levels.map((level) => t(reasoningLevelLabelKey(level))).join(' · ')
})
</script>

<template>
  <div class="model-binding-editor">
    <p v-if="!modelIds.length" class="model-binding-editor__empty">
      {{ t('intelligence.config.model.binding.noModels') }}
    </p>

    <template v-else>
      <div class="model-binding-editor__field">
        <label class="model-binding-editor__label" for="model-binding-model">
          {{ t('intelligence.config.model.binding.model') }}
        </label>
        <TuffSelect id="model-binding-model" v-model="selectedId" searchable>
          <TuffSelectItem
            v-for="id in modelIds"
            :key="id"
            :value="id"
            :label="findModelBinding(provider, id)?.alias ?? id"
          />
        </TuffSelect>
      </div>

      <section v-if="effective" class="model-binding-editor__effective" aria-live="polite">
        <h4>{{ t('intelligence.config.model.binding.effective') }}</h4>
        <dl>
          <div>
            <dt>{{ t('intelligence.config.model.binding.wireId') }}</dt>
            <dd class="model-binding-editor__mono">{{ effective.modelId }}</dd>
          </div>
          <div>
            <dt>{{ t('intelligence.config.model.binding.contextWindow') }}</dt>
            <dd>
              {{ limitText(effective.contextWindow) }}
              <span class="model-binding-editor__source">
                {{
                  t(`intelligence.config.model.binding.source.${effective.contextWindow.source}`)
                }}
              </span>
            </dd>
          </div>
          <div>
            <dt>{{ t('intelligence.config.model.binding.maxTokens') }}</dt>
            <dd>
              {{ limitText(effective.maxOutputTokens) }}
              <span class="model-binding-editor__source">
                {{
                  t(`intelligence.config.model.binding.source.${effective.maxOutputTokens.source}`)
                }}
              </span>
              <span v-if="!effective.maxOutputTokens.enforced" class="model-binding-editor__note">
                {{ t('intelligence.config.model.binding.notEnforced') }}
              </span>
            </dd>
          </div>
          <div>
            <dt>{{ t('intelligence.config.model.binding.thinking') }}</dt>
            <dd>
              {{ thinkingSummary }}
              <span class="model-binding-editor__source">
                {{ t(`intelligence.config.model.binding.source.${effective.thinking.source}`) }}
              </span>
            </dd>
          </div>
          <div>
            <dt>{{ t('intelligence.config.model.binding.images') }}</dt>
            <dd>
              {{ t(`intelligence.config.model.binding.imageState.${effective.imageInput.state}`) }}
              <span class="model-binding-editor__note">
                {{
                  effective.imageInput.accepted
                    ? t('intelligence.config.model.binding.imageAccepted')
                    : t('intelligence.config.model.binding.imageRefused')
                }}
              </span>
            </dd>
          </div>
        </dl>
      </section>

      <div class="model-binding-editor__field">
        <label class="model-binding-editor__label" for="model-binding-alias">
          {{ t('intelligence.config.model.binding.alias') }}
        </label>
        <TxInput
          id="model-binding-alias"
          v-model="aliasDraft"
          :placeholder="selectedId"
          :disabled="disabled"
          @blur="commitAlias"
          @keyup.enter="commitAlias"
        />
        <p class="model-binding-editor__hint">
          {{ t('intelligence.config.model.binding.aliasHint') }}
        </p>
      </div>

      <div class="model-binding-editor__row">
        <div class="model-binding-editor__field">
          <label class="model-binding-editor__label" for="model-binding-context">
            {{ t('intelligence.config.model.binding.contextWindow') }}
          </label>
          <TxNumberInput
            id="model-binding-context"
            :model-value="binding?.contextWindow ?? null"
            :min="1"
            :step="1024"
            :placeholder="t('intelligence.config.model.binding.unknownPlaceholder')"
            :disabled="disabled"
            @change="commitContextWindow"
          />
          <p class="model-binding-editor__hint">
            {{ t('intelligence.config.model.binding.contextWindowHint') }}
          </p>
        </div>
        <div class="model-binding-editor__field">
          <label class="model-binding-editor__label" for="model-binding-output">
            {{ t('intelligence.config.model.binding.maxTokens') }}
          </label>
          <TxNumberInput
            id="model-binding-output"
            :model-value="binding?.maxTokens ?? null"
            :min="1"
            :step="256"
            :placeholder="t('intelligence.config.model.binding.unknownPlaceholder')"
            :disabled="disabled"
            @change="commitMaxTokens"
          />
          <p class="model-binding-editor__hint">
            {{ t('intelligence.config.model.binding.maxTokensHint') }}
          </p>
        </div>
      </div>

      <div class="model-binding-editor__field">
        <span class="model-binding-editor__label">
          {{ t('intelligence.config.model.binding.thinking') }}
        </span>
        <TxFlatRadio
          :model-value="thinkingMode"
          :disabled="disabled"
          size="sm"
          @update:model-value="(value) => setThinkingMode(value as ThinkingMode)"
        >
          <TxFlatRadioItem
            value="route"
            :label="t('intelligence.config.model.binding.thinkingRoute')"
          />
          <TxFlatRadioItem
            value="none"
            :label="t('intelligence.config.model.binding.thinkingNone')"
          />
          <TxFlatRadioItem
            value="custom"
            :label="t('intelligence.config.model.binding.thinkingCustom')"
          />
        </TxFlatRadio>
        <div v-if="thinkingMode === 'custom'" class="model-binding-editor__levels">
          <TxCheckbox
            v-for="level in selectableLevels"
            :key="level"
            :model-value="isLevelEnabled(level)"
            :label="t(reasoningLevelLabelKey(level))"
            :disabled="disabled"
            @update:model-value="(value: boolean) => toggleLevel(level, value)"
          />
        </div>
        <p class="model-binding-editor__hint">
          {{ t('intelligence.config.model.binding.thinkingHint') }}
        </p>
      </div>

      <div v-if="showsProtocol" class="model-binding-editor__field">
        <span class="model-binding-editor__label">
          {{ t('intelligence.config.model.binding.protocol') }}
        </span>
        <TxFlatRadio
          :model-value="protocolValue"
          :disabled="disabled"
          size="sm"
          @update:model-value="(value) => setProtocol(String(value))"
        >
          <TxFlatRadioItem
            value="route"
            :label="t('intelligence.config.model.binding.protocolRoute')"
          />
          <TxFlatRadioItem
            value="legacy"
            :label="t('intelligence.config.model.binding.protocolLegacy')"
          />
          <TxFlatRadioItem
            value="adaptive"
            :label="t('intelligence.config.model.binding.protocolAdaptive')"
          />
        </TxFlatRadio>
      </div>

      <div class="model-binding-editor__field">
        <label class="model-binding-editor__label" for="model-binding-default">
          {{ t('intelligence.config.model.binding.defaultLevel') }}
        </label>
        <TuffSelect
          id="model-binding-default"
          v-model="defaultValue"
          :disabled="disabled || defaultChoices.length === 0"
        >
          <TuffSelectItem
            value=""
            :label="t('intelligence.config.model.binding.defaultLevelNone')"
          />
          <TuffSelectItem
            v-for="level in defaultChoices"
            :key="level"
            :value="level"
            :label="t(reasoningLevelLabelKey(level as IntelligenceReasoningLevel))"
          />
        </TuffSelect>
        <p class="model-binding-editor__hint">
          {{ t('intelligence.config.model.binding.defaultLevelHint') }}
        </p>
      </div>

      <div class="model-binding-editor__field">
        <span class="model-binding-editor__label">
          {{ t('intelligence.config.model.binding.images') }}
        </span>
        <TxFlatRadio
          :model-value="imageValue"
          :disabled="disabled"
          size="sm"
          @update:model-value="(value) => setImages(String(value))"
        >
          <TxFlatRadioItem
            value="catalog"
            :label="t('intelligence.config.model.binding.imagesCatalog')"
          />
          <TxFlatRadioItem
            value="on"
            :label="t('intelligence.config.model.binding.imagesOn')"
            :disabled="effective ? !effective.imageInput.adapter : false"
          />
          <TxFlatRadioItem value="off" :label="t('intelligence.config.model.binding.imagesOff')" />
        </TxFlatRadio>
        <p class="model-binding-editor__hint">
          {{
            effective && !effective.imageInput.adapter
              ? t('intelligence.config.model.binding.imagesAdapterUnsupported')
              : t('intelligence.config.model.binding.imagesHint')
          }}
        </p>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.model-binding-editor {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 4px 12px 12px;

  &__empty {
    color: var(--tx-text-color-secondary);
    font-size: 13px;
  }

  &__row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
  }

  &__field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  &__label {
    color: var(--tx-text-color-primary);
    font-size: 13px;
    font-weight: 600;
  }

  &__hint {
    margin: 0;
    color: var(--tx-text-color-secondary);
    font-size: 12px;
  }

  &__levels {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
  }

  &__effective {
    padding: 12px;
    border: 1px solid var(--tx-border-color-lighter);
    border-radius: 8px;
    background: var(--tx-fill-color-lighter);

    h4 {
      margin: 0 0 8px;
      color: var(--tx-text-color-secondary);
      font-size: 12px;
      font-weight: 600;
    }

    dl {
      display: grid;
      gap: 6px;
      margin: 0;
    }

    dl > div {
      display: grid;
      grid-template-columns: minmax(96px, 30%) 1fr;
      gap: 8px;
      font-size: 13px;
    }

    dt {
      color: var(--tx-text-color-secondary);
    }

    dd {
      margin: 0;
      color: var(--tx-text-color-primary);
      overflow-wrap: anywhere;
    }
  }

  &__source,
  &__note {
    margin-left: 6px;
    color: var(--tx-text-color-secondary);
    font-size: 12px;
  }

  &__mono {
    font-family: var(--tx-font-family-mono, ui-monospace, monospace);
  }
}
</style>
