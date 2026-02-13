<script setup lang="ts">
import type { TxSearchSelectEmits, TxSearchSelectOption, TxSearchSelectProps } from './types'
import { autoUpdate, flip, offset, shift, size, useFloating } from '@floating-ui/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import TxCardItem from '../../card-item/src/TxCardItem.vue'
import TxCard from '../../card/src/TxCard.vue'
import TuffInput from '../../input/src/TxInput.vue'
import TxSpinner from '../../spinner/src/TxSpinner.vue'
import { getZIndex, nextZIndex } from '../../../../utils/z-index-manager'

defineOptions({ name: 'TxSearchSelect' })

const props = withDefaults(defineProps<TxSearchSelectProps>(), {
  modelValue: '',
  placeholder: 'Search',
  disabled: false,
  clearable: true,

  options: () => [],
  loading: false,

  remote: false,
  searchDebounce: 200,

  dropdownMaxHeight: 280,
  dropdownOffset: 6,

  panelVariant: 'solid',
  panelBackground: 'glass',
  panelShadow: 'soft',
  panelRadius: 18,
  panelPadding: 6,
})

const emit = defineEmits<TxSearchSelectEmits>()

const open = ref(false)
const referenceRef = ref<HTMLElement | null>(null)
const floatingRef = ref<HTMLElement | null>(null)
const zIndex = ref(getZIndex())
const cleanupAutoUpdate = ref<(() => void) | null>(null)
const lastOpenedAt = ref(0)

const inputRef = ref<any>(null)
const inputText = ref('')
const searchTimer = ref<ReturnType<typeof setTimeout> | null>(null)

const optionsMap = computed(() => {
  const m = new Map<string | number, TxSearchSelectOption>()
  for (const o of props.options ?? []) m.set(o.value, o)
  return m
})

const selectedOption = computed(() => optionsMap.value.get(props.modelValue ?? ''))

watch(
  selectedOption,
  (opt) => {
    if (!opt)
      return
    inputText.value = opt.label
  },
  { immediate: true },
)

const filteredOptions = computed(() => {
  const list = props.options ?? []
  if (props.remote)
    return list
  const q = inputText.value.trim().toLowerCase()
  if (!q)
    return list
  return list.filter(o => o.label.toLowerCase().includes(q))
})

function clearSearchTimer() {
  if (searchTimer.value) {
    clearTimeout(searchTimer.value)
    searchTimer.value = null
  }
}

function emitSearch(q: string) {
  if (!props.remote)
    return
  if (props.disabled)
    return
  emit('search', q)
}

function onInput(v: string | number) {
  const nextValue = typeof v === 'string' ? v : String(v)
  inputText.value = nextValue
  if (!open.value) {
    open.value = true
    emit('open')
  }

  if (!props.remote)
    return

  clearSearchTimer()
  const delay = Math.max(0, props.searchDebounce ?? 0)
  searchTimer.value = setTimeout(() => {
    searchTimer.value = null
    emitSearch(nextValue)
  }, delay)
}

function onEnter() {
  emitSearch(inputText.value)
}

function onFocus() {
  if (props.disabled)
    return
  if (!open.value) {
    open.value = true
    emit('open')
  }
}

function close() {
  if (!open.value)
    return
  open.value = false
  emit('close')
}

function onClear() {
  inputText.value = ''
  emit('update:modelValue', '')
  emit('change', '')
}

function onPick(opt: TxSearchSelectOption) {
  if (opt.disabled)
    return
  emit('update:modelValue', opt.value)
  emit('change', opt.value)
  emit('select', opt)
  inputText.value = opt.label
  close()
}

function isEventInside(e: Event, el: HTMLElement | null): boolean {
  if (!el)
    return false
  const anyE = e as any
  const path: EventTarget[] | undefined = typeof anyE.composedPath === 'function' ? anyE.composedPath() : undefined
  if (path && path.length)
    return path.includes(el)
  const t = (e.target ?? null) as Node | null
  return !!t && el.contains(t)
}

function handleOutside(e: Event) {
  if (!open.value)
    return
  if (performance.now() - lastOpenedAt.value < 60)
    return
  const inRef = isEventInside(e, referenceRef.value)
  const inFloat = isEventInside(e, floatingRef.value)
  if (!inRef && !inFloat)
    close()
}

function handleEsc(e: KeyboardEvent) {
  if (e.key !== 'Escape')
    return
  if (!open.value)
    return
  close()
}

const { floatingStyles, update } = useFloating(referenceRef, floatingRef, {
  placement: 'bottom-start',
  strategy: 'fixed',
  middleware: [
    offset(() => props.dropdownOffset),
    flip({ padding: 8 }),
    shift({ padding: 8 }),
    size({
      padding: 8,
      apply({ rects, availableHeight, elements }) {
        const h = Math.min(availableHeight, props.dropdownMaxHeight)
        Object.assign(elements.floating.style, {
          minWidth: `${rects.reference.width}px`,
          maxWidth: `${rects.reference.width}px`,
          height: `${h}px`,
          maxHeight: `${h}px`,
          overflow: 'hidden',
        })
      },
    }),
  ],
})

watch(
  open,
  async (v) => {
    if (!v) {
      cleanupAutoUpdate.value?.()
      cleanupAutoUpdate.value = null
      clearSearchTimer()
      return
    }

    zIndex.value = nextZIndex()
    lastOpenedAt.value = performance.now()
    await nextTick()
    await update()

    if (referenceRef.value && floatingRef.value) {
      cleanupAutoUpdate.value?.()
      cleanupAutoUpdate.value = autoUpdate(referenceRef.value, floatingRef.value, () => update())
    }
  },
  { flush: 'post' },
)

onMounted(() => {
  document.addEventListener('pointerdown', handleOutside, true)
  document.addEventListener('keydown', handleEsc)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleOutside, true)
  document.removeEventListener('keydown', handleEsc)
  cleanupAutoUpdate.value?.()
  cleanupAutoUpdate.value = null
  clearSearchTimer()
})

defineExpose({
  open: () => {
    if (props.disabled)
      return
    if (!open.value) {
      open.value = true
      emit('open')
    }
  },
  close,
  focus: () => inputRef.value?.focus?.(),
  blur: () => inputRef.value?.blur?.(),
  clear: () => inputRef.value?.clear?.(),
})
</script>

<template>
  <div
    ref="referenceRef"
    class="tx-search-select"
    :class="{ 'is-open': open, 'is-disabled': props.disabled }"
  >
    <TuffInput
      ref="inputRef"
      :model-value="inputText"
      :disabled="props.disabled"
      :placeholder="props.placeholder"
      :clearable="props.clearable"
      @update:model-value="onInput"
      @focus="onFocus"
      @keydown.enter="onEnter"
      @clear="onClear"
    >
      <template #prefix>
        <span class="tx-search-select__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path
              fill="currentColor"
              d="M10 2a8 8 0 105.293 14.293l4.207 4.207 1.414-1.414-4.207-4.207A8 8 0 0010 2zm0 2a6 6 0 110 12 6 6 0 010-12z"
            />
          </svg>
        </span>
      </template>
      <template #suffix>
        <span v-if="props.loading" class="tx-search-select__loading">
          <TxSpinner :size="12" />
        </span>
      </template>
    </TuffInput>

    <Teleport to="body">
      <Transition name="tx-search-select-dropdown">
        <div
          v-show="open && !props.disabled"
          ref="floatingRef"
          class="tx-search-select__dropdown"
          :style="[floatingStyles, { zIndex }]"
        >
          <TxCard
            class="tx-search-select__panel"
            :variant="props.panelVariant"
            :background="props.panelBackground"
            :shadow="props.panelShadow"
            :radius="props.panelRadius"
            :padding="props.panelPadding"
          >
            <div class="tx-search-select__list">
              <TxCardItem
                v-for="opt in filteredOptions"
                :key="String(opt.value)"
                class="tx-search-select__item"
                :class="{ 'is-selected': opt.value === props.modelValue, 'is-disabled': opt.disabled }"
                :clickable="!opt.disabled"
                :disabled="!!opt.disabled"
                :active="opt.value === props.modelValue"
                @click="onPick(opt)"
              >
                <template #title>
                  <span class="tx-search-select__item-label">{{ opt.label }}</span>
                </template>
              </TxCardItem>

              <div v-if="!props.loading && !filteredOptions.length" class="tx-search-select__empty">
                No results
              </div>
            </div>
          </TxCard>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
.tx-search-select__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-right: 6px;
  color: var(--tx-text-color-secondary, #909399);
}

.tx-search-select__loading {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--tx-text-color-secondary, #909399);
}

.tx-search-select__dropdown {
  padding: 0;
  background: transparent;
  border: none;
  overflow: hidden;
}

.tx-search-select__panel {
  width: 100%;
  height: 100%;
  overflow: auto;
}

.tx-search-select__list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tx-search-select__item {
  --tx-card-item-padding: 10px 10px;
  --tx-card-item-radius: 12px;
  --tx-card-item-gap: 8px;
}

.tx-search-select__item :deep(.tx-card-item__title) {
  font-weight: 500;
  color: var(--tx-text-color-primary, #303133);
}

.tx-search-select__item.is-disabled :deep(.tx-card-item__title) {
  color: var(--tx-disabled-text-color, #c0c4cc);
}

.tx-search-select__empty {
  padding: 8px 6px;
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
}

.tx-search-select-dropdown-enter-active,
.tx-search-select-dropdown-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.tx-search-select-dropdown-enter-from,
.tx-search-select-dropdown-leave-to {
  opacity: 0;
  transform: translateY(6px) scale(0.985);
}
</style>
