<script setup lang="ts">
import type { UpdateReleaseNotesChannel } from '@talex-touch/utils'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxCollapse, TxCollapseItem } from '@talex-touch/tuffex/collapse'
import { TxModal } from '@talex-touch/tuffex/modal'
import { TxTag } from '@talex-touch/tuffex/tag'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useReleaseNotesRuntime } from '~/modules/hooks/useReleaseNotesRuntime'

const { t, locale } = useI18n()
const { dialogVisible, dialogEntries, closeDialog } = useReleaseNotesRuntime()
const expandedVersions = ref<string[]>([])
const busy = ref(false)

const title = computed(() => t('releaseNotes.title'))
const isChinese = computed(() => locale.value.toLowerCase().startsWith('zh'))

watch(
  [dialogVisible, dialogEntries],
  ([visible, entries]) => {
    if (visible && entries.length > 0) {
      expandedVersions.value = [entries.at(-1)!.version]
    }
  },
  { immediate: true }
)

function summaryFor(entry: {
  summary: { zh: readonly string[]; en: readonly string[] }
}): readonly string[] {
  return isChinese.value ? entry.summary.zh : entry.summary.en
}

function channelLabel(entry: { channel: UpdateReleaseNotesChannel }): string {
  return entry.channel === 'BETA' ? t('releaseNotes.channelBeta') : t('releaseNotes.channelRelease')
}

async function handleClose(): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    await closeDialog()
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <TxModal v-model="dialogVisible" :title="title" width="680px" @close="handleClose">
    <div class="whats-changed-dialog">
      <p class="whats-changed-dialog__intro">
        {{ t('releaseNotes.intro') }}
      </p>

      <TxCollapse v-model="expandedVersions" class="whats-changed-dialog__versions">
        <TxCollapseItem v-for="entry in dialogEntries" :key="entry.version" :name="entry.version">
          <template #title>
            <span class="whats-changed-dialog__version-title">
              <strong>v{{ entry.version }}</strong>
              <TxTag size="sm" :type="entry.channel === 'BETA' ? 'warning' : 'success'">
                {{ channelLabel(entry) }}
              </TxTag>
            </span>
          </template>

          <ul class="whats-changed-dialog__summary">
            <li v-for="item in summaryFor(entry)" :key="item">
              {{ item }}
            </li>
          </ul>
        </TxCollapseItem>
      </TxCollapse>
    </div>

    <template #footer>
      <div class="whats-changed-dialog__actions">
        <TxButton type="primary" :loading="busy" @click="handleClose">
          {{ t('releaseNotes.close') }}
        </TxButton>
      </div>
    </template>
  </TxModal>
</template>

<style scoped>
.whats-changed-dialog {
  min-height: 220px;
}

.whats-changed-dialog__intro {
  margin: 0 0 16px;
  color: var(--tx-text-color-secondary);
  line-height: 1.6;
}

.whats-changed-dialog__versions {
  max-height: min(52vh, 440px);
  overflow-y: auto;
}

.whats-changed-dialog__version-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.whats-changed-dialog__summary {
  margin: 0;
  padding-left: 20px;
  color: var(--tx-text-color-primary);
}

.whats-changed-dialog__summary li {
  margin: 7px 0;
  line-height: 1.55;
}

.whats-changed-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

@media (max-width: 640px) {
  .whats-changed-dialog {
    min-height: 180px;
  }

  .whats-changed-dialog__versions {
    max-height: 48vh;
  }

  .whats-changed-dialog__actions {
    width: 100%;
  }

  .whats-changed-dialog__actions > * {
    flex: 1;
  }
}
</style>
