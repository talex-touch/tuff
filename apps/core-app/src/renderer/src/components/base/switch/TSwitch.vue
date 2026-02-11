<script name="TSwitch" setup>
import { useModelWrapper } from '@talex-touch/utils/renderer/ref'

const props = defineProps({
  modelValue: {
    type: Boolean,
    required: true
  },
  disabled: {
    type: Boolean,
    default: false
  }
})
const emits = defineEmits(['update:modelValue', 'change'])

const model = useModelWrapper(props, emits)

function toggle() {
  if (props.disabled) return
  const newVal = !model.value
  model.value = newVal
  emits('change', newVal)
}
</script>

<template>
  <div
    role="radio"
    :class="{ select: model, disabled }"
    class="TSwitch-Container"
    @click="toggle"
  />
</template>

<style lang="scss" scoped>
.TSwitch-Container {
  &.disabled {
    opacity: 0.5;
    pointer-events: none;
  }

  &:before {
    content: '';
    position: absolute;
    height: 70%;
    aspect-ratio: 1 / 1;
    top: 15%;
    left: 10%;
    border-radius: 5px;
    background-color: var(--el-text-color-secondary);
    transition:
      left 0.3s cubic-bezier(0.16, 1, 0.3, 1),
      background-color 0.25s ease,
      filter 0.25s ease,
      transform 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  }

  &.select {
    &:before {
      left: 50%;
      filter: brightness(2) blur(0);
      border-radius: 5px;
    }

    border-color: transparent;
    background-color: var(--el-color-primary);
  }

  &:hover {
    box-shadow: 0 0 12px 1px color-mix(in srgb, var(--el-color-primary) 20%, transparent);
  }

  &:active:before {
    transform: scaleX(1.2) scaleY(0.85);
  }

  position: relative;
  width: 44px;
  height: 24px;
  cursor: pointer;
  border-radius: 8px;
  background-color: var(--el-fill-color);
  transition:
    background-color 0.25s ease,
    border-color 0.25s ease,
    box-shadow 0.25s ease;
}
</style>
