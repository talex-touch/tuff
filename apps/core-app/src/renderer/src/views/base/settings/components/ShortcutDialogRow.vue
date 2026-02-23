<script setup lang="ts">
import type { ShortcutRowView } from './shortcut-dialog.types'

import { TxTooltip } from '@talex-touch/tuffex'
import FlatKeyInput from '~/components/base/input/FlatKeyInput.vue'
import TSwitch from '~/components/base/switch/TSwitch.vue'

const props = defineProps<{
  row: ShortcutRowView
  statusActiveLabel: string
}>()

const emit = defineEmits<{
  (event: 'update-accelerator', id: string, value: string): void
  (event: 'update-enabled', id: string, value: boolean): void
  (event: 'copy', id: string): void
}>()
</script>

<template>
  <div class="ShortcutDialog-Row" :class="row.saveState ? `is-${row.saveState}` : ''">
    <div v-if="row.saveState === 'saving'" class="ShortcutDialog-RowFX" />
    <div class="ShortcutDialog-Name">
      <div class="ShortcutDialog-Label">
        {{ row.label }}
      </div>
      <div class="ShortcutDialog-Desc">
        {{ row.desc }}
      </div>
    </div>
    <div class="ShortcutDialog-Id">
      <TxTooltip :content="row.shortcut.id" :anchor="{ placement: 'top', showArrow: true }">
        <button class="ShortcutDialog-IdCopy" type="button" @click="emit('copy', row.shortcut.id)">
          <span class="ShortcutDialog-IdValue">{{ row.shortcut.id }}</span>
          <i
            :class="[
              'ShortcutDialog-IdIcon',
              row.copyIcon,
              row.copyState ? `is-${row.copyState}` : ''
            ]"
          />
        </button>
      </TxTooltip>
    </div>
    <div class="ShortcutDialog-Key">
      <FlatKeyInput
        v-if="row.inputMode === 'keyboard'"
        :model-value="row.shortcut.accelerator"
        @update:model-value="
          (newValue) => emit('update-accelerator', row.shortcut.id, String(newValue))
        "
      />
      <div v-else class="ShortcutDialog-TriggerText">
        {{ row.triggerLabel }}
      </div>
    </div>
    <div class="ShortcutDialog-Source">
      {{ row.sourceLabel }}
    </div>
    <div class="ShortcutDialog-Enabled ShortcutDialog-EnabledCell">
      <TSwitch
        :model-value="row.isEnabled"
        @update:model-value="(value) => emit('update-enabled', row.shortcut.id, Boolean(value))"
      />
      <div class="ShortcutDialog-EnabledStatus">
        <div
          class="ShortcutDialog-StatusText"
          :class="[
            row.saveState ? `is-${row.saveState}` : '',
            {
              active: !row.saveState && !row.statusText,
              disabled: !row.saveState && !row.isEnabled
            }
          ]"
        >
          <template v-if="row.saveState">
            <span>{{ row.saveText }}</span>
            <TxSpinner v-if="row.saveState === 'saving'"> </TxSpinner>
            <i v-else-if="row.saveState === 'success'" class="i-carbon-checkmark-filled" />
            <i v-else-if="row.saveState === 'error'" class="i-carbon-close" />
          </template>
          <template v-else>
            {{ row.statusText || statusActiveLabel }}
          </template>
        </div>
        <div v-if="!row.saveState && row.spotlightHint" class="ShortcutStatusHint">
          {{ row.spotlightHint }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ShortcutDialog-Row {
  display: grid;
  grid-template-columns: var(--shortcut-dialog-columns);
  gap: var(--shortcut-dialog-gap);
  padding: 16px 24px;
  align-items: center;
  border-bottom: 1px solid var(--tx-border-color-lighter);
  width: 100%;
  position: relative;
  background-color: transparent;
  background-repeat: no-repeat;

  overflow: hidden;
}

.ShortcutDialog-Row:last-child {
  border-bottom: none;
}

.ShortcutDialog-Row > * {
  position: relative;
  z-index: 2;
}

.ShortcutDialog-EnabledCell {
  position: sticky;
  right: 0;
  background: var(--tx-bg-color-overlay);
  z-index: 3;
  box-shadow: -12px 0 16px rgba(0, 0, 0, 0.06);
}

.ShortcutDialog-Row.is-success .ShortcutDialog-EnabledCell,
.ShortcutDialog-Row.is-error .ShortcutDialog-EnabledCell,
.ShortcutDialog-Row.is-saving .ShortcutDialog-EnabledCell {
  background: inherit;
}

.ShortcutDialog-Row.is-saving {
  background-color: transparent;
}

.ShortcutDialog-Row.is-success {
  background-color: rgba(var(--tx-color-success-rgb), 0.08);
}

.ShortcutDialog-Row.is-error {
  background-color: rgba(var(--tx-color-danger-rgb), 0.16);
}

.ShortcutDialog-RowFX {
  position: absolute;
  inset: 0;
  opacity: 0.125;
  filter: blur(30px);
  background-image: linear-gradient(
    to right,
    transparent 0%,
    var(--tx-color-primary) 0.5%,
    var(--tx-color-primary) 4.5%,
    transparent 5%
  );
  background-size: 200% 100%;
  background-position: 0 0;
  background-repeat: no-repeat;
  animation: ShortcutDialogShimmer 2s ease-in infinite;
  pointer-events: none;
  z-index: 1;
}

.ShortcutDialog-Name {
  display: flex;
  flex-direction: column;
}

.ShortcutDialog-Label {
  font-size: 14px;
  font-weight: 600;
  color: var(--tx-text-color-primary);
}

.ShortcutDialog-Desc {
  margin-top: 4px;
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}

.ShortcutDialog-Id {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ShortcutDialog-Source {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ShortcutDialog-IdCopy {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  max-width: 100%;
}

.ShortcutDialog-IdValue {
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ShortcutDialog-IdCopy:hover .ShortcutDialog-IdValue {
  text-decoration: underline;
}

.ShortcutDialog-IdIcon {
  font-size: 14px;
  color: var(--tx-text-color-secondary);
  transition: color 0.2s ease;
}

.ShortcutDialog-IdIcon.is-success {
  color: var(--tx-color-success);
}

.ShortcutDialog-IdIcon.is-error {
  color: var(--tx-color-danger);
}

.ShortcutDialog-Key :deep(.FlatKeyInput-Control) {
  width: 100%;
  min-width: 160px;
}

.ShortcutDialog-TriggerText {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px dashed var(--tx-border-color);
  background: var(--tx-fill-color-lighter);
  color: var(--tx-text-color-secondary);
  font-size: 12px;
  line-height: 1.2;
}

.ShortcutDialog-Enabled {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.ShortcutDialog-EnabledStatus {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ShortcutDialog-StatusText {
  font-size: 12px;
  color: var(--tx-color-danger);
}

.ShortcutDialog-StatusText.active,
.ShortcutDialog-StatusText.disabled {
  color: var(--tx-text-color-secondary);
}

.ShortcutDialog-StatusText.is-saving,
.ShortcutDialog-StatusText.is-success,
.ShortcutDialog-StatusText.is-error {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.ShortcutDialog-StatusText.is-saving {
  color: var(--tx-text-color-secondary);
}

.ShortcutDialog-StatusText.is-success {
  color: var(--tx-color-success);
}

.ShortcutDialog-StatusText.is-error {
  color: var(--tx-color-danger);
}

.ShortcutDialog-StatusText i {
  font-size: 14px;
}

.ShortcutStatusHint {
  margin-top: 2px;
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}

@keyframes ShortcutDialogShimmer {
  0% {
    background-position: 100% 0;
  }
  10% {
    background-position: 100% 0;
  }
  90% {
    background-position: -100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}
</style>
