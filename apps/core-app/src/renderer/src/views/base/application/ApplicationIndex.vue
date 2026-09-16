<script name="ApplicationIndex" setup lang="ts">
import type { ITuffIcon } from '@talex-touch/utils'
import type {
  AppIndexDiagnoseResult,
  AppIndexEntrySummary,
  AppIndexManagedEntry,
  AppIndexUsageResult
} from '@talex-touch/utils/transport/events/types'
import { TxButton } from '@talex-touch/tuffex/button'
import { toTfileUrl } from '@talex-touch/utils/network'
import { useSettingsSdk } from '@talex-touch/utils/renderer'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import SettingsPage from '~/components/settings/SettingsPage.vue'
import AppDetail from './AppDetail.vue'
import AppIndexLaunchZoneDrawer from './AppIndexLaunchZoneDrawer.vue'
import AppList from './AppList.vue'
import type { AppListItem } from './AppList.vue'
import { createRendererLogger } from '~/utils/renderer-log'

/**
 * Every indexed application, not the search engine's top hits.
 *
 * This page used to read `CoreBoxEvents.search.session` — the same stream CoreBox types into —
 * so an empty query returned that surface's handful of recommendations and the list showed five
 * entries against an index of a hundred and fifty. The managed-entry list is the index itself,
 * which is also what the launch-zone controls in the footer drawer mutate.
 */
const { t } = useI18n()
const settingsSdk = useSettingsSdk()
const log = createRendererLogger('ApplicationIndex')

const entries = ref<AppIndexManagedEntry[]>([])
/**
 * Usage totals and configured-state per entry, keyed by path.
 *
 * The list's view picker orders and narrows by these, and neither is reachable per row without a
 * round trip per application — hence one list-level read rather than a call from every row.
 */
const summaries = ref<Record<string, AppIndexEntrySummary>>({})
/**
 * Whether the last summaries read failed. Kept beside the map rather than inside it: the list has
 * to say the totals are missing instead of drawing the zeros an empty map would imply.
 */
const summariesDegraded = ref(false)
const loading = ref(true)
const loadFailed = ref(false)
const searchQuery = ref('')
const selectedPath = ref<string | null>(null)
const launchZoneOpen = ref(false)

/**
 * Diagnostics are the expensive half of an entry, so they are fetched for the selected entry
 * alone — and only once per path, since nothing but an explicit re-run changes the answer.
 */
const diagnostics = ref<Record<string, AppIndexDiagnoseResult>>({})
const diagnosingPath = ref<string | null>(null)
const busyPath = ref<string | null>(null)

/**
 * Usage is cheap (two indexed aggregate reads plus a bounded log fold) and changes every time the
 * app is launched, so unlike diagnostics it is fetched on selection and refreshed after a launch
 * rather than cached behind an explicit action.
 */
const usage = ref<AppIndexUsageResult | null>(null)
const usageLoading = ref(false)

/**
 * User-authored aliases for the selected entry. Read alongside usage on selection; the map they
 * live in is folded into every reindex, so an alias saved here survives a rescan.
 */
const aliases = ref<string[]>([])
const shortcut = ref<string | null>(null)

/**
 * Outbound transitions name their destination by catalog item id. The entries list already holds
 * every indexed app, so the lookup is local — matching on the same identity precedence the main
 * process resolves an item id with.
 */
function resolveItemName(itemId: string): string | undefined {
  const match = entries.value.find((entry) => entry.bundleId === itemId || entry.path === itemId)
  return match?.displayName || match?.name
}

const filteredEntries = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return entries.value
  return entries.value.filter((entry) =>
    [entry.displayName, entry.name, entry.path, entry.bundleId].some((value) =>
      value?.toLowerCase().includes(query)
    )
  )
})

const listItems = computed<AppListItem[]>(() =>
  filteredEntries.value.map((entry) => {
    const summary = summaries.value[entry.path]
    return {
      id: entry.path,
      name: entry.displayName || entry.name || entry.path,
      icon: toEntryIcon(entry),
      disabled: !entry.enabled,
      executeCount: summary?.executeCount ?? 0,
      hasShortcut: summary?.hasShortcut ?? false,
      hasAliases: summary?.hasAliases ?? false
    }
  })
)

const selectedEntry = computed(
  () => entries.value.find((entry) => entry.path === selectedPath.value) ?? null
)

