<script setup lang="ts">
import { hasNavigator, isNodeRuntime } from '@talex-touch/utils/env'
import { useVModel } from '@vueuse/core'
import { shortconApi } from '~/modules/channel/main/shortcon'
import FlatInput from './FlatInput.vue'

const props = defineProps<{
  modelValue: string
}>()
const emits = defineEmits<{
  (e: 'update:modelValue', val: string): void
}>()

const model = useVModel(props, 'modelValue', emits)

const platform
  = isNodeRuntime() && process?.platform
    ? process.platform
    : hasNavigator()
      ? navigator.platform.toLowerCase()
      : ''
const isMac = platform === 'darwin' || platform.includes('mac')
const metaModifier = isMac ? 'Command' : 'Super'
const altModifier = isMac ? 'Option' : 'Alt'

const MODIFIER_ONLY_KEYS = new Set(['Meta', 'Alt', 'Control', 'Shift'])

const SPECIAL_KEYS: Record<string, string> = {
  ' ': 'Space',
  'Spacebar': 'Space',
  'Space': 'Space',
  'ArrowUp': 'Up',
  'ArrowDown': 'Down',
  'ArrowLeft': 'Left',
  'ArrowRight': 'Right',
  'Escape': 'Esc',
  'Esc': 'Esc',
  'Enter': 'Enter',
  'Return': 'Enter',
  'Tab': 'Tab',
  'Backspace': 'Backspace',
  'Delete': 'Delete',
  'PageUp': 'PageUp',
  'PageDown': 'PageDown',
  'Home': 'Home',
  'End': 'End',
}

const KEY_REPLACEMENTS: Record<string, string> = {
  '`': 'Backquote',
  '\\': 'Backslash',
  '=': 'Equal',
  '-': 'Minus',
  '[': 'BracketLeft',
  ']': 'BracketRight',
  ';': 'Semicolon',
  '\'': 'Quote',
  ',': 'Comma',
  '.': 'Period',
  '/': 'Slash',
}

function normalizePrimaryKey(event: KeyboardEvent): string | null {
  if (MODIFIER_ONLY_KEYS.has(event.key)) {
    return null
  }

  if (event.code?.startsWith('Numpad')) {
    if (event.code === 'NumpadEnter') {
      return 'Enter'
    }
    return event.code
  }

  if (SPECIAL_KEYS[event.key]) {
    return SPECIAL_KEYS[event.key]
  }

  if (KEY_REPLACEMENTS[event.key]) {
    return KEY_REPLACEMENTS[event.key]
  }

  if (event.key.length === 1) {
    return event.key === ' ' ? 'Space' : event.key.toUpperCase()
  }

  if (/^F\d{1,2}$/i.test(event.key)) {
    return event.key.toUpperCase()
  }

  return event.key.charAt(0).toUpperCase() + event.key.slice(1)
}

function formatAccelerator(event: KeyboardEvent): string | null {
  const key = normalizePrimaryKey(event)
  if (!key) {
    return null
  }

  const modifiers: string[] = []

  if (event.metaKey)
    modifiers.push(metaModifier)
  if (event.ctrlKey)
    modifiers.push('Control')
  if (event.altKey)
    modifiers.push(altModifier)
  if (event.shiftKey)
    modifiers.push('Shift')

  return [...modifiers, key].join('+')
}

function startRecord(e: KeyboardEvent) {
  e.preventDefault()

  const accelerator = formatAccelerator(e)
  if (!accelerator) {
    return
  }

  model.value = accelerator
}
</script>

<template>
  <FlatInput
    v-model="model"
    class="FlatKeyInput-Control"
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
