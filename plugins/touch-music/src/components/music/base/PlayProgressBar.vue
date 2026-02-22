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
  <TxSlider
    v-model="value" class="PlayerProgressBar-Container" :show-tooltip="false"
    @mouseenter="hover = true" @mouseleave="hover = false"
    @update:model-value="handleProgressChange" @change="debounceFunction(handleProgressChange)"
  />
</template>

<style lang="scss" scoped>
.PlayerProgressBar-Container {
  position: relative;
  padding: 0 2%;

  box-sizing: border-box;

  --tx-fill-color: var(--tx-fill-color-extra-light);
  --tx-slider-height: 5px !important;
  --tx-slider-track-height: 5px !important;
  --tx-slider-thumb-size: 0px !important;
  --tx-slider-thumb-shadow: none;
  .dark & {
    filter: invert(1);
  }
  opacity: .85;
}
</style>
