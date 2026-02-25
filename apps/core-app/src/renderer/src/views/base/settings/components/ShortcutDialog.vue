<script setup lang="ts">
import type { ShortcutRowBase, ShortcutRowView } from './shortcut-dialog.types'

import { TxButton, TxFlipOverlay } from '@talex-touch/tuffex'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TouchScroll from '~/components/base/TouchScroll.vue'
import ShortcutDialogRow from './ShortcutDialogRow.vue'
import { useShortcutCopy } from './useShortcutCopy'

const props = defineProps<{
  modelValue: boolean
  source: HTMLElement | null
  search: string
  loading: boolean
  rows: ShortcutRowBase[]
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'update:search', value: string): void
  (event: 'reset'): void
  (event: 'update-accelerator', id: string, value: string): void
  (event: 'update-enabled', id: string, value: boolean): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

const searchModel = computed({
  get: () => props.search,
  set: (value: string) => emit('update:search', value)
})

const { t } = useI18n()
const { copyShortcutId, getCopyIcon, getCopyState, resetCopyState } = useShortcutCopy({
  success: t('settingTools.shortcutsDialog.copySuccess'),
  failed: t('settingTools.shortcutsDialog.copyFailed')
})

const displayRows = computed<ShortcutRowView[]>(() =>
  props.rows.map((row) => ({
    ...row,
    copyIcon: getCopyIcon(row.shortcut.id),
    copyState: getCopyState(row.shortcut.id)
  }))
)

watch(visible, (value) => {
  if (!value) return
  resetCopyState()
})

const FLIP_DURATION = 420
const FLIP_ROTATE_X = 6
const FLIP_ROTATE_Y = 8
const FLIP_SPEED_BOOST = 1.1
</script>

<template>
  <Teleport to="body">
    <TxFlipOverlay
      v-model="visible"
      :source="source"
      :duration="FLIP_DURATION"
      :rotate-x="FLIP_ROTATE_X"
      :rotate-y="FLIP_ROTATE_Y"
      :speed-boost="FLIP_SPEED_BOOST"
      transition-name="ShortcutDialog-Mask"
      mask-class="ShortcutDialog-Mask"
      card-class="ShortcutDialog-Card"
    >
      <template #default="{ close }">
        <div class="ShortcutDialog">
          <div class="ShortcutDialog-Header">
            <div class="ShortcutDialog-TitleBlock">
              <div class="ShortcutDialog-Title">
                {{ t('settingTools.shortcutsDialog.title') }}
              </div>
              <div class="ShortcutDialog-Subtitle">
                {{ t('settingTools.shortcutsDialog.desc') }}
              </div>
            </div>
            <div class="ShortcutDialog-Search">
              <i class="i-carbon-search" />
              <input
                v-model="searchModel"
                type="text"
                :placeholder="t('settingTools.shortcutsDialog.searchPlaceholder')"
              />
            </div>
          </div>

          <div class="ShortcutDialog-Table">
            <TouchScroll no-padding class="ShortcutDialog-TableScroller" native>
              <template #header>
                <div class="ShortcutDialog-TableHeader">
                  <div>{{ t('settingTools.shortcutsDialog.columns.name') }}</div>
                  <div>{{ t('settingTools.shortcutsDialog.columns.id') }}</div>
                  <div>{{ t('settingTools.shortcutsDialog.columns.key') }}</div>
                  <div>{{ t('settingTools.shortcutsDialog.columns.source') }}</div>
                  <div class="ShortcutDialog-EnabledCell">
                    {{ t('settingTools.shortcutsDialog.columns.enabled') }}
                  </div>
                </div>
              </template>
              <div v-if="loading" class="ShortcutDialog-Empty">
                {{ t('settingTools.shortcutsDialog.loading') }}
              </div>
              <div v-else-if="rows.length === 0" class="ShortcutDialog-Empty">
                {{ t('settingTools.shortcutsDialog.empty') }}
              </div>
              <div v-else class="ShortcutDialog-Rows">
                <ShortcutDialogRow
                  v-for="row in displayRows"
                  :key="row.shortcut.id"
                  :row="row"
                  :status-active-label="t('settingTools.shortcutsDialog.statusActive')"
                  @copy="copyShortcutId"
                  @update-accelerator="(id, value) => emit('update-accelerator', id, value)"
                  @update-enabled="(id, value) => emit('update-enabled', id, value)"
                />
              </div>
            </TouchScroll>
          </div>

          <div class="ShortcutDialog-Footer">
            <div class="ShortcutDialog-Count">
              {{ t('settingTools.shortcutsDialog.count', { count: rows.length }) }}
            </div>
            <div class="ShortcutDialog-FooterActions">
              <TxButton variant="flat" @click="emit('reset')">
                {{ t('settingTools.shortcutsDialog.reset') }}
              </TxButton>
              <TxButton variant="flat" type="primary" @click="close">
                {{ t('settingTools.shortcutsDialog.close') }}
              </TxButton>
            </div>
          </div>
        </div>
      </template>
    </TxFlipOverlay>
  </Teleport>
