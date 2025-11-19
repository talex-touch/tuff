<script>
</script>

<script setup>
import { debounceFunction, useModelWrapper } from '@modules/utils'
import { ref, watch } from 'vue'

const props = defineProps(['modelValue'])

const emits = defineEmits(['update:modelValue', 'change'])

export default {
  name: 'PlayProgressBar',
}

const hover = ref(false)
const modelValue = useModelWrapper(props, emits)
const value = ref(modelValue.value)

watch(() => modelValue.value, () => {
  if (!hover.value)
    value.value = modelValue.value
})

let _v
function handleProgressChange(value) {
  if (_v === value)
    return
  _v = value
  // console.log( value )

  while (hover.value && _v === value) {
    _v = -1

    emits('change', value)
  }
}
</script>

<template>
  <el-slider
    v-model="value" class="PlayerProgressBar-Container" :show-tooltip="false"
    @mouseenter="hover = true" @mouseleave="hover = false"
    @input="handleProgressChange" @change="debounceFunction(handleProgressChange)"
  />
</template>

<style lang="scss" scoped>
.PlayerProgressBar-Container {
  :deep(.el-slider__button-wrapper) {
    opacity: 0;
  }
  position: relative;
  padding: 0 2%;

  box-sizing: border-box;

  --el-slider-main-bg-color: var(--el-fill-color-extra-light);
  --el-slider-runway-bg-color: var(--el-border-color-light);
  --el-slider-stop-bg-color: var(--el-color-white);

  --el-slider-border-radius: 1px;
  --el-slider-height: 5px;
  .dark & {
    filter: invert(1);
  }
  opacity: .85;
}
</style>
