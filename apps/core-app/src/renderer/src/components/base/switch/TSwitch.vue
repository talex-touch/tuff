<script name="TSwitch" setup>
import { useModelWrapper } from '@talex-touch/utils/renderer/ref'
import { watch } from 'vue'

const props = defineProps(['modelValue', 'disabled'])
const emits = defineEmits(['update:modelValue', 'change'])

const model = useModelWrapper(props, emits)

watch(
  () => model,
  () => emits('change', model)
)
</script>

<template>
  <div
    role="radio"
    :class="{ select: model, disabled }"
    class="TSwitch-Container"
    @click="model = !model"
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

    //width: 25%;
    height: 70%;

    aspect-ratio: 1 / 1;

    top: 15%;
    left: 10%;

    border-radius: 5px;
    background-color: var(--el-text-color-secondary);
    transition: all 0.25s ease-in-out;
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
    box-shadow: 0 0 16px 1px var(--el-color-primary-light-3);
  }

  &:active:before {
    transform: scale(0.75);
  }

  position: relative;

  width: 44px;
  height: 24px;

  cursor: pointer;
  border-radius: 8px;
  background-color: var(--el-fill-color);
  //border: 1px solid var(--el-text-color-secondary);
  transition: all 0.125s ease-in-out;
}
</style>
