<template>
  <div @click="refresh(!modelValue)" role="button" class="PlayPause-Container">
    <svg ref="_svg" class="icon-play" version="1.1" xmlns="https://www.w3.org/2000/svg" xmlns:xlink="https://www.w3.org/1999/xlink"
         width="100" height="100" viewBox="0 0 36 36"
         data-play="M 12,26 18.5,22 18.5,14 12,10 z M 18.5,22 25,18 25,18 18.5,14 z"
         data-pause="M 12,26 16.33,26 16.33,10 12,10 z M 20.66,26 25,26 25,10 20.66,10 z">
      <path d="M 12,26 16.33,26 16.33,10 12,10 z M 20.66,26 25,26 25,10 20.66,10 z"></path>
    </svg>
  </div>
</template>

<script>
export default {
  name: "PlayPause"
}
</script>

<script setup>
import { watchEffect, onMounted, ref, nextTick } from 'vue'
import { TweenLite } from 'gsap/gsap-core'
import { useModelWrapper } from '@modules/utils.ts'

const emits = defineEmits(['update:modelValue'])
const props = defineProps(['modelValue'])

const modelValue = useModelWrapper(props, emits)

const _svg = ref()

watchEffect(() => {
  nextTick(() => refresh(modelValue.value))
})

function refresh(value) {
  const svg = _svg.value
  if ( !svg ) return nextTick(() => refresh(value))
  modelValue.value = value
  const svgPath = svg.querySelector('path')

  TweenLite.to(svgPath, .25, {
    attr: {
      d: svg.getAttribute(!value ? 'data-play' : 'data-pause')
    }
  });
}
</script>

<style lang="scss" scoped>
.PlayPause-Container {
  &:hover {
    background-color: #00000010;
  }
  &:active {
    transform: scale(.8)
  }

  width: 48px;
  height: 48px;

  cursor: pointer;
  border-radius: 8px;
  transition: .1s;
}

.PlayPause-Container svg {
  width: 48px;
  height: 48px;

  fill: var(--el-text-color-primary)
}
</style>