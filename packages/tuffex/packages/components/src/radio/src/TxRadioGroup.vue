<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, toRefs, watch } from 'vue'
import type { TxRadioGroupProps, TxRadioValue } from './types'

defineOptions({ name: 'TxRadioGroup' })

const props = withDefaults(defineProps<TxRadioGroupProps>(), {
  modelValue: undefined,
  disabled: false,
  type: 'button',
})

const { disabled, type } = toRefs(props)

const emit = defineEmits<{
  (e: 'update:modelValue', v: TxRadioValue): void
  (e: 'change', v: TxRadioValue): void
}>()

const model = computed({
  get: () => props.modelValue,
  set: (v) => {
    emit('update:modelValue', v)
    emit('change', v)
  },
})

const groupRef = ref<HTMLElement | null>(null)
const indicatorStyle = ref<Record<string, string>>({})
let indicatorRaf: number | null = null

function updateIndicator() {
  if (type.value !== 'button') return
  const root = groupRef.value
  if (!root) return

  const checked = root.querySelector<HTMLElement>('.tx-radio.tx-radio--button.is-checked')
  if (!checked) {
    indicatorStyle.value = { opacity: '0' }
    return
  }

  const rootRect = root.getBoundingClientRect()
  const rect = checked.getBoundingClientRect()
  const left = rect.left - rootRect.left
  const top = rect.top - rootRect.top

  indicatorStyle.value = {
    opacity: '1',
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    transform: `translate3d(${left}px, ${top}px, 0)`,
  }
}

function queueUpdateIndicator() {
  if (indicatorRaf != null) cancelAnimationFrame(indicatorRaf)
  indicatorRaf = requestAnimationFrame(() => {
    indicatorRaf = null
    updateIndicator()
  })
}

const ctx = {
  model,
  disabled: computed(() => disabled.value),
  type: computed(() => type.value),
}

provide('tx-radio-group', ctx)

onMounted(async () => {
  await nextTick()
  queueUpdateIndicator()
  window.addEventListener('resize', queueUpdateIndicator)
})

onBeforeUnmount(() => {
  if (indicatorRaf != null) cancelAnimationFrame(indicatorRaf)
  window.removeEventListener('resize', queueUpdateIndicator)
})

watch(
  () => props.modelValue,
  async () => {
    await nextTick()
    queueUpdateIndicator()
  },
  { flush: 'post' },
)

watch(
  type,
  async () => {
    await nextTick()
    queueUpdateIndicator()
  },
  { flush: 'post' },
)
</script>

<template>
  <div ref="groupRef" class="tx-radio-group" role="radiogroup" :aria-disabled="disabled" :class="`tx-radio-group--${type}`">
    <span v-if="type === 'button'" class="tx-radio-group__indicator" :style="indicatorStyle" aria-hidden="true"></span>
    <slot />
  </div>
</template>

<style lang="scss" scoped>
.tx-radio-group {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 2px;

  &--button {
    padding: 3px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 72%, transparent);
    background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 10%, transparent);
  }

  &--standard {
    flex-direction: column;
    gap: 8px;
    padding: 0;
    border: none;
    background: transparent;
  }
}

.tx-radio-group__indicator {
  position: absolute;
  left: 0;
  top: 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--tx-color-primary, #409eff) 16%, transparent);
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.06);
  transition: transform 0.22s cubic-bezier(0.2, 0.9, 0.2, 1), width 0.22s cubic-bezier(0.2, 0.9, 0.2, 1), height 0.22s cubic-bezier(0.2, 0.9, 0.2, 1), opacity 0.18s ease;
  pointer-events: none;
  z-index: 0;
}

.tx-radio-group--button :deep(.tx-radio) {
  position: relative;
  z-index: 1;
}
</style>
