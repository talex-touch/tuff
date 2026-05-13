<script setup lang="ts" name="SettingFileIndexAppIndexManager">
import type {
  AppIndexDiagnoseResult,
  AppIndexManagedEntry,
  AppIndexReindexRequest
} from '@talex-touch/utils/transport/events/types'
import { TxButton, TxInput } from '@talex-touch/tuffex'
import { useSettingsSdk } from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import { createRendererLogger } from '~/utils/renderer-log'

const { t } = useI18n()
const settingsSdk = useSettingsSdk()
const transport = useTuffTransport()
const log = createRendererLogger('SettingFileIndexAppIndexManager')

const openFileEvent = defineRawEvent<
  {
    title?: string
    buttonLabel?: string
    filters?: { name: string; extensions: string[] }[]
    properties?: string[]
  },
  { filePaths?: string[] }
>('dialog:open-file')

const entries = ref<AppIndexManagedEntry[]>([])
const pathInput = ref('')
const loading = ref(false)
const adding = ref(false)
const busyPath = ref<string | null>(null)
const diagnosticMap = ref<Record<string, AppIndexDiagnoseResult>>({})

const hasEntries = computed(() => entries.value.length > 0)

function normalizeInput(): string {
  return pathInput.value.trim()
}

function formatOptional(value: string | undefined): string {
  return value?.trim() || '-'
}

function getEntryTitle(entry: AppIndexManagedEntry): string {
  return entry.displayName || entry.name || entry.path
}

function setEntryDiagnostic(path: string, result: AppIndexDiagnoseResult): void {
  diagnosticMap.value = {
    ...diagnosticMap.value,
    [path]: result
  }
}

async function loadEntries(): Promise<void> {
  loading.value = true
  try {
    entries.value = await settingsSdk.appIndex.listEntries()
  } catch (error) {
    log.error('Failed to load managed app index entries', error)
    toast.error(t('settings.settingFileIndex.appIndexManagerLoadFailed'))
  } finally {
    loading.value = false
  }
}

async function diagnosePath(target: string, options: { silent?: boolean } = {}): Promise<void> {
  if (!target.trim()) return

  busyPath.value = target
  try {
    const result = await settingsSdk.appIndex.diagnose({ target, query: target })
    setEntryDiagnostic(target, result)
    if (!options.silent) {
      if (result.success) {
        toast.success(t('settings.settingFileIndex.appIndexManagerDiagnoseSuccess'))
      } else {
        toast.error(result.reason || t('settings.settingFileIndex.appIndexManagerDiagnoseFailed'))
      }
    }
  } catch (error) {
    log.error('Failed to diagnose managed app index entry', error)
    if (!options.silent) toast.error(t('settings.settingFileIndex.appIndexManagerDiagnoseFailed'))
  } finally {
    busyPath.value = null
  }
}

async function reindexPath(target: string, mode: AppIndexReindexRequest['mode']): Promise<void> {
  busyPath.value = target
  try {
    const result = await settingsSdk.appIndex.reindex({ target, mode })
    if (result.success) {
      toast.success(t('settings.settingFileIndex.appIndexManagerReindexSuccess'))
      await diagnosePath(result.path || target, { silent: true })
      await loadEntries()
    } else {
      toast.error(
        result.reason || result.error || t('settings.settingFileIndex.appIndexManagerReindexFailed')
      )
    }
  } catch (error) {
    log.error('Failed to reindex managed app index entry', error)
    toast.error(t('settings.settingFileIndex.appIndexManagerReindexFailed'))
  } finally {
    busyPath.value = null
  }
}

async function addPath(rawPath: string): Promise<void> {
  const target = rawPath.trim()
  if (!target) {
    toast.error(t('settings.settingFileIndex.appIndexManagerPathRequired'))
    return
  }

  adding.value = true
  try {
    const result = await settingsSdk.appIndex.addPath({ path: target })
    if (!result.success || !result.path) {
      toast.error(result.reason || t('settings.settingFileIndex.appIndexManagerAddFailed'))
      return
    }

    pathInput.value = ''
    toast.success(t('settings.settingFileIndex.appIndexManagerAddSuccess'))
    await settingsSdk.appIndex.reindex({ target: result.path, mode: 'keywords' }).catch((error) => {
      log.warn('Managed app entry keyword reindex after add failed', error)
    })
    await loadEntries()
    await diagnosePath(result.path, { silent: true })
  } catch (error) {
    log.error('Failed to add managed app index entry', error)
    toast.error(t('settings.settingFileIndex.appIndexManagerAddFailed'))
  } finally {
    adding.value = false
  }
}

async function selectAppFile(): Promise<void> {
  try {
    const result = await transport.send(openFileEvent, {
      title: t('settings.settingFileIndex.appIndexManagerSelectFile'),
      buttonLabel: t('common.confirm'),
      properties: ['openFile'],
      filters: [
        {
          name: t('settings.settingFileIndex.appIndexManagerAppFileFilter'),
          extensions: ['exe', 'lnk', 'appref-ms']
        }
      ]
    })
    const selected = result.filePaths?.[0]
    if (selected) {
      await addPath(selected)
    }
  } catch (error) {
    log.error('Failed to select app file', error)
    toast.error(t('settings.settingFileIndex.appIndexManagerSelectFailed'))
  }
}

async function setEnabled(entry: AppIndexManagedEntry, enabled: boolean): Promise<void> {
  busyPath.value = entry.path
  try {
    const result = await settingsSdk.appIndex.setEntryEnabled({ path: entry.path, enabled })
    if (!result.success) {
      toast.error(result.reason || t('settings.settingFileIndex.appIndexManagerUpdateFailed'))
      return
    }
    toast.success(
      enabled
        ? t('settings.settingFileIndex.appIndexManagerEnabled')
        : t('settings.settingFileIndex.appIndexManagerDisabled')
    )
    await loadEntries()
    await diagnosePath(entry.path, { silent: true })
  } catch (error) {
    log.error('Failed to update managed app index entry', error)
    toast.error(t('settings.settingFileIndex.appIndexManagerUpdateFailed'))
  } finally {
    busyPath.value = null
  }
}

async function removeEntry(entry: AppIndexManagedEntry): Promise<void> {
  busyPath.value = entry.path
  try {
    const result = await settingsSdk.appIndex.removeEntry({ path: entry.path })
    if (!result.success) {
      toast.error(result.reason || t('settings.settingFileIndex.appIndexManagerRemoveFailed'))
      return
    }
    const nextDiagnostics = { ...diagnosticMap.value }
    delete nextDiagnostics[entry.path]
    diagnosticMap.value = nextDiagnostics
    toast.success(t('settings.settingFileIndex.appIndexManagerRemoved'))
    await loadEntries()
  } catch (error) {
    log.error('Failed to remove managed app index entry', error)
    toast.error(t('settings.settingFileIndex.appIndexManagerRemoveFailed'))
  } finally {
    busyPath.value = null
  }
}

async function copyDiagnostic(entry: AppIndexManagedEntry): Promise<void> {
  const diagnostic = diagnosticMap.value[entry.path]
  if (!diagnostic) {
    toast.error(t('settings.settingFileIndex.appIndexManagerDiagnosticMissing'))
    return
  }

  try {
    await navigator.clipboard.writeText(JSON.stringify(diagnostic, null, 2))
    toast.success(t('settings.settingFileIndex.appIndexManagerDiagnosticCopied'))
  } catch (error) {
    log.error('Failed to copy managed app diagnostic JSON', error)
    toast.error(t('settings.settingFileIndex.appIndexManagerDiagnosticCopyFailed'))
  }
}

onMounted(() => {
  void loadEntries()
})
</script>

<template>
  <TuffBlockSlot
    :title="t('settings.settingFileIndex.appIndexManagerTitle')"
    :description="t('settings.settingFileIndex.appIndexManagerDesc')"
    default-icon="i-carbon-app"
    active-icon="i-carbon-app"
  >
    <div class="app-index-manager">
      <div class="app-index-manager-actions">
        <TxButton variant="flat" size="sm" :disabled="adding" @click="selectAppFile">
          <div class="i-carbon-document-add text-12px" />
          <span>{{ t('settings.settingFileIndex.appIndexManagerSelectFile') }}</span>
        </TxButton>
        <TxButton variant="flat" size="sm" :disabled="loading" @click="loadEntries">
          <div class="i-carbon-renew text-12px" />
          <span>{{ t('common.refresh') }}</span>
        </TxButton>
      </div>

      <div class="app-index-manager-add-row">
        <TxInput
          :model-value="pathInput"
          :placeholder="t('settings.settingFileIndex.appIndexManagerPathPlaceholder')"
          class="app-index-manager-input"
          @update:model-value="pathInput = String($event ?? '')"
          @keyup.enter="addPath(normalizeInput())"
        />
        <TxButton
          variant="flat"
          size="sm"
          :disabled="adding || !normalizeInput()"
          @click="addPath(normalizeInput())"
        >
          <div class="i-carbon-add text-12px" />
          <span>{{ t('settings.settingFileIndex.appIndexManagerAddPath') }}</span>
        </TxButton>
      </div>

      <div v-if="!hasEntries" class="app-index-manager-empty">
        {{ loading ? t('common.loading') : t('settings.settingFileIndex.appIndexManagerEmpty') }}
      </div>

      <div v-else class="app-index-manager-list">
        <div v-for="entry in entries" :key="entry.path" class="app-index-entry">
          <div class="app-index-entry-main">
            <div class="app-index-entry-title-row">
              <strong>{{ getEntryTitle(entry) }}</strong>
              <span
                :class="['app-index-entry-status', entry.enabled ? 'is-enabled' : 'is-disabled']"
              >
                {{
                  entry.enabled
                    ? t('settings.settingFileIndex.appIndexManagerEntryEnabled')
                    : t('settings.settingFileIndex.appIndexManagerEntryDisabled')
                }}
              </span>
            </div>
            <div class="app-index-entry-path">{{ entry.path }}</div>
            <div class="app-index-entry-grid">
              <span>displayName</span><strong>{{ formatOptional(entry.displayName) }}</strong>
              <span>launchKind</span><strong>{{ entry.launchKind }}</strong>
              <span>launchTarget</span><strong>{{ formatOptional(entry.launchTarget) }}</strong>
              <span>launchArgs</span><strong>{{ formatOptional(entry.launchArgs) }}</strong>
              <span>workingDirectory</span
              ><strong>{{ formatOptional(entry.workingDirectory) }}</strong> <span>displayPath</span
              ><strong>{{ formatOptional(entry.displayPath) }}</strong>
            </div>
            <pre v-if="diagnosticMap[entry.path]" class="app-index-entry-diagnostic">{{
              JSON.stringify(diagnosticMap[entry.path], null, 2)
            }}</pre>
          </div>

          <div class="app-index-entry-actions">
            <TxButton
              variant="flat"
              size="sm"
              :disabled="busyPath === entry.path"
              @click="setEnabled(entry, !entry.enabled)"
            >
              {{
                entry.enabled
                  ? t('settings.settingFileIndex.appIndexManagerDisable')
                  : t('settings.settingFileIndex.appIndexManagerEnable')
              }}
            </TxButton>
            <TxButton
              variant="flat"
              size="sm"
              :disabled="busyPath === entry.path"
              @click="reindexPath(entry.path, 'scan')"
            >
              {{ t('settings.settingFileIndex.appIndexManagerRescan') }}
            </TxButton>
            <TxButton
              variant="flat"
              size="sm"
              :disabled="busyPath === entry.path"
              @click="diagnosePath(entry.path)"
            >
              {{ t('settings.settingFileIndex.appIndexManagerDiagnose') }}
            </TxButton>
            <TxButton
              variant="flat"
              size="sm"
              :disabled="!diagnosticMap[entry.path]"
              @click="copyDiagnostic(entry)"
            >
              {{ t('settings.settingFileIndex.appIndexManagerCopyJson') }}
            </TxButton>
            <TxButton
              variant="flat"
              size="sm"
              type="danger"
              :disabled="busyPath === entry.path"
              @click="removeEntry(entry)"
            >
              {{ t('common.remove') }}
            </TxButton>
          </div>
        </div>
      </div>
    </div>
  </TuffBlockSlot>
</template>

<style scoped>
.app-index-manager {
  width: min(760px, 100%);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.app-index-manager-actions,
.app-index-manager-add-row,
.app-index-entry-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.app-index-manager-input {
  min-width: 240px;
  flex: 1;
}

.app-index-manager-empty {
  color: var(--tx-text-color-secondary);
  font-size: 12px;
  text-align: right;
}

.app-index-manager-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: min(52vh, 520px);
  overflow: auto;
  padding-right: 2px;
}

.app-index-entry {
  display: flex;
  gap: 12px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--tx-border-color, #888) 26%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--tx-bg-color, #fff) 86%, transparent);
}

.app-index-entry-main {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.app-index-entry-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.app-index-entry-title-row strong,
.app-index-entry-grid strong,
.app-index-entry-path {
  word-break: break-all;
}

.app-index-entry-status {
  padding: 2px 6px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}

.app-index-entry-status.is-enabled {
  color: #34c759;
  background: rgba(52, 199, 89, 0.12);
}

.app-index-entry-status.is-disabled {
  color: #ff9500;
  background: rgba(255, 149, 0, 0.12);
}

.app-index-entry-path {
  color: var(--tx-text-color-secondary);
  font-size: 12px;
}

.app-index-entry-grid {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 4px 10px;
  font-size: 11px;
}

.app-index-entry-grid span {
  color: var(--tx-text-color-secondary);
}

.app-index-entry-grid strong {
  color: var(--tx-text-color-primary);
  font-weight: 500;
}

.app-index-entry-actions {
  align-content: flex-start;
  max-width: 168px;
}

.app-index-entry-diagnostic {
  margin: 0;
  max-height: 180px;
  overflow: auto;
  padding: 8px;
  border-radius: 8px;
  background: rgba(127, 127, 127, 0.1);
  font-size: 11px;
  white-space: pre-wrap;
  word-break: break-all;
}

@media (max-width: 760px) {
  .app-index-entry {
    flex-direction: column;
  }

  .app-index-entry-actions {
    max-width: none;
    justify-content: flex-start;
  }
}
</style>
