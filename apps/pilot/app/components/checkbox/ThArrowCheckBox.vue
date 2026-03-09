<script setup lang="ts">
const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const active = useVModel(props, 'modelValue', emit)
</script>

<template>
  <div :class="{ active }" class="ThArrowCheckBox" @click="active = !active" />
</template>

<style lang="scss">
.ThArrowCheckBox {
  &.active {
    // &::before,
    // &::after {
    //   // background-color: var(--el-color-primary);
    // }

    &::before {
      transform: translate(-100%, 100%) rotate(40deg);
    }

    &::after {
      transform: translate(0%, 100%) rotate(-40deg);
    }
  }

  &::before,
  &::after {
    content: '';
    position: absolute;

    top: 50%;
    left: 50%;

    width: 8px;
    height: 2px;

    border-radius: 5px;
    transition: cubic-bezier(0.6, -0.28, 0.735, 0.045) 0.25s;
    transform: translate(-50%, -50%);
    background-color: var(--el-text-color-primary);
  }

  &::before {
    transform-origin: right top;
    transform: translate(-100%, -50%) rotate(-40deg);
  }

  &::after {
    transform-origin: left bottom;
    transform: translate(0%, -50%) rotate(40deg);
  }

  position: relative;

  width: 40px;
  height: 40px;
}
</style>
