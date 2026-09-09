<script lang="ts" setup name="CapabilityModelTransfer">
import type { TransferItem } from '@talex-touch/tuffex/transfer'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxInput } from '@talex-touch/tuffex/input'
import { TxTransfer } from '@talex-touch/tuffex/transfer'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = withDefaults(
  defineProps<{
    modelValue?: string[]
    availableModels?: string[]
    scopeKey?: string
    disabled?: boolean
  }>(),
  {
    modelValue: () => [],
    availableModels: () => [],
    scopeKey: '',
    disabled: false
  }
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: string[]): void
}>()

const { t } = useI18n()

const customModelInput = ref('')
const seenModels = ref<string[]>([])

function normalizeModel(value?: string): string {
  return (value ?? '').trim()
}

function trackModel(value?: string): void {
  const normalized = normalizeModel(value)
  if (!normalized) return
  if (!seenModels.value.includes(normalized)) {
    seenModels.value = [...seenModels.value, normalized]
  }
}

watch(
  () => props.scopeKey,
  () => {
    customModelInput.value = ''
    seenModels.value = []
  }
)

watch(
  () => props.availableModels,
  (list) => {
    list?.forEach(trackModel)
  },
  { immediate: true, deep: true }
)

watch(
  () => props.modelValue,
  (list) => {
    list?.forEach(trackModel)
  },
  { immediate: true, deep: true }
)

const selectedList = computed(() => (props.modelValue ?? []).map(normalizeModel).filter(Boolean))

/**
 * The pool keeps custom models that were added and then moved back: they are in
 * neither `availableModels` nor `modelValue`, so without `seenModels` they would
 * vanish from both panels.
 */
const transferData = computed<TransferItem[]>(() => {
  const pool = new Set<string>()
  ;(props.availableModels ?? []).forEach((model) => {
    const normalized = normalizeModel(model)
    if (normalized) pool.add(normalized)
  })
  seenModels.value.forEach((model) => {
    if (model) pool.add(model)
  })
  selectedList.value.forEach((model) => pool.add(model))

  return Array.from(pool)
    .sort((a, b) => a.localeCompare(b))
    .map((model) => ({ key: model, label: model }))
})

const panelTitles = computed<[string, string]>(() => [
  t('settings.intelligence.transferAvailableModels'),
  t('settings.intelligence.transferSelectedModels')
])

const panelEmptyText = computed<[string, string]>(() => [
  t('settings.intelligence.transferEmptyAvailable'),
  t('settings.intelligence.transferEmptySelected')
])

function emitSelection(next: Array<string | number>): void {
  const deduped: string[] = []
  next.forEach((model) => {
    const normalized = normalizeModel(String(model))
    if (!normalized) return
    if (!deduped.includes(normalized)) deduped.push(normalized)
    trackModel(normalized)
  })
  emit('update:modelValue', deduped)
}

const selectedModels = computed<Array<string | number>>({
  get: () => selectedList.value,
  set: (value) => emitSelection(value ?? [])
})

function handleAddCustom(): void {
  if (props.disabled) return
  const model = normalizeModel(customModelInput.value)
  if (!model) return
  emitSelection([...selectedList.value, model])
  customModelInput.value = ''
}

function handleKeyAdd(event: KeyboardEvent): void {
  if (event.key !== 'Enter') return
  event.preventDefault()
  handleAddCustom()
}
</script>

<template>
  <div class="capability-transfer" :class="{ 'is-disabled': disabled }">
    <TxTransfer
      v-model="selectedModels"
      :data="transferData"
      :titles="panelTitles"
      :empty-text="panelEmptyText"
      :filter-placeholder="t('settings.intelligence.transferFilterPlaceholder')"
      :add-aria-label="t('settings.intelligence.transferAddAriaLabel')"
      :remove-aria-label="t('settings.intelligence.transferRemoveAriaLabel')"
      :move-up-aria-label="t('settings.intelligence.transferMoveUpAriaLabel')"
      :move-down-aria-label="t('settings.intelligence.transferMoveDownAriaLabel')"
      :select-all-aria-label="t('settings.intelligence.transferSelectAllAriaLabel')"
      max-height="min(56dvh, 520px)"
      filterable
      orderable
      target-order="push"
    />

    <div class="capability-transfer__custom">
      <TxInput
        v-model="customModelInput"
        class="capability-transfer__custom-input"
        :disabled="disabled"
        :placeholder="t('settings.intelligence.transferCustomPlaceholder')"
        @keyup="handleKeyAdd"
      />
      <TxButton
        variant="flat"
        type="primary"
        :disabled="disabled || !customModelInput.trim()"
        @click="handleAddCustom"
      >
        <i class="i-carbon-add" />
        {{ t('settings.intelligence.transferAddButton') }}
      </TxButton>
    </div>
  </div>
</template>

<style scoped lang="scss">
.capability-transfer {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 100%;

  &.is-disabled {
    opacity: 0.6;
    pointer-events: none;
  }
}

.capability-transfer__custom {
  display: flex;
  gap: 0.5rem;
}

.capability-transfer__custom-input {
  flex: 1;
  min-width: 0;
}
</style>