const selectedDiagnostic = computed(() =>
  selectedPath.value ? (diagnostics.value[selectedPath.value] ?? null) : null
)

/**
 * Icon paths arrive from the index as bare filesystem paths into the app-icon cache. The renderer
 * cannot read those directly — `TxIcon` resolves a `url` icon through the `tfile://` protocol, and
 * a raw `/Users/...` value fails its check and renders `tuff-icon__empty` at 0x0. This is the same
 * normalization `search-processing-service` applies before handing app icons to CoreBox.
 */
function toEntryIcon(entry: AppIndexManagedEntry): ITuffIcon | undefined {
  const value = entry.icon?.trim()
  if (!value) return undefined
  return { type: 'url', value: toTfileUrl(value), colorful: true }
}

async function loadSummaries(): Promise<void> {
  const result = await settingsSdk.appIndex.listSummaries()
  // A failed usage read reports itself instead of arriving as zero launches per row. The entries
  // are a separate read, so the list itself still stands — what is missing is the ordering facts.
  summariesDegraded.value = !result.success
  summaries.value = Object.fromEntries(
    (result.summaries ?? []).map((summary) => [summary.path, summary])
  )
}

/**
 * Re-reads the summaries after a change that moves an entry between views — binding or clearing a
 * shortcut, saving a keyword, or a launch that shifts the frequency order. The change itself has
 * already succeeded, so a failed refresh is logged rather than reported as its failure.
 */
function refreshSummaries(): void {
  void loadSummaries().catch((error) => log.error('Failed to refresh app entry summaries', error))
}

async function loadEntries(): Promise<void> {
  loading.value = true
  loadFailed.value = false
  try {
    // Both halves describe one list: entries decide what is shown, summaries decide how it is
    // ordered and narrowed. Half of it would leave the view picker offering what it cannot honour.
    const [entryList] = await Promise.all([settingsSdk.appIndex.listEntries(), loadSummaries()])
    entries.value = entryList
  } catch (error) {
    loadFailed.value = true
    log.error('Failed to load app index entries', error)
    toast.error(t('settings.settingFileIndex.appIndexManagerLoadFailed'))
  } finally {
    loading.value = false
  }
}

/**
 * Selection only changes which entry the detail pane describes. Diagnostics are a probe per
 * entry and now live behind the Diagnose drawer, so they are asked for when that opens rather
 * than on every arrow-key move down the list.
 */
function handleSelect(id: string | null): void {
  selectedPath.value = id
  usage.value = null
  aliases.value = []
  shortcut.value = null
  if (!id) return
  void loadUsage(id)
  void loadAliases(id)
  void loadShortcut(id)
}

async function loadShortcut(path: string): Promise<void> {
  try {
    const result = await settingsSdk.appIndex.getShortcut({ path })
    if (selectedPath.value !== path) return
    shortcut.value = result.success ? (result.accelerator ?? null) : null
  } catch (error) {
    log.error('Failed to load app shortcut', error)
    if (selectedPath.value === path) shortcut.value = null
  }
}

async function handleUpdateShortcut(
  entry: AppIndexManagedEntry,
  accelerator: string
): Promise<void> {
  busyPath.value = entry.path
  try {
    const result = await settingsSdk.appIndex.setShortcut({ path: entry.path, accelerator })
    if (!result.success) {
      // The accelerator was refused by the OS, so the previous binding still stands: re-read
      // rather than showing the key the user just pressed as if it had taken.
      toast.error(
        result.reason === 'shortcut-conflict'
          ? t('appDetail.shortcutConflict')
          : t('settings.settingFileIndex.appIndexManagerUpdateFailed')
      )
      await loadShortcut(entry.path)
      return
    }
    if (selectedPath.value === entry.path) shortcut.value = accelerator.trim() || null
    // A new or cleared binding decides whether this app belongs to the shortcut view at all.
    refreshSummaries()
  } catch (error) {
    log.error('Failed to update app shortcut', error)
    toast.error(t('settings.settingFileIndex.appIndexManagerUpdateFailed'))
  } finally {
    if (busyPath.value === entry.path) busyPath.value = null
  }
}

async function loadAliases(path: string): Promise<void> {
  try {
    const result = await settingsSdk.appIndex.getAliases({ path })
    if (selectedPath.value !== path) return
    aliases.value = result.success ? (result.aliases ?? []) : []
  } catch (error) {
    log.error('Failed to load app aliases', error)
    if (selectedPath.value === path) aliases.value = []
  }
}

