<script setup lang="ts">
import type { ITuffIcon } from '@talex-touch/utils'
import type { MetaActionGlyph } from '~/modules/box/meta-actions/meta-action-model'
import { TxIcon as TuffIcon } from '@talex-touch/tuffex/icon'
import { TxKbd } from '@talex-touch/tuffex/kbd'
import { computed } from 'vue'

/**
 * One row of the ⌘K panel: glyph, label, an optional disambiguating subtitle, and its keys.
 *
 * A listbox option rather than a focusable control: focus stays in the panel's filter field and
 * `aria-activedescendant` points here, the combobox pattern `TxCommandPalette` also follows.
 */

/**
 * Glyph classes, kept in this SFC on purpose. UnoCSS extracts class names from `.vue` sources but
 * not from `.ts` modules, so the same table moved into the action model would render empty boxes
 * (see `uno.config.ts`). `MetaActionItem.test.ts` pins every class to the installed icon set.
 */
const GLYPH_CLASSES: Readonly<Record<MetaActionGlyph, string>> = {
  enter: 'i-ri-corner-down-left-line',
  play: 'i-ri-play-line',
  external: 'i-ri-external-link-line',
  paste: 'i-ri-clipboard-line',
  copy: 'i-ri-file-copy-line',
  'copy-path': 'i-ri-file-copy-2-line',
  'copy-name': 'i-ri-text',
  'copy-link': 'i-ri-link',
  terminal: 'i-ri-terminal-box-line',
  finder: 'i-ri-finder-line',
  'folder-open': 'i-ri-folder-open-line',
  folder: 'i-ri-folder-line',
  pin: 'i-ri-pushpin-line',
  unpin: 'i-ri-unpin-line',
  flow: 'i-ri-share-forward-line',
  translate: 'i-ri-translate-2',
  'translate-pin': 'i-ri-window-line',
  navigate: 'i-ri-arrow-right-up-line',
  preview: 'i-ri-eye-line',
  edit: 'i-ri-edit-line',
  delete: 'i-ri-delete-bin-line',
  share: 'i-ri-share-forward-line',
  plugin: 'i-ri-puzzle-line'
}

const props = defineProps<{
  label: string
  subtitle?: string
  glyph?: MetaActionGlyph
  icon?: ITuffIcon
  shortcuts: readonly string[]
  active: boolean
  disabled?: boolean
  danger?: boolean
}>()

const emit = defineEmits<{
  (e: 'run'): void
  (e: 'hover'): void
}>()

const glyphClass = computed(() => (props.glyph ? GLYPH_CLASSES[props.glyph] : null))

function run(): void {
  if (!props.disabled) emit('run')
}
</script>

<template>
  <button
    type="button"
    role="option"
    tabindex="-1"
    class="MetaActionItem"
    :class="{ 'is-active': active, 'is-disabled': disabled, 'is-danger': danger }"
    :aria-selected="active"
    :aria-disabled="disabled || undefined"
    @click="run"
    @pointermove="emit('hover')"
  >
    <i v-if="glyphClass" class="MetaActionItem-Glyph" :class="glyphClass" aria-hidden="true" />
    <TuffIcon v-else-if="icon" :icon="icon" :size="16" class="MetaActionItem-Icon" />
    <span class="MetaActionItem-Label">{{ label }}</span>
    <span v-if="subtitle" class="MetaActionItem-Subtitle" :title="subtitle">{{ subtitle }}</span>
    <span v-if="shortcuts.length" class="MetaActionItem-Keys">
      <TxKbd v-for="shortcut in shortcuts" :key="shortcut">{{ shortcut }}</TxKbd>
    </span>
  </button>
</template>

<style scoped lang="scss">
.MetaActionItem {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: var(--meta-row-height, 32px);
  padding: 0 8px 0 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--tx-text-color-regular);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;

  &.is-active {
    background: var(--tx-fill-color);
    color: var(--tx-text-color-primary);
  }

  &.is-disabled {
    cursor: default;
    opacity: 0.5;
  }

  &.is-danger {
    color: var(--tx-color-danger);
  }
}

.MetaActionItem-Glyph,
.MetaActionItem-Icon {
  flex: none;
  display: inline-block;
  width: 16px;
  height: 16px;
  font-size: 16px;
  color: var(--tx-text-color-secondary);
}

.MetaActionItem.is-active .MetaActionItem-Glyph {
  color: var(--tx-text-color-primary);
}

.MetaActionItem.is-danger .MetaActionItem-Glyph {
  color: var(--tx-color-danger);
}

.MetaActionItem-Label {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.MetaActionItem-Subtitle {
  flex: 1 1 0;
  min-width: 0;
  overflow: hidden;
  color: var(--tx-text-color-secondary);
  font-size: 12px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.MetaActionItem-Keys {
  display: inline-flex;
  flex: none;
  gap: 4px;
  margin-left: auto;
}
</style>
