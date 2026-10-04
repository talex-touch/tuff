<script setup lang="ts">
import { useVModel } from '@vueuse/core'
import { TxInput } from '@talex-touch/tuffex/input'
import { useI18n } from 'vue-i18n'
import RemixIcon from '~/components/icon/RemixIcon.vue'
import { shortconApi } from '~/modules/channel/main/shortcon'
import { useRendererPlatform } from '~/modules/platform/renderer-platform'

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

/**
 * The bindable key name a physical `code` stands for, or `null` when this table does not name it.
 * Same vocabulary as the key-based branches below: letters/digits by their glyph, punctuation by
 * its code name (`Semicolon`, as a bare `;` press is recorded), F-keys and Space by name.
 */
const PHYSICAL_KEY_CODES = new Set([
  'Space',
  'Semicolon',
  'Comma',
  'Period',
  'Slash',
  'Backquote',
  'Minus',
  'Equal',
  'BracketLeft',
  'BracketRight',
  'Backslash',
  'Quote'
])

function primaryKeyFromCode(code: string | undefined): string | null {
  if (!code) return null
  if (code.startsWith('Key') && code.length === 4) return code.slice(3)
  if (code.startsWith('Digit') && code.length === 6) return code.slice(5)
  // Option turns numpad digits into typographic characters (⌥+3 types `³`); Electron binds the
  // physical NumpadN key, which is what the user pressed.
  if (/^Numpad\d$/.test(code)) return code
  if (PHYSICAL_KEY_CODES.has(code)) return code
  if (/^F\d{1,2}$/.test(code)) return code
  return null
}

function normalizePrimaryKey(event: KeyboardEvent, isMac: boolean): string | null {
  if (MODIFIER_ONLY_KEYS.has(event.key)) {
    return null
  }

  // macOS rewrites `key` while Option is held — ⌥E is `'Dead'`, ⌥T is `'ŧ'`, ⌥Space a no-break
  // space — and none of those strings is a key Electron can bind, so the recorder stored an
  // accelerator that displayed as `OPTION+DEAD` and never registered. Under Option the physical
  // code is the only reliable source, and it is what the user means: ⌥E is E on any layout.
  if (isMac && event.altKey) {
    const physical = primaryKeyFromCode(event.code)
    if (physical) {
      return physical
    }
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
  // `isMac` is a computed ref. Read bare it is an object and always truthy, which recorded the
  // Windows key as `Command` everywhere -- a modifier Electron documents as having no effect on
  // Windows and Linux. Off macOS the names are the ones the main process normalises to.
  const mac = isMac.value

  const key = normalizePrimaryKey(event, mac)
  if (!key) {
    return null
  }

  const modifiers: string[] = []
  if (event.metaKey) modifiers.push(mac ? 'Command' : 'Super')
  if (event.ctrlKey) modifiers.push('Control')
  if (event.altKey) modifiers.push(mac ? 'Option' : 'Alt')
  if (event.shiftKey) modifiers.push('Shift')

  return [...modifiers, key].join('+')
}

/**
 * Ends the capture on a field the user is done with.
 *
 * Both elements matter: this listener sits on the wrapper (which carries the tabindex), and the
 * text input inside it is what a click actually focuses. Blurring only the wrapper left the inner
 * input focused, so the field stayed in capture and the global shortcuts the focus released were
 * never re-enabled — every shortcut in the app stayed off until the user clicked elsewhere.
 */
function releaseCapture(event: KeyboardEvent): void {
  const target = event.target
  if (target instanceof HTMLElement) target.blur()
  ;(event.currentTarget as HTMLElement | null)?.blur()
}

function startRecord(e: KeyboardEvent) {
  // Escape and Backspace drop the binding, but only where the host can actually drop it: an empty
  // accelerator is a no-op for the settings list, whose rows would then show a field that looks
  // cleared while the shortcut still fires. The clear affordance is the same opt-in, so the two
  // cannot disagree about whether an empty value means anything.
  if ((e.key === 'Escape' || e.key === 'Backspace') && props.clearable) {
    e.preventDefault()
    if (model.value) clearBinding()
    if (e.key === 'Escape') {
      // Escape ends the capture as it always has, so the surrounding surface gets its cancel key
      // back. Backspace keeps the field focused: it reads as "delete this one", and the next key
      // is usually the replacement.
      releaseCapture(e)
    }
    return
  }

  // Escape is the cancel key everywhere else in the app, so it ends the capture instead of becoming
  // a binding. The event is deliberately not default-prevented: the drawer or dialog hosting this
  // field needs that same Escape to close, which stays broken while the field swallows the key.
  if (e.key === 'Escape') {
    releaseCapture(e)
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
    <TxInput
      v-model="model"
      class="FlatKeyInput-Field"
      :class="{ 'is-clearable': clearable }"
      tabindex="0"
      @keydown="startRecord"
      @focus="() => shortconApi.disableAll()"
      @blur="() => shortconApi.enableAll()"
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
.FlatKeyInput-Field.is-clearable :deep(input) {
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
    /* The button keeps its box while the field is empty, so it must not swallow the click that
       would focus the input underneath it. */
    pointer-events: none;
  }
}

.FlatKeyInput-Field {
  min-width: 220px;
  max-width: 300px;
  height: 36px;
}

.FlatKeyInput-Field :deep(input) {
  text-align: center;
  font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, Consolas, monospace;
  font-size: 13px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}
</style>