async function handleUpdateAliases(
  entry: AppIndexManagedEntry,
  nextAliases: string[]
): Promise<void> {
  busyPath.value = entry.path
  try {
    const result = await settingsSdk.appIndex.setAliases({
      path: entry.path,
      aliases: nextAliases
    })
    if (!result.success) {
      toast.error(result.reason || t('settings.settingFileIndex.appIndexManagerUpdateFailed'))
      return
    }
    if (selectedPath.value === entry.path) aliases.value = nextAliases
    toast.success(t('appDetail.aliasSaved'))
    // Saved keywords decide whether this app belongs to the keyword view at all.
    refreshSummaries()
    // The alias changed what this entry matches, so a cached verdict is now stale.
    if (diagnostics.value[entry.path]) await runDiagnostic(entry.path, { silent: true })
  } catch (error) {
    log.error('Failed to update app aliases', error)
    toast.error(t('settings.settingFileIndex.appIndexManagerUpdateFailed'))
  } finally {
    if (busyPath.value === entry.path) busyPath.value = null
  }
}

async function loadUsage(path: string): Promise<void> {
  usageLoading.value = true
  try {
    const result = await settingsSdk.appIndex.usage({ path })
    // A late response for an entry the user already moved away from must not overwrite the
    // current one: selection changes faster than a round trip.
    if (selectedPath.value !== path) return
    usage.value = result.success ? result : null
  } catch (error) {
    log.error('Failed to load app usage', error)
    if (selectedPath.value === path) usage.value = null
  } finally {
    if (selectedPath.value === path) usageLoading.value = false
  }
}

/**
 * Opening the Diagnose drawer asks for the probe. Nothing but an explicit rescan changes the
 * answer, so a second open shows the stored verdict instead of running it again — and the
 * result lands in the drawer, which is why it does not toast.
 */
async function handleDiagnose(entry: AppIndexManagedEntry): Promise<void> {
  if (diagnostics.value[entry.path]) return
  await runDiagnostic(entry.path, { silent: true })
}

async function runDiagnostic(target: string, options: { silent?: boolean } = {}): Promise<void> {
  diagnosingPath.value = target
  try {
    const result = await settingsSdk.appIndex.diagnose({ target, query: target })
    diagnostics.value = { ...diagnostics.value, [target]: result }
    if (options.silent) return
    if (result.success) {
      toast.success(t('settings.settingFileIndex.appIndexManagerDiagnoseSuccess'))
    } else {
      toast.error(result.reason || t('settings.settingFileIndex.appIndexManagerDiagnoseFailed'))
    }
  } catch (error) {
    log.error('Failed to diagnose app index entry', error)
    if (!options.silent) toast.error(t('settings.settingFileIndex.appIndexManagerDiagnoseFailed'))
  } finally {
    if (diagnosingPath.value === target) diagnosingPath.value = null
  }
}

/**
 * Launches through the app-index channel rather than the generic `openApp` shell handler.
 *
 * The shell handler has no idea which catalog row it is opening, so launches from this page were
 * recorded nowhere: the same application counted differently depending on whether the user
 * reached it from CoreBox or from here. The channel resolves the item id and attributes the
 * launch to this surface.
 */
async function handleLaunch(entry: AppIndexManagedEntry): Promise<void> {
  try {
    const result = await settingsSdk.appIndex.launch({
      path: entry.path,
      entryPoint: 'settings-app-detail'
    })
    if (!result.success) {
      toast.error(result.error || t('settings.settingFileIndex.appIndexManagerLaunchFailed'))
      return
    }
    // The launch just moved the counters this panel shows.
    if (selectedPath.value === entry.path) await loadUsage(entry.path)
    // It also moved this app in the frequency order.
    refreshSummaries()
  } catch (error) {
    log.error('Failed to launch application', error)
    toast.error(t('settings.settingFileIndex.appIndexManagerLaunchFailed'))
  }
}

async function handleSetEnabled(entry: AppIndexManagedEntry, enabled: boolean): Promise<void> {
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
    if (diagnostics.value[entry.path]) await runDiagnostic(entry.path, { silent: true })
  } catch (error) {
    log.error('Failed to update app index entry', error)
    toast.error(t('settings.settingFileIndex.appIndexManagerUpdateFailed'))
  } finally {
    busyPath.value = null
  }
}