</template>

<style scoped>
:global(.ShortcutDialog-Mask) {
  position: fixed;
  inset: 0;
  background: rgba(12, 12, 14, 0.42);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  z-index: 1800;
  display: flex;
  align-items: center;
  justify-content: center;
  perspective: 1200px;
}

:global(.ShortcutDialog-Mask-enter-active),
:global(.ShortcutDialog-Mask-leave-active) {
  transition: opacity 200ms ease;
}

:global(.ShortcutDialog-Mask-enter-from),
:global(.ShortcutDialog-Mask-leave-to) {
  opacity: 0;
}

:global(.ShortcutDialog-Card) {
  width: min(980px, 92vw);
  height: min(720px, 86vh);
  border-radius: 24px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.25);
  overflow: hidden;
}

.ShortcutDialog {
  display: flex;
  flex-direction: column;
  height: 100%;
  --shortcut-dialog-columns: minmax(180px, 1.4fr) minmax(140px, 1fr) minmax(180px, 1.1fr)
    minmax(110px, 0.8fr) minmax(140px, 0.9fr);
  --shortcut-dialog-gap: 12px;
}

.ShortcutDialog-Header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 24px;
  border-bottom: 1px solid var(--tx-border-color-lighter);
}

.ShortcutDialog-TitleBlock {
  min-width: 180px;
}

.ShortcutDialog-Title {
  font-size: 16px;
  font-weight: 600;
  color: var(--tx-text-color-primary);
}

.ShortcutDialog-Subtitle {
  margin-top: 2px;
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}

.ShortcutDialog-Search {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--tx-fill-color-lighter);
  border: 1px solid var(--tx-border-color-lighter);
  border-radius: 12px;
  min-width: 220px;
}

.ShortcutDialog-Search input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 13px;
  color: var(--tx-text-color-primary);
}

.ShortcutDialog-Table {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.ShortcutDialog-TableScroller {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.ShortcutDialog-TableHeader {
  display: grid;
  grid-template-columns: var(--shortcut-dialog-columns);
  gap: var(--shortcut-dialog-gap);
  padding: 12px 24px;
  font-size: 12px;
  letter-spacing: 0.08em;
  color: var(--tx-text-color-secondary);
  border-bottom: 1px solid var(--tx-border-color-lighter);
  width: 100%;
  position: sticky;
  top: 0;
  z-index: 4;
  background: var(--tx-bg-color-overlay);
}

.ShortcutDialog-TableScroller :deep(.tx-scroll__native) {
  overflow-y: auto;
  overflow-x: hidden;
}

.ShortcutDialog-TableScroller :deep(.tx-scroll__content) {
  padding: 0;
}

.ShortcutDialog-Empty {
  padding: 40px 24px;
  text-align: center;
  font-size: 13px;
  color: var(--tx-text-color-secondary);
}

.ShortcutDialog-Rows {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.ShortcutDialog-EnabledCell {
  position: sticky;
  right: 0;
  background: var(--tx-bg-color-overlay);
  z-index: 3;
  box-shadow: -12px 0 16px rgba(0, 0, 0, 0.06);
}

.ShortcutDialog-Footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-top: 1px solid var(--tx-border-color-lighter);
}

.ShortcutDialog-FooterActions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ShortcutDialog-Count {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}
</style>
