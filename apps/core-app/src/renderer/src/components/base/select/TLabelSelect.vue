<script name="TLabelSelect" setup lang="ts">
import { useModelWrapper } from '@talex-touch/utils/renderer/ref'
import { useDebounceFn } from '@vueuse/core'

const props = defineProps<{
  modelValue: string
}>()
const emits = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const pointer = ref()
const value = useModelWrapper(props, emits)

function fixPointer(el: HTMLElement) {
  const target = el.parentElement!.querySelector(
    `.TLabelSelectItem[data-type="label-select-item"][data-value="${value.value}"]`
  )
  if (!target) return

  Object.assign(el.style, {
    top: `0px`,
    left: `0px`,
    width: `100%`,
    height: `100%`
  })

  setTimeout(() => {
    const pointerRect = pointer.value.getBoundingClientRect()
    const rect = target.getBoundingClientRect()

    Object.assign(el.style, {
      top: `${rect.top - pointerRect.top}px`,
      left: `${rect.left - pointerRect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`
    })
  }, 200)
}

watch(
  () => value.value,
  () => {
    nextTick(() => {
      if (!pointer.value) return

      fixPointer(pointer.value)
    })
  },
  { immediate: true }
)

provide(
  'refresh',
  useDebounceFn((_value: string) => {
    value.value = _value
  }, 200)
)
</script>

<template>
  <div class="TLabelSelect">
    <slot />

    <div ref="pointer" class="TLabelSelect-Pointer" />
  </div>
</template>

<style lang="scss">
.TLabelSelect-Pointer {
  position: absolute;

  top: 0;
  left: 0;

  height: 100%;
  width: 100%;

  transition: 0.25s;
  border-radius: 4px;
  background-color: var(--el-fill-color-light);
}

.TLabelSelect {
  position: relative;
  display: flex;
  padding: 0.125rem 0.25rem;
  align-items: center;

  gap: 0.25rem;
  justify-content: center;

  width: max-content;
  height: 28px;

  border-radius: 4px;
  box-sizing: border-box;
  background-color: var(--el-fill-color);
}
</style>