async function handleRescan(entry: AppIndexManagedEntry): Promise<void> {
  busyPath.value = entry.path
  try {
    const result = await settingsSdk.appIndex.reindex({ target: entry.path, mode: 'scan' })
    if (!result.success) {
      toast.error(
        result.reason || result.error || t('settings.settingFileIndex.appIndexManagerReindexFailed')
      )
      return
    }
    toast.success(t('settings.settingFileIndex.appIndexManagerReindexSuccess'))
    await loadEntries()
    await runDiagnostic(result.path || entry.path, { silent: true })
  } catch (error) {
    log.error('Failed to reindex app index entry', error)
    toast.error(t('settings.settingFileIndex.appIndexManagerReindexFailed'))
  } finally {
    busyPath.value = null
  }
}

async function handleRemove(entry: AppIndexManagedEntry): Promise<void> {
  busyPath.value = entry.path
  try {
    const result = await settingsSdk.appIndex.removeEntry({ path: entry.path })
    if (!result.success) {
      toast.error(result.reason || t('settings.settingFileIndex.appIndexManagerRemoveFailed'))
      return
    }
    const next = { ...diagnostics.value }
    delete next[entry.path]
    diagnostics.value = next
    if (selectedPath.value === entry.path) selectedPath.value = null
    toast.success(t('settings.settingFileIndex.appIndexManagerRemoved'))
    await loadEntries()
  } catch (error) {
    log.error('Failed to remove app index entry', error)
    toast.error(t('settings.settingFileIndex.appIndexManagerRemoveFailed'))
  } finally {
    busyPath.value = null
  }
}

async function handleCopyDiagnostic(entry: AppIndexManagedEntry): Promise<void> {
  const diagnostic = diagnostics.value[entry.path]
  if (!diagnostic) {
    toast.error(t('settings.settingFileIndex.appIndexManagerDiagnosticMissing'))
    return
  }
  try {
    await navigator.clipboard.writeText(JSON.stringify(diagnostic, null, 2))
    toast.success(t('settings.settingFileIndex.appIndexManagerDiagnosticCopied'))
  } catch (error) {
    log.error('Failed to copy app diagnostic JSON', error)
    toast.error(t('settings.settingFileIndex.appIndexManagerDiagnosticCopyFailed'))
  }
}

onMounted(() => {
  void loadEntries()
})
</script>

<template>
  <SettingsPage
    v-model:search="searchQuery"
    layout="split"
    :aria-label="t('settingsNav.category.applications')"
    search-id="application-search"
    :search-placeholder="t('appList.searchPlaceholder')"
    :clear-label="t('appList.searchClear')"
  >
    <template #aside>
      <AppList
        :items="listItems"
        :selected-id="selectedPath"
        :loading="loading"
        :load-failed="loadFailed"
        :usage-degraded="summariesDegraded"
        :searched="searchQuery.trim().length > 0"
        @select="handleSelect"
        @retry="loadEntries"
      />
    </template>

    <!--
      The launch zone manages which entries exist; it is not one of them. It sits in the aside's
      footer, under the list it governs, and opens over the page rather than taking the detail
      pane — which belongs to whichever application is selected.
    -->
    <template #aside-footer>
      <TxButton variant="flat" class="w-full" native-type="button" @click="launchZoneOpen = true">
        <i class="i-carbon-settings-adjust" aria-hidden="true" />
        <span>{{ t('settings.settingFileIndex.appIndexManagerOpen') }}</span>
      </TxButton>
    </template>

    <template #detail>
      <AppDetail
        :entry="selectedEntry"
        :aliases="aliases"
        :diagnostic="selectedDiagnostic"
        :usage="usage"
        :shortcut="shortcut"
        :resolve-item-name="resolveItemName"
        :usage-loading="usageLoading"
        :diagnosing="diagnosingPath === selectedPath"
        :busy="busyPath === selectedPath"
        @update-aliases="handleUpdateAliases"
        @launch="handleLaunch"
        @diagnose="handleDiagnose"
        @rescan="handleRescan"
        @set-enabled="handleSetEnabled"
        @update-shortcut="handleUpdateShortcut"
        @remove="handleRemove"
        @copy-diagnostic="handleCopyDiagnostic"
      />
    </template>

    <template #overlay>
      <AppIndexLaunchZoneDrawer v-model:visible="launchZoneOpen" @changed="loadEntries" />
    </template>
  </SettingsPage>
</template>
