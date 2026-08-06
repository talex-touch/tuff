<script setup lang="ts" name="SettingFileIndexAppIndexManager">
import type {
  AppIndexDiagnoseResult,
  AppIndexManagedEntry,
  AppIndexReindexRequest
} from '@talex-touch/utils/transport/events/types'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxInput } from '@talex-touch/tuffex/input'
import { TxSkeleton, useDeferredLoading } from '@talex-touch/tuffex/skeleton'
import { useSettingsSdk } from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import SettingChip from '~/components/settings/SettingChip.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { createRendererLogger } from '~/utils/renderer-log'
import {
  type AppIndexEntryDiagnosticFilter,
  type AppIndexEntrySourceFilter,
  filterAppIndexManagedEntries,
  resolveAppIndexManagerSummary,
  resolveAppIndexManagerEmptyState,
  resolveAppIndexEntryDiagnosticSummary,
  resolveAppIndexEntrySource
} from './app-index-manager-display'

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

/** Placeholder entries while the managed index is first read. */
const SKELETON_ENTRIES = 4

/**
 * First read only. `loading` also covers the reloads that follow adding or
 * removing an entry, and those must leave the rendered list in place.
 */
const hasLoaded = ref(false)
const showSkeleton = useDeferredLoading(() => !hasLoaded.value)
const busyPath = ref<string | null>(null)
const diagnosticMap = ref<Record<string, AppIndexDiagnoseResult>>({})
const sourceFilter = ref<AppIndexEntrySourceFilter>('all')
const diagnosticFilter = ref<AppIndexEntryDiagnosticFilter>('all')

const hasEntries = computed(() => entries.value.length > 0)
const managerSummary = computed(() =>
  resolveAppIndexManagerSummary(entries.value, diagnosticMap.value)
)
const visibleEntries = computed(() =>
  filterAppIndexManagedEntries(entries.value, diagnosticMap.value, {
    source: sourceFilter.value,
    diagnostic: diagnosticFilter.value
  })
)
const hasVisibleEntries = computed(() => visibleEntries.value.length > 0)
const emptyState = computed(() =>
  resolveAppIndexManagerEmptyState(
    entries.value,
    diagnosticMap.value,
    {
      source: sourceFilter.value,
      diagnostic: diagnosticFilter.value
    },
    t
  )
)

const sourceFilterOptions = computed<{ value: AppIndexEntrySourceFilter; label: string }[]>(() => [
  { value: 'all', label: t('settings.settingFileIndex.appIndexManagerFilterAll') },
  { value: 'uwp', label: t('settings.settingFileIndex.appIndexManagerSourceUwp') },
  { value: 'steam', label: t('settings.settingFileIndex.appIndexManagerSourceSteam') },
  { value: 'shortcut', label: t('settings.settingFileIndex.appIndexManagerSourceShortcut') },
  { value: 'protocol', label: t('settings.settingFileIndex.appIndexManagerSourceProtocol') },
  { value: 'appref', label: t('settings.settingFileIndex.appIndexManagerSourceAppRef') },
  { value: 'path', label: t('settings.settingFileIndex.appIndexManagerSourcePath') }
])
const diagnosticFilterOptions = computed<{ value: AppIndexEntryDiagnosticFilter; label: string }[]>(
  () => [
    { value: 'all', label: t('settings.settingFileIndex.appIndexManagerFilterAll') },
    { value: 'attention', label: t('settings.settingFileIndex.appIndexManagerFilterAttention') },
    { value: 'found', label: t('settings.settingFileIndex.appIndexManagerDiagnosticFound') },
    { value: 'not-run', label: t('settings.settingFileIndex.appIndexManagerDiagnosticNotRun') },
    { value: 'disabled', label: t('settings.settingFileIndex.appIndexManagerEntryDisabled') }
  ]
)

function normalizeInput(): string {
  return pathInput.value.trim()
}

function formatOptional(value: string | undefined): string {
  return value?.trim() || '-'
}

function getEntryTitle(entry: AppIndexManagedEntry): string {
  return entry.displayName || entry.name || entry.path
}

function getEntrySource(entry: AppIndexManagedEntry) {
  return resolveAppIndexEntrySource(entry, t)
}

function getEntryDiagnosticSummary(entry: AppIndexManagedEntry) {
  return resolveAppIndexEntryDiagnosticSummary(diagnosticMap.value[entry.path], t)
}

function getEntryOriginLabel(entry: AppIndexManagedEntry): string {
  return entry.source === 'scanned'
    ? t('settings.settingFileIndex.appIndexManagerOriginScanned', 'Scanned')
    : t('settings.settingFileIndex.appIndexManagerOriginManual', 'Manual')
}

/**
 * The display helpers speak in four tones; the shell chip has three, and spends colour only on a
 * state the reader can act on. `warning` is that state here, so it takes the one colour the shell
 * keeps for it, and the purely descriptive tones stay neutral.
 */
function chipTone(tone: string): 'neutral' | 'success' | 'danger' {
  if (tone === 'success') return 'success'
  return tone === 'warning' ? 'danger' : 'neutral'
}

