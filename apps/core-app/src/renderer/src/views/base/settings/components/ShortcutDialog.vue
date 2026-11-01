<script setup lang="ts">
import type { DataTableColumn } from '@talex-touch/tuffex/data-table'
import type { ShortcutRow } from './shortcut-dialog.types'

import { TxButton, TxCopyButton } from '@talex-touch/tuffex/button'
import { TxDataTable } from '@talex-touch/tuffex/data-table'
import { TxModal } from '@talex-touch/tuffex/modal'
import { TxSearchInput } from '@talex-touch/tuffex/search-input'
import { TxStatusBadge } from '@talex-touch/tuffex/status-badge'
import { TxSwitch } from '@talex-touch/tuffex/switch'
import { TxTag } from '@talex-touch/tuffex/tag'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import FlatKeyInput from '~/components/base/input/FlatKeyInput.vue'

/**
 * The shortcut manager.
 *
 * A plain `TxModal` rather than the flip overlay it used to be: the flip rotated and scaled a
 * full table in 3D from the 「管理」 button, repainting every row's material on each frame, and
 * dropped frames all the way open. Layout, sticky header, skeleton and empty state are
 * `TxDataTable`'s own; this file only fills the three cells.
 */
const props = defineProps<{
  modelValue: boolean
  search: string
  loading: boolean
  rows: ShortcutRow[]
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'update:search', value: string): void
  (event: 'reset'): void
  (event: 'update-accelerator', id: string, value: string): void
  (event: 'update-enabled', id: string, value: boolean): void
}>()

/** Placeholder rows before the first read lands: about as many as the list usually holds. */
const SKELETON_ROWS = 5

const { t } = useI18n()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

const searchModel = computed({
  get: () => props.search,
  set: (value: string) => emit('update:search', value)
})

const columns = computed<DataTableColumn<ShortcutRow>[]>(() => [
  { key: 'name', title: t('settingTools.shortcutsDialog.columns.name'), minWidth: 200 },
  { key: 'key', title: t('settingTools.shortcutsDialog.columns.key'), width: 300, nowrap: true },
  { key: 'state', title: t('settingTools.shortcutsDialog.columns.enabled'), width: 200 }
])
</script>

<template>
  <TxModal
    v-model="visible"
    :title="t('settingTools.shortcutsDialog.title')"
    :close-label="t('common.close')"
    width="min(860px, calc(100vw - 48px))"
  >
    <TxSearchInput
      v-model="searchModel"
      class="ShortcutDialog-Search"
      clearable
      :placeholder="t('settingTools.shortcutsDialog.searchPlaceholder')"
    />

    <TxDataTable
      class="ShortcutDialog-Table"
      :columns="columns"
      :data="rows"
      row-key="id"
      :loading="loading"
      loading-variant="skeleton"
      :skeleton-rows="SKELETON_ROWS"
      :empty-text="t('settingTools.shortcutsDialog.empty')"
      sticky-header
      max-height="min(56vh, 520px)"
    >
      <template #cell-name="{ row }">
        <div class="ShortcutDialog-Name">
          <span class="ShortcutDialog-Label">{{ row.label }}</span>
          <span class="ShortcutDialog-Id">
            <code class="ShortcutDialog-IdValue" :title="row.id">{{ row.id }}</code>
            <TxCopyButton
              icon-only
              :text="row.id"
              :copy-label="t('common.copy')"
              :copied-label="t('common.copied')"
            />
          </span>
        </div>
      </template>

      <template #cell-key="{ row }">
        <TxTag
          v-if="row.isTrigger"
          :label="row.triggerLabel"
          icon="i-ri-mouse-line"
          variant="plain"
          size="md"
        />
        <FlatKeyInput
          v-else
          :model-value="row.accelerator"
          @update:model-value="(value) => emit('update-accelerator', row.id, String(value))"
        />
      </template>

      <template #cell-state="{ row }">
        <div class="ShortcutDialog-State">
          <TxSwitch
            :model-value="row.isEnabled"
            :aria-label="row.label"
            @update:model-value="(value) => emit('update-enabled', row.id, Boolean(value))"
          />
          <TxStatusBadge
            class="ShortcutDialog-StatusText"
            size="sm"
            :status="row.status.tone"
            :text="row.status.text"
          />
        </div>
        <p v-if="row.hint" class="ShortcutDialog-Hint">{{ row.hint }}</p>
      </template>
    </TxDataTable>

    <template #footer>
      <span class="ShortcutDialog-Count">
        {{ t('settingTools.shortcutsDialog.count', { count: rows.length }) }}
      </span>
      <TxButton variant="flat" @click="emit('reset')">
        {{ t('settingTools.shortcutsDialog.reset') }}
      </TxButton>
      <TxButton variant="flat" type="primary" @click="visible = false">
        {{ t('common.close') }}
      </TxButton>
    </template>
  </TxModal>
</template>

<style scoped>
.ShortcutDialog-Search {
  width: 100%;
}

.ShortcutDialog-Name {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ShortcutDialog-Label {
  font-size: 14px;
  font-weight: var(--tx-font-weight-medium, 500);
  color: var(--tx-text-color-primary);
}

.ShortcutDialog-Id {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  color: var(--tx-text-color-secondary);
}

.ShortcutDialog-IdValue {
  overflow: hidden;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ShortcutDialog-State {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* The recorder sizes itself for a settings row; in a table cell it takes the column instead. */
.ShortcutDialog-Table :deep(.FlatKeyInput),
.ShortcutDialog-Table :deep(.FlatKeyInput-Field) {
  width: 100%;
  min-width: 0;
  max-width: none;
}

.ShortcutDialog-Hint {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--tx-text-color-secondary);
}

.ShortcutDialog-Count {
  margin-right: auto;
  align-self: center;
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}
</style>
