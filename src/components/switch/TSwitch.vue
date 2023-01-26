<template>
  <div role="radio" @click="model = !model" :class="{ 'select': model, disabled }" class="TSwitch-Container">

  </div>
</template>

<script>
export default {
  name: "TSwitch"
}
</script>

<script setup>

import { useModelWrapper } from '@modules/utils'
import { watch } from 'vue'

const props = defineProps(['modelValue', 'disabled'])
const emits = defineEmits(['update:modelValue', 'change'])

const model = useModelWrapper(props, emits)

watch(() => model, () => emits('change', model))
</script>

<style lang="scss" scoped>
.TSwitch-Container {
  &.disabled {
    opacity: .5;

    pointer-events: none;
  }
  &:before {
    content: "";
    position: absolute;

    width: 25%;
    height: 8%;

    top: 48%;
    left: 10%;

    border-radius: 50%;
    background-color: var(--el-border-color);
    transition: all .25s ease-in-out;
  }
  &.select {
    &:before {
      left: 65%;
      top: 15%;

      width: 30%;
      height: 70%;
    }
    background-color: var(--el-color-primary);
  }
  position: relative;

  width: 44px;
  height: 20px;

  cursor: pointer;
  border-radius: 20px;
  border: 1px solid var(--el-border-color);
  transition: all .25s ease-in-out;
}
</style>