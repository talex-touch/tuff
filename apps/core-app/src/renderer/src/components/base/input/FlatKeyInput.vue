<script setup lang="ts">
import FlatInput from './FlatInput.vue'
import { useVModel } from '@vueuse/core'
import { shortconApi } from '~/modules/channel/main/shortcon'

const props = defineProps<{
  modelValue: string
}>()
const emits = defineEmits<{
  (e: 'update:modelValue', val: string): void
}>()

const model = useVModel(props, 'modelValue', emits)

function startRecord(e: KeyboardEvent) {
  e.preventDefault()

  let extraKey = e.key

  if (extraKey === ' ') extraKey = 'space'
  else if (extraKey === '`') extraKey = 'Backquote'
  else if (extraKey === '.') extraKey = 'NumpadDecimal'
  else if (extraKey === '\\') extraKey = 'Backslash'
  else if (extraKey === '=') extraKey = 'Equal'
  else if (extraKey === '-') extraKey = 'Minus'

  if (e.altKey && extraKey !== 'altKey') extraKey = 'alt + ' + extraKey
  else if (e.ctrlKey && extraKey !== 'ctrlKey') extraKey = 'ctrl + ' + extraKey
  else if (e.metaKey && extraKey !== 'Meta') extraKey = 'meta + ' + extraKey
  else if (e.shiftKey && extraKey !== 'Shift') extraKey = 'shift + ' + extraKey

  setTimeout(() => (model.value = extraKey.toLocaleUpperCase()), 10)
}
</script>

<template>
  <FlatInput
    class="FlatKeyInput-Control"
    v-model="model"
    tabindex="0"
    @keydown="startRecord"
    @focus="shortconApi.disableAll"
    @blur="shortconApi.enableAll"
  />
</template>

<style scoped>
:deep(.FlatKeyInput-Control) {
  min-width: 220px;
  max-width: 300px;
  height: 36px;
}

:deep(.FlatKeyInput-Control input) {
  text-align: center;
  font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, Consolas, monospace;
  font-size: 13px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}
</style>
