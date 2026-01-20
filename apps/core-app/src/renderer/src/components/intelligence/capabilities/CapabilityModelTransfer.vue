<script lang="ts" setup name="CapabilityModelTransfer">
import { computed, ref, watch } from 'vue'
import { TxButton } from '@talex-touch/tuffex'

const props = withDefaults(
  defineProps<{
    modelValue?: string[]
    availableModels?: string[]
    disabled?: boolean
  }>(),
  {
    modelValue: () => [],
    availableModels: () => [],
    disabled: false
  }
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: string[]): void
}>()

const availableSelection = ref<string[]>([])
const selectedSelection = ref<string[]>([])
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
    selectedSelection.value = selectedSelection.value.filter((item) => list?.includes(item))
  },
  { immediate: true, deep: true }
)

const availableList = computed(() => {
  const selectedSet = new Set((props.modelValue ?? []).map(normalizeModel))
  const pool = new Set<string>()
  ;(props.availableModels ?? []).forEach((model) => {
    const normalized = normalizeModel(model)
    if (normalized) pool.add(normalized)
  })
  seenModels.value.forEach((model) => {
    if (model) pool.add(model)
  })
  return Array.from(pool).filter((model) => !selectedSet.has(model))
})

const selectedList = computed(() => (props.modelValue ?? []).map(normalizeModel).filter(Boolean))

watch(availableList, (list) => {
  availableSelection.value = availableSelection.value.filter((item) => list.includes(item))
})

watch(selectedList, (list) => {
  selectedSelection.value = selectedSelection.value.filter((item) => list.includes(item))
})

function emitSelection(next: string[]): void {
  const deduped: string[] = []
  next.forEach((model) => {
    const normalized = normalizeModel(model)
    if (!normalized) return
    if (!deduped.includes(normalized)) deduped.push(normalized)
    trackModel(normalized)
  })
  emit('update:modelValue', deduped)
}

function handleToggleAvailable(model: string): void {
  if (props.disabled) return
  availableSelection.value = availableSelection.value.includes(model)
    ? availableSelection.value.filter((item) => item !== model)
    : [...availableSelection.value, model]
}

function handleToggleSelected(model: string): void {
  if (props.disabled) return
  selectedSelection.value = selectedSelection.value.includes(model)
    ? selectedSelection.value.filter((item) => item !== model)
    : [...selectedSelection.value, model]
}

function moveToSelected(model?: string): void {
  if (props.disabled) return
  const moveList = model ? [model] : availableSelection.value
  if (!moveList.length) return
  const ordered = availableList.value.filter((item) => moveList.includes(item))
  emitSelection([...selectedList.value, ...ordered])
  availableSelection.value = []
}

function removeFromSelected(model?: string): void {
  if (props.disabled) return
  const removeList = model ? [model] : selectedSelection.value
  if (!removeList.length) return
  emitSelection(selectedList.value.filter((item) => !removeList.includes(item)))
  selectedSelection.value = []
}

