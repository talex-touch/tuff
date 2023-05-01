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
@keyframes switchAnimation {
  0% {
    left: 10%;
    filter: brightness(1);
    border-radius: 5px;
  }
  50% {
    transform: scale(1.4, 1);
    filter: brightness(1.5) blur(2px);
    border-radius: 8px;
  }
  100% {
    left: 50%;
    filter: brightness(2) blur(0);
    border-radius: 5px;
  }
}

@keyframes switchAnimationReverse {
  0% {
    left: 50%;
    filter: brightness(2) blur(0);
    border-radius: 5px;
  }
  50% {
    transform: scale(1.4, 1);
    filter: brightness(1.5) blur(2px);
    border-radius: 8px;
  }
  100% {
    left: 10%;
    filter: brightness(1);
    border-radius: 5px;
  }
}

.TSwitch-Container {
  &.disabled {
    opacity: .5;

    pointer-events: none;
  }
  &:before {
    content: "";
    position: absolute;

    //width: 25%;
    height: 70%;

    aspect-ratio: 1 / 1;

    top: 15%;
    left: 10%;

    border-radius: 5px;
    background-color: var(--el-text-color-secondary);
    transition: all .25s ease-in-out;
    animation: switchAnimationReverse .25s ease-in-out forwards;
  }
  &.select {
    &:before {
      animation: switchAnimation .25s ease-in-out forwards;
    }
    border-color: transparent;
    background-color: var(--el-color-primary);
  }
  &:hover {
    box-shadow: 0 0 16px 1px var(--el-color-primary-light-3);
  }
  position: relative;

  width: 44px;
  height: 24px;

  cursor: pointer;
  border-radius: 8px;
  background-color: var(--el-fill-color);
  //border: 1px solid var(--el-text-color-secondary);
  transition: all .125s ease-in-out;
}
</style>