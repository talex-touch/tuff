<script setup lang="ts">
import { useVModel } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import RemixIcon from '~/components/icon/RemixIcon.vue'
import { shortconApi } from '~/modules/channel/main/shortcon'
import { useRendererPlatform } from '~/modules/platform/renderer-platform'
import FlatInput from './FlatInput.vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    /**
     * Opt-in clear affordance. Only hosts that can actually drop a binding should enable it: the
     * settings and plugin rows treat an empty accelerator as a no-op, so a clear button there
     * would silently do nothing.
     */
    clearable?: boolean
  }>(),
  { clearable: false }
)
const emits = defineEmits<{
  (e: 'update:modelValue', val: string): void
}>()

const { t } = useI18n()

const model = useVModel(props, 'modelValue', emits)
const { isMac } = useRendererPlatform()
const metaModifier = isMac ? 'Command' : 'Super'
const altModifier = isMac ? 'Option' : 'Alt'

const MODIFIER_ONLY_KEYS = new Set(['Meta', 'Alt', 'Control', 'Shift'])

const SPECIAL_KEYS: Record<string, string> = {
  ' ': 'Space',
  Spacebar: 'Space',
  Space: 'Space',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Enter: 'Enter',
  Return: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Home: 'Home',
  End: 'End'
}

const KEY_REPLACEMENTS: Record<string, string> = {
  '`': 'Backquote',
  '\\': 'Backslash',
  '=': 'Equal',
  '-': 'Minus',
  '[': 'BracketLeft',
  ']': 'BracketRight',
  ';': 'Semicolon',
  "'": 'Quote',
  ',': 'Comma',
  '.': 'Period',
  '/': 'Slash'
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

  if (event.metaKey) modifiers.push(metaModifier)
  if (event.ctrlKey) modifiers.push('Control')
  if (event.altKey) modifiers.push(altModifier)
  if (event.shiftKey) modifiers.push('Shift')

  return [...modifiers, key].join('+')
}

function startRecord(e: KeyboardEvent) {
  // Escape is the cancel key everywhere else in the app, so it ends the capture instead of becoming
  // a binding. The event is deliberately not default-prevented: the drawer or dialog hosting this
  // field needs that same Escape to close, which stays broken while the field swallows the key.
  if (e.key === 'Escape') {
    ;(e.currentTarget as HTMLElement | null)?.blur()
    return
  }

  e.preventDefault()

  const accelerator = formatAccelerator(e)
  if (!accelerator) {
    return
  }

  model.value = accelerator
}

/** Empty means "no binding"; the host decides whether that unbinds or is refused. */
function clearBinding(): void {
  model.value = ''
}
</script>

<template>
  <div class="FlatKeyInput">
    <FlatInput
      v-model="model"
      class="FlatKeyInput-Control"
      :class="{ 'is-clearable': clearable }"
      tabindex="0"
      @keydown="startRecord"
      @focus="shortconApi.disableAll"
      @blur="shortconApi.enableAll"
    />
    <button
      v-if="clearable"
      type="button"
      class="FlatKeyInput-Clear"
      :disabled="!model"
      :aria-label="t('common.clearShortcut')"
      :title="t('common.clearShortcut')"
      @click="clearBinding"
    >
      <RemixIcon name="close" :style="'line'" />
    </button>
  </div>
</template>

<style scoped>
.FlatKeyInput {
  position: relative;
  display: inline-flex;
  align-items: center;
}

/* Keeps the longest accelerators off the button without moving the field's own box. */
:deep(.FlatKeyInput-Control.is-clearable input) {
  padding-right: 20px;
}

.FlatKeyInput-Clear {
  position: absolute;
  right: 6px;
  /* The input is positioned with z-index 1, so an unstacked button behind it never receives a
     real pointer click - only synthetic events reach it. */
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;

  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 50%;

  background: transparent;
  color: var(--tx-text-color-secondary);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;

  transition:
    color 0.2s,
    background-color 0.2s;

  &:hover:not(:disabled) {
    color: var(--tx-text-color-primary);
    background-color: var(--tx-fill-color);
  }

  &:disabled {
    opacity: 0.35;
    cursor: default;
  }
}

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