function moveItem(model: string, direction: number): void {
  if (props.disabled) return
  const current = [...selectedList.value]
  const index = current.findIndex((item) => item === model)
  if (index === -1) return
  const nextIndex = index + direction
  if (nextIndex < 0 || nextIndex >= current.length) {
    return
  }
  ;[current[index], current[nextIndex]] = [current[nextIndex], current[index]]
  emitSelection(current)
}

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
    <div class="capability-transfer__panel" aria-label="Available models">
      <header>
        <div>
          <p>可用模型</p>
          <span class="capability-transfer__hint">({{ availableList.length }})</span>
        </div>
      </header>
      <div class="capability-transfer__list" role="listbox">
        <p v-if="availableList.length === 0" class="capability-transfer__empty">
          暂无可选模型，先在渠道配置里同步一下吧。
        </p>
        <TxButton
          v-for="model in availableList"
          :key="model"
          variant="bare"
          native-type="button"
          class="capability-transfer__item"
          :class="{ 'is-selected': availableSelection.includes(model) }"
          :aria-pressed="availableSelection.includes(model)"
          @click="handleToggleAvailable(model)"
          @dblclick="moveToSelected(model)"
        >
          <i class="i-carbon-model" aria-hidden="true" />
          <span>{{ model }}</span>
        </TxButton>
      </div>
      <div class="capability-transfer__custom">
        <input
          v-model="customModelInput"
          :disabled="disabled"
          type="text"
          placeholder="自定义模型 ID"
          @keyup="handleKeyAdd"
        />
        <TxButton
          variant="flat"
          size="sm"
          :disabled="disabled || !customModelInput.trim()"
          @click="handleAddCustom"
        >
          <i class="i-carbon-add" />
          添加
        </TxButton>
      </div>
    </div>

    <div class="capability-transfer__actions" aria-hidden="true">
      <TxButton
        variant="bare"
        native-type="button"
        class="capability-transfer__action-btn"
        :disabled="disabled || !availableSelection.length"
        @click="moveToSelected()"
      >
        <i class="i-carbon-chevron-right" aria-hidden="true" />
      </TxButton>
      <TxButton
        variant="bare"
        native-type="button"
        class="capability-transfer__action-btn"
        :disabled="disabled || !selectedSelection.length"
        @click="removeFromSelected()"
      >
        <i class="i-carbon-chevron-left" aria-hidden="true" />
      </TxButton>
    </div>

    <div
      class="capability-transfer__panel capability-transfer__panel--selected"
      aria-label="Selected models"
    >
      <header>
        <div>
          <p>已绑定模型</p>
          <span class="capability-transfer__hint">({{ selectedList.length }})</span>
        </div>
      </header>
      <div class="capability-transfer__list capability-transfer__list--selected" role="listbox">
        <p v-if="selectedList.length === 0" class="capability-transfer__empty">
          右侧列表为空，至少加一个模型才能调用这个渠道。
        </p>
        <div
          v-for="(model, index) in selectedList"
          :key="model"
          class="capability-transfer__selected"
          :class="{ 'is-picked': selectedSelection.includes(model) }"
        >
          <TxButton
            variant="bare"
            native-type="button"
            class="capability-transfer__item capability-transfer__item--selected"
            :aria-pressed="selectedSelection.includes(model)"
            @click="handleToggleSelected(model)"
          >
            <span class="capability-transfer__order">{{ index + 1 }}</span>
            <span>{{ model }}</span>
          </TxButton>
          <div class="capability-transfer__selected-actions">
            <TxButton
              variant="bare"
              native-type="button"
              :disabled="disabled || index === 0"
              @click="moveItem(model, -1)"
            >
              <i class="i-carbon-arrow-up" aria-hidden="true" />
            </TxButton>
            <TxButton
              variant="bare"
              native-type="button"
              :disabled="disabled || index === selectedList.length - 1"
              @click="moveItem(model, 1)"
            >
              <i class="i-carbon-arrow-down" aria-hidden="true" />
            </TxButton>
            <TxButton
              variant="bare"
              native-type="button"
              :disabled="disabled"
              @click="removeFromSelected(model)"
            >
              <i class="i-carbon-trash-can" aria-hidden="true" />
            </TxButton>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.capability-transfer {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 1rem;
  width: 100%;
  min-height: 240px;

  &.is-disabled {
    opacity: 0.6;
    pointer-events: none;
  }
}

.capability-transfer__panel {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 1rem;
  padding: 1rem;
  background: var(--el-fill-color-lighter);
  display: flex;
  flex-direction: column;

  header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.75rem;

    p {
      font-weight: 600;
      font-size: 0.9rem;
      margin: 0;
    }
  }
}

.capability-transfer__hint {
  font-size: 0.75rem;
  color: var(--el-text-color-secondary);
}

.capability-transfer__list {
  flex: 1;
  border: 1px dashed var(--el-border-color);
  border-radius: 0.75rem;
  padding: 0.75rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  background: var(--el-bg-color);
}

.capability-transfer__empty {
  margin: 0;
  font-size: 0.85rem;
  color: var(--el-text-color-secondary);
  text-align: center;
}

.capability-transfer__item {
  width: 100%;
  border: 1px solid transparent;
  border-radius: 0.65rem;
  padding: 0.6rem 0.75rem;
  background: var(--el-fill-color-light);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    background 0.2s ease;

  i {
    color: var(--el-text-color-placeholder);
  }

  &.is-selected {
    border-color: var(--el-color-primary-light-5);
    background: rgba(99, 102, 241, 0.08);
  }
}

.capability-transfer__custom {
  margin-top: 0.75rem;
  display: flex;
  gap: 0.5rem;

  input {
    flex: 1;
    border: 1px solid var(--el-border-color);
    border-radius: 0.75rem;
    padding: 0.45rem 0.75rem;
    background: var(--el-bg-color);
    font: inherit;
  }
}

.capability-transfer__actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: center;
  justify-content: center;
}

.capability-transfer__action-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid var(--el-border-color);
  background: var(--el-bg-color);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s ease;

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.capability-transfer__panel--selected {
  background: rgba(99, 102, 241, 0.04);
}

.capability-transfer__selected {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.4rem;
  border-radius: 0.75rem;

  &.is-picked {
    background: rgba(99, 102, 241, 0.08);
  }
}

.capability-transfer__item--selected {
  justify-content: flex-start;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0.45rem 0.5rem;
}

.capability-transfer__order {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--el-fill-color);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--el-text-color-secondary);
}

.capability-transfer__selected-actions {
  display: flex;
  gap: 0.25rem;

  button {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 1px solid var(--el-border-color-lighter);
    background: var(--el-bg-color);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;

    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  }
}
</style>
