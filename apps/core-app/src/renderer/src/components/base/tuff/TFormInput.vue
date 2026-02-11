<script lang="ts" name="TFormInput" setup>
import type { StyleValue, WritableComputedRef } from 'vue'
import { useModelWrapper } from '@talex-touch/utils/renderer/ref'
import { computed, ref, useAttrs } from 'vue'

defineOptions({
  inheritAttrs: false
})

const props = withDefaults(
  defineProps<{
    modelValue?: string | number | null
    placeholder?: string
    type?: string
    textarea?: boolean
    rows?: number
    disabled?: boolean
    readonly?: boolean
    prefixIcon?: string
    suffixIcon?: string
  }>(),
  {
    placeholder: '',
    type: 'text',
    textarea: false,
    rows: 3,
    disabled: false,
    readonly: false
  }
)

const emits = defineEmits<{
  (e: 'update:modelValue', value: string | number | null | undefined): void
  (e: 'blur', event: FocusEvent): void
  (e: 'focus', event: FocusEvent): void
}>()

const value = useModelWrapper(props, emits) as unknown as WritableComputedRef<
  string | number | null | undefined
>
const showCapsLock = ref(false)
const attrs = useAttrs()
const wrapperClass = computed(() => attrs.class)
const wrapperStyle = computed<StyleValue | undefined>(() => attrs.style as StyleValue | undefined)
const inputAttrs = computed(() => {
  const { class: _class, style, ...rest } = attrs
  return rest
})

function handleKeydown(event: KeyboardEvent) {
  if (props.type !== 'password') return
  const keyCode = event.keyCode || event.which
  const shiftKey = event.shiftKey || keyCode === 16

  if (!event.getModifierState) {
    showCapsLock.value =
      (keyCode >= 65 && keyCode <= 90 && !shiftKey) || (keyCode >= 97 && keyCode <= 122 && shiftKey)
    return
  }
  showCapsLock.value = event.getModifierState('CapsLock')
}

const inputType = computed(() => (props.type === 'password' ? 'password' : props.type))
</script>

<template>
  <label class="TFormInput" :class="[{ disabled }, wrapperClass]" :style="wrapperStyle">
    <span v-if="prefixIcon" class="icon prefix">
      <i :class="prefixIcon" />
    </span>
    <textarea
      v-if="textarea"
      v-model="value"
      :placeholder="placeholder"
      :rows="rows"
      :disabled="disabled"
      :readonly="readonly"
      class="input-element"
      v-bind="inputAttrs"
      @keydown="handleKeydown"
      @blur="emits('blur', $event)"
      @focus="emits('focus', $event)"
    />
    <input
      v-else
      v-model="value"
      :type="inputType"
      :placeholder="placeholder"
      :disabled="disabled"
      :readonly="readonly"
      class="input-element"
      v-bind="inputAttrs"
      @keydown="handleKeydown"
      @blur="emits('blur', $event)"
      @focus="emits('focus', $event)"
    />
    <span v-if="suffixIcon" class="icon suffix">
      <i :class="suffixIcon" />
    </span>
    <span v-if="showCapsLock" class="caps-lock">Caps Lock</span>
  </label>
</template>

<style scoped lang="scss">
.TFormInput {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 12px;
  border: 1px solid var(--el-border-color);
  background: var(--el-fill-color);
  position: relative;
  transition: all 0.2s ease;
  width: 100%;

  &.disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  &:focus-within {
    border-color: var(--el-color-primary);
    box-shadow: 0 0 0 3px var(--el-color-primary-light-9);
  }

  .input-element {
    border: none;
    outline: none;
    background: transparent;
    width: 100%;
    font-size: 14px;
    color: var(--el-text-color-primary);
    resize: none;
  }

  .icon {
    color: var(--el-text-color-secondary);
    font-size: 16px;
    display: flex;
    align-items: center;
  }

  .caps-lock {
    position: absolute;
    top: -18px;
    right: 0;
    font-size: 12px;
    color: var(--el-color-danger);
  }
}
</style>