function setEntryDiagnostic(path: string, result: AppIndexDiagnoseResult): void {
  diagnosticMap.value = {
    ...diagnosticMap.value,
    [path]: result
  }
}

function clearFilters(): void {
  sourceFilter.value = 'all'
  diagnosticFilter.value = 'all'
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
    hasLoaded.value = true
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
  <section class="app-index-manager">
    <TuffGroupBlock
      class="app-index-manager-block"
      :name="t('settings.settingFileIndex.appIndexManagerTitle')"
      :description="t('settings.settingFileIndex.appIndexManagerDesc')"
    >
      <template #header-extra>
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
      </template>

      <div class="app-index-manager-row app-index-manager-add-row">
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

      <div class="app-index-manager-row app-index-manager-summary">
        <div class="app-index-manager-summary-item">
          <span>{{ t('settings.settingFileIndex.appIndexManagerSummaryTotal') }}</span>
          <strong>{{ managerSummary.total }}</strong>
        </div>
        <div class="app-index-manager-summary-item is-attention">
          <span>{{ t('settings.settingFileIndex.appIndexManagerSummaryAttention') }}</span>
          <strong>{{ managerSummary.attention }}</strong>
        </div>
        <div class="app-index-manager-summary-item is-found">
          <span>{{ t('settings.settingFileIndex.appIndexManagerDiagnosticFound') }}</span>
          <strong>{{ managerSummary.found }}</strong>
        </div>
        <div class="app-index-manager-summary-item">
          <span>{{ t('settings.settingFileIndex.appIndexManagerDiagnosticNotRun') }}</span>
          <strong>{{ managerSummary.notRun }}</strong>
        </div>
        <div class="app-index-manager-summary-item">
          <span>{{ t('settings.settingFileIndex.appIndexManagerEntryDisabled') }}</span>
          <strong>{{ managerSummary.disabled }}</strong>
        </div>
      </div>

      <div class="app-index-manager-row app-index-manager-filters">
        <div class="app-index-manager-filter-group">
          <span>{{ t('settings.settingFileIndex.appIndexManagerFilterSource') }}</span>
          <button
            v-for="option in sourceFilterOptions"
            :key="option.value"
            type="button"
            :class="[
              'app-index-manager-filter-chip',
              { 'is-active': sourceFilter === option.value }
            ]"
            @click="sourceFilter = option.value"
          >
            {{ option.label }}
          </button>
        </div>
        <div class="app-index-manager-filter-group">
          <span>{{ t('settings.settingFileIndex.appIndexManagerFilterDiagnostic') }}</span>
          <button
            v-for="option in diagnosticFilterOptions"
            :key="option.value"
            type="button"
            :class="[
              'app-index-manager-filter-chip',
              { 'is-active': diagnosticFilter === option.value }
            ]"
            @click="diagnosticFilter = option.value"
          >
            {{ option.label }}
          </button>
        </div>
      </div>
    </TuffGroupBlock>

    <!--
      The entries are direct children of the card, which is what draws the hairline between them;
      they used to be free-standing bordered cards inside a scrolling list.
    -->
    <TuffGroupBlock class="app-index-manager-block app-index-manager-entries">
      <!--
        Built from the entry's own classes rather than the centred empty box the loading text used
        to share: an empty box and a stack of entries are very different heights, so the panel
        jumped once the index arrived.
      -->
      <template v-if="showSkeleton">
        <div v-for="i in SKELETON_ENTRIES" :key="i" class="app-index-entry" aria-hidden="true">
          <div class="app-index-entry-main">
            <div class="app-index-entry-title-row">
              <TxSkeleton :width="164" :height="13" :radius="4" />
              <TxSkeleton variant="rect" :width="52" :height="16" :radius="8" />
              <TxSkeleton variant="rect" :width="64" :height="16" :radius="8" />
            </div>
            <TxSkeleton width="76%" :height="11" :radius="4" />
          </div>
        </div>
      </template>

      <div v-else-if="!hasEntries" class="app-index-manager-empty">
        <template v-if="loading">
          <span>{{ t('common.loading') }}</span>
        </template>
        <template v-else-if="emptyState">
          <strong>{{ emptyState.title }}</strong>
          <span>{{ emptyState.detail }}</span>
          <TxButton
            v-if="emptyState.actionKind === 'add-entry'"
            variant="flat"
            size="sm"
            :disabled="adding"
            @click="selectAppFile"
          >
            {{ emptyState.actionLabel }}
          </TxButton>
        </template>
      </div>

      <div v-else-if="!hasVisibleEntries && emptyState" class="app-index-manager-empty">
        <strong>{{ emptyState.title }}</strong>
        <span>{{ emptyState.detail }}</span>
        <TxButton
          v-if="emptyState.actionKind === 'clear-filters'"
          variant="flat"
          size="sm"
          @click="clearFilters"
        >
          {{ emptyState.actionLabel }}
        </TxButton>
      </div>

      <template v-else>
        <div v-for="entry in visibleEntries" :key="entry.path" class="app-index-entry">
          <div class="app-index-entry-main">
            <div class="app-index-entry-title-row">
              <strong>{{ getEntryTitle(entry) }}</strong>
              <SettingChip :tone="entry.enabled ? 'success' : 'neutral'">
                {{
                  entry.enabled
                    ? t('settings.settingFileIndex.appIndexManagerEntryEnabled')
                    : t('settings.settingFileIndex.appIndexManagerEntryDisabled')
                }}
              </SettingChip>
              <SettingChip :tone="chipTone(getEntrySource(entry).tone)">
                {{ getEntrySource(entry).label }}
              </SettingChip>
              <SettingChip>{{ getEntryOriginLabel(entry) }}</SettingChip>
            </div>
            <div class="app-index-entry-path">{{ entry.path }}</div>
            <div class="app-index-entry-diagnostic-summary">
              <SettingChip :tone="chipTone(getEntryDiagnosticSummary(entry).tone)">
                {{ getEntryDiagnosticSummary(entry).label }}
              </SettingChip>
              <span>{{ getEntryDiagnosticSummary(entry).detail }}</span>
            </div>
            <div class="app-index-entry-grid">
              <span>displayName</span><strong>{{ formatOptional(entry.displayName) }}</strong>
              <span>source</span><strong>{{ getEntryOriginLabel(entry) }}</strong>
              <span>bundleId</span><strong>{{ formatOptional(entry.bundleId) }}</strong>
              <span>identityKind</span><strong>{{ formatOptional(entry.identityKind) }}</strong>
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
              v-if="entry.removable !== false"
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
      </template>
    </TuffGroupBlock>
  </section>
</template>

<style scoped>
.app-index-manager {
  width: 100%;
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/*
 * The section spaces the two cards; the block's own bottom margin would add to that gap. Written
 * as a compound with the block's own class so it outranks that margin on specificity rather than
 * on which scoped sheet comes last.
 */
.app-index-manager-block.TGroupBlock-Container {
  margin-bottom: 0;
}

/*
 * The entry list scrolls inside its card rather than growing the dialog, which clips its
 * overflow. Written against the card's own class so this beats `TGroupBlock-Main`'s
 * `overflow: hidden` on specificity, not on which scoped sheet happens to come last.
 */
.app-index-manager-entries {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
}

.app-index-manager-entries.TGroupBlock-Container :deep(.TGroupBlock-Main) {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: auto;
}

/* Row metrics from artboard `iqbKR`'s C2/Row. */
.app-index-manager-row {
  padding: 12px 16px;
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
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 12px 16px;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);
}

.app-index-manager-empty strong {
  color: var(--shell-text-primary);
  font-size: 13.5px;
  font-weight: normal;
}

.app-index-manager-empty span {
  max-width: 460px;
  line-height: 1.5;
}

.app-index-manager-summary {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}

.app-index-manager-summary-item {
  min-width: 0;
}

.app-index-manager-summary-item span {
  display: block;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-caption);
}

.app-index-manager-summary-item strong {
  display: block;
  margin-top: 2px;
  color: var(--shell-text-primary);
  font-size: 18px;
  line-height: 1.1;
}

/*
 * The two counts worth colour: one the reader has to act on, one confirming a clean scan. The
 * shell palette carries no success ramp — `SettingChip` borrows the `--tx-*` one the same way.
 */
.app-index-manager-summary-item.is-attention strong {
  color: var(--shell-danger);
}

.app-index-manager-summary-item.is-found strong {
  color: var(--tx-color-success);
}

.app-index-manager-filters {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.app-index-manager-filter-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.app-index-manager-filter-group > span {
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-caption);
}

.app-index-manager-filter-chip {
  height: 24px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: var(--shell-radius-full);
  color: var(--shell-text-secondary);
  background-color: var(--shell-surface-2);
  font-family: inherit;
  font-size: var(--shell-fs-caption);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.app-index-manager-filter-chip.is-active {
  border-color: var(--shell-primary-border);
  color: var(--shell-primary);
  background-color: var(--shell-primary-soft);
}

.app-index-entry {
  display: flex;
  gap: 12px;
  padding: 12px 16px;
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

.app-index-entry-title-row strong {
  color: var(--shell-text-primary);
  font-size: 13.5px;
  font-weight: normal;
}

.app-index-entry-path {
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);
}

.app-index-entry-diagnostic-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-caption);
}

.app-index-entry-grid {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 4px 10px;
  font-size: var(--shell-fs-caption);
}

.app-index-entry-grid span {
  color: var(--shell-text-secondary);
}

.app-index-entry-grid strong {
  color: var(--shell-text-primary);
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
  border-radius: var(--shell-radius-sm);
  background-color: var(--shell-surface-2);
  font-size: var(--shell-fs-caption);
  white-space: pre-wrap;
  word-break: break-all;
}

@media (max-width: 760px) {
  .app-index-manager-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .app-index-entry {
    flex-direction: column;
  }

  .app-index-entry-actions {
    max-width: none;
    justify-content: flex-start;
  }
}
</style>
