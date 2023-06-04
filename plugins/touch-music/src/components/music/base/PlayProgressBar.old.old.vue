<template>
  <div ref="bar" class="PlayerProgressBar-Container" :style="`--progress: ${(current / max) * 100}%`">
    <div class="PlayerProgressBar-Background"></div>
  </div>
<!--  <el-slider class="PlayerProgressBar-Container" @mouseenter="hover = true" @mouseleave="hover = false"
             @input="handleProgressChange" @change="debounceFunction(handleProgressChange)"
             v-model="value" :show-tooltip="false" />-->
</template>

<script>
export default {
  name: "PlayProgressBar"
}
</script>

<script setup>
import { onMounted, ref } from 'vue'
import { useModelWrapper } from '@modules/utils.ts'

const emits = defineEmits(['change'])
const props = defineProps(['current', 'max'])

const bar = ref()

onMounted(() => {
  const el = bar.value

  el.addEventListener('mousedown', () => {

    function move(e) {
      const { width } = el.getBoundingClientRect()
      const { offsetX } = e
      // const x = width - offsetX
      const percent = offsetX / width
      // const value = percent * props.max

      console.log( offsetX, width, percent * 100, e )
      // emits.change(value)
    }

    document.body.addEventListener('mousemove', move)

    document.body.addEventListener('mouseup', () => {
      document.body.removeEventListener('mousemove', move)
    })

  })
})
</script>

<style lang="scss" scoped>
.PlayerProgressBar-Container {
  &:before {
    z-index: 10;
    content: "";
    position: absolute;

    left: 0;
    top: 0;

    height: 100%;
    width: var(--progress, 0);

    background: var(--el-fill-color);
  }
  .PlayerProgressBar-Background {
    position: relative;

    left: 0;
    top: 0;

    height: 100%;
    width: 100%;

    opacity: 0.5;
    background-color: var(--el-color-primary-light-9);
  }
  position: relative;

  width: 100%;
  height: 5px;

  overflow: hidden;
  border-radius: 2px;
  box-sizing: border-box;
  transform: scaleX(.9);
}
</style>