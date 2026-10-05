<!--
  SettingSkills

  The skills page: every skill on this machine, one row per real file, and Tuff's own built-in skills.

  General skills are read where they are: the agents' own skill directories (Claude Code, Codex, Pi,
  …), the libraries they link into them (cc-switch, ~/.agents), directories the user added, and
  copies imported into Tuff earlier. Main merges them by real path, so a file several agents link to
  is one row naming all of them, and two files that only share a name are two rows. Each row carries
  Tuff's own switch, which takes effect at once and changes Tuff alone.

  Built-in skills are Tuff's channel, model and prompt routing. Their drawer edits a draft: nothing is
  written until 保存, the test waits for a save, and closing over unsaved changes asks first.

  Read-only toward the agents: no scan, merge, filter or switch here writes to an agent's directory or
  to a CLI's configuration.
-->
<script lang="ts" name="SettingSkills" setup>
import type { DialogButton } from '@talex-touch/tuffex/dialog'
import type { IntelligenceCapabilityConfig } from '@talex-touch/tuff-intelligence'
import type {
  SkillInventoryRow,
  SkillInventorySnapshot,
  SkillStorageKind
} from '@talex-touch/utils/transport/sdk/domains/skill-local'
import type { AiAgentId } from '@talex-touch/utils/types/ai-orchestrator'
import type {
  CapabilityBinding,
  CapabilityTestResult
} from '~/components/intelligence/capabilities/types'
import type { AgentRef } from '~/components/settings/resources/agent-registry'
import type { ResourceRowTag } from '~/components/settings/resources/types'
import type { BuiltinSkillDraft, BuiltinStoreWrite } from './setting-skills-display'
import { TxBottomDialog } from '@talex-touch/tuffex/dialog'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxDrawer } from '@talex-touch/tuffex/drawer'
import { TxEmptyState } from '@talex-touch/tuffex/empty-state'
import { TxSearchInput } from '@talex-touch/tuffex/search-input'
import { TxSkeleton, useDeferredLoading } from '@talex-touch/tuffex/skeleton'
import { TxSwitch } from '@talex-touch/tuffex/switch'
import { isOnDeviceAsrProvider } from '@talex-touch/utils/intelligence/voice-asr'
import { useIntelligenceSdk } from '@talex-touch/utils/renderer'
import { intelligenceSettings } from '@talex-touch/utils/renderer/storage'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { createSkillLocalSdk } from '@talex-touch/utils/transport/sdk/domains/skill-local'
import {
  computed,
  nextTick,
  onActivated,
  onDeactivated,
  onMounted,
  reactive,
  ref,
  shallowRef,
  useId,
  watch
} from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import IntelligenceCapabilityInfo from '~/components/intelligence/capabilities/IntelligenceCapabilityInfo.vue'
import InsightsHeader from '~/components/settings/insights/InsightsHeader.vue'
import InsightsNotice from '~/components/settings/insights/InsightsNotice.vue'
import { agentBrand, agentCountsFrom } from '~/components/settings/resources/agent-registry'
import ResourceAgentBar from '~/components/settings/resources/ResourceAgentBar.vue'
import ResourceRow from '~/components/settings/resources/ResourceRow.vue'
import { useIntelligenceManager } from '~/modules/hooks/useIntelligenceManager'
import { createRendererLogger } from '~/utils/renderer-log'
import { errorMessage } from './setting-ai-import-shared'
import {
  builtinDraftDirty,
  builtinRevertWrite,
  builtinSaveErrorText,
  builtinSaveWrite,
  builtinSkillChannelSummary,
  draftPrompt,
  draftReorder,
  draftSetModels,
  enabledSkillCount,
  filterBuiltinSkills,
  filterSkillRows,
  mergeBuiltinDraft,
  normalizeBuiltinDraft,
  sharedNames,
  skillAgentIds,
  sortBuiltinSkills,
  STORAGE_LABEL_KEYS,
  storageHint
} from './setting-skills-display'
import SettingSkillDetail from './SettingSkillDetail.vue'
import SettingSkillDirs from './SettingSkillDirs.vue'

const props = defineProps<{
  /** The page heading; this section owns the page's title row. */
  title: string
}>()

type DrawerView = { mode: 'local'; id: string } | { mode: 'builtin'; id: string }
type CloseChoice = 'save' | 'discard' | 'cancel'

interface CloseRequest {
  name: string
  settled: boolean
  resolve: (choice: CloseChoice) => void
}

/** Rows the skeleton draws per group. The real counts are unknown until the reads land. */
const SKELETON_LOCAL_ROWS = 4
const SKELETON_BUILTIN_ROWS = 3

const openFileEvent = defineRawEvent<
  { title?: string; buttonLabel?: string; properties?: string[] },
  { filePaths?: string[] }
>('dialog:open-file')

const { t } = useI18n()
const aiClient = useIntelligenceSdk()
const transport = useTuffTransport()
const skillSdk = createSkillLocalSdk(transport)
const log = createRendererLogger('SettingSkills')
const { providers, capabilities, updateCapability, setCapabilityProviders, saveSettings } =
  useIntelligenceManager()

const localHeadingId = useId()
const builtinHeadingId = useId()

/* ─── state ─── */

const inventory = shallowRef<SkillInventorySnapshot | null>(null)
const loading = ref(false)
const loadFailed = ref(false)
/** Set once the first read settles either way; only the first read draws the skeleton. */
const hasLoaded = ref(false)
/** The built-in skills come from the settings store, which fills in from main on its own. */
const builtinReady = ref(intelligenceSettings.isHydrated())
const showSkeleton = useDeferredLoading(() => !hasLoaded.value || !builtinReady.value)

const query = ref('')
const agentFilter = ref<AiAgentId | null>(null)

/** Rows whose switch has a request in flight; a second flip waits for the first. */
const pending = reactive(new Set<string>())
/** The last switch failure per row, in the page's words, shown in the drawer until the next try. */
const failures = reactive(new Map<string, string>())

const drawerVisible = ref(false)
const drawerView = shallowRef<DrawerView | null>(null)
const dirsVisible = ref(false)
const dirsBusy = ref(false)

/** The open built-in skill's unsaved edits, laid over what the store holds. */
const draft = shallowRef<BuiltinSkillDraft>({})
const saving = ref(false)
const saveError = ref('')
const infoRef = ref<InstanceType<typeof IntelligenceCapabilityInfo> | null>(null)
const testing = reactive<Record<string, boolean>>({})
const testResults = reactive<Record<string, CapabilityTestResult | null>>({})

const closeRequest = shallowRef<CloseRequest | null>(null)
/** False while the page sits in the background, where an Escape is not meant for its drawer. */
let pageActive = true

/* ─── general skills ─── */

const rows = computed(() => inventory.value?.rows ?? [])
const agentCounts = computed(() => agentCountsFrom(inventory.value?.agents ?? [], 'skill'))
const agentRefs = computed<AgentRef[]>(() =>
  agentCounts.value.map(({ agentId, label }) => ({ agentId, label }))
)

function agentLabel(agentId: AiAgentId): string {
  return (
    agentCounts.value.find((agent) => agent.agentId === agentId)?.label ?? agentBrand(agentId).label
  )
}

function storageLabel(kind: SkillStorageKind): string {
  return t(STORAGE_LABEL_KEYS[kind])
}

const visibleRows = computed(() =>
  filterSkillRows(rows.value, {
    query: query.value,
    agentId: agentFilter.value,
    agentLabel,
    storageLabel
  })
)
const enabledCount = computed(() => enabledSkillCount(rows.value))
const filtering = computed(() => query.value.trim() !== '' || agentFilter.value !== null)
/** Names on more than one row, counted over every row: a filter does not make a name unique. */
const namesShared = computed(() => sharedNames(rows.value))

function rowById(id: string): SkillInventoryRow | undefined {
  return rows.value.find((row) => row.id === id)
}

function rowTags(row: SkillInventoryRow): ResourceRowTag[] {
  const hint = storageHint(
    row,
    namesShared.value.has(row.name),
    t('settings.skillsPage.detailInTuff')
  )
  const tags: ResourceRowTag[] = [
    {
      key: 'storage',
      label: storageLabel(row.storage),
      tone: row.storage === 'tuff-import' ? 'info' : 'neutral',
      ...(hint ? { hint } : {})
    }
  ]
  if (row.unavailableReason === 'source-missing')
    tags.push({
      key: 'unavailable',
      label: t('settings.skillsPage.tagSourceMissing'),
      tone: 'warning'
    })
  else if (row.unavailableReason === 'invalid')
    tags.push({ key: 'unavailable', label: t('settings.skillsPage.tagInvalid'), tone: 'warning' })
  return tags
}

/* ─── built-in skills ─── */

/**
 * The channels a built-in skill's editor offers. The program-owned on-device dictation channel is
 * seeded and bound by main and has nothing to configure, so it is left out of the editor's copy — and
 * only of that: the stored bindings keep it, and every write carries it through.
 */
const visibleProviders = computed(() =>
  providers.value.filter((provider) => !isOnDeviceAsrProvider(provider))
)
const visibleProviderMap = computed(
  () => new Map(visibleProviders.value.map((provider) => [provider.id, provider]))
)
const channelNames = computed(
  () => new Map(providers.value.map((provider) => [provider.id, provider.name || provider.id]))
)

const builtinList = computed(() => sortBuiltinSkills(Object.values(capabilities.value ?? {})))
/** Built-in skills belong to no agent, so an agent filter leaves none of them. */
const visibleBuiltins = computed(() =>
  agentFilter.value ? [] : filterBuiltinSkills(builtinList.value, query.value)
)

function builtinDescription(capability: IntelligenceCapabilityConfig): string {
  const summary = builtinSkillChannelSummary(
    capability,
    (providerId) => channelNames.value.get(providerId) ?? providerId
  )
  if (!summary) return t('settings.skillsPage.builtinNoChannel')
  const head = t('settings.skillsPage.builtinChannelModel', {
    channel: summary.channel,
    model: summary.model ?? t('settings.intelligence.defaultModel')
  })
  return summary.more > 0
    ? t('settings.skillsPage.builtinMore', { summary: head, count: summary.more })
    : head
}

/* ─── reading ─── */

/**
 * One read is one scan of every skill directory plus Tuff's imported copies. A failed read leaves the
 * rows already on screen in place and says so above them; only the very first read has nothing to
 * keep.
 */
async function loadInventory(): Promise<void> {
  loading.value = true
  try {
    inventory.value = await skillSdk.inventory()
    loadFailed.value = false
  } catch (error) {
    log.error('Failed to read the skill inventory', error)
    loadFailed.value = true
  } finally {
    loading.value = false
    hasLoaded.value = true
  }
}

/* ─── the switch ─── */

function patchRow(id: string, patch: Partial<SkillInventoryRow>): void {
  const current = inventory.value
  if (!current) return
  inventory.value = {
    ...current,
    rows: current.rows.map((row) => (row.id === id ? { ...row, ...patch } : row))
  }
}

/**
 * Switches whether Tuff offers one skill, at once. A file on disk is switched in Tuff's own list of
 * disabled skills and a copy imported into Tuff by its own item; neither touches an agent's
 * directory.
 */
async function onSwitch(row: SkillInventoryRow, value: boolean): Promise<void> {
  if (pending.has(row.id) || row.enabledInTuff === value) return
  pending.add(row.id)
  failures.delete(row.id)
  try {
    if (row.kind === 'imported') {
      const updated = await aiClient.orchestratorSetImportedItemActive({
        itemId: row.id,
        active: value
      })
      patchRow(row.id, { enabledInTuff: updated.active })
    } else {
      const snapshot = await skillSdk.setEnabled(row.id, value)
      const skill = snapshot.skills.find((candidate) => candidate.id === row.id)
      patchRow(row.id, { enabledInTuff: skill ? skill.enabled : value })
    }
  } catch (error) {
    log.error('Failed to switch a skill', error)
    const message = t('settings.skillsPage.toggleFailed', {
      name: row.name,
      reason: errorMessage(error, t('settings.skillsPage.toggleFailedUnknown'))
    })
    failures.set(row.id, message)
    toast.error(message)
    // A change that failed on the way back may still have landed.
    await loadInventory()
  } finally {
    pending.delete(row.id)
  }
}

/* ─── directories ─── */

/**
 * Adding or removing a directory takes effect at once and reads the machine again, so the skills it
 * holds appear or leave on the same round trip. Removing one only unlinks it; no file is deleted.
 */
async function addDir(): Promise<void> {
  if (dirsBusy.value) return
  const result = await transport
    .send(openFileEvent, {
      title: t('settings.skillsPage.dirPickTitle'),
      buttonLabel: t('settings.skillsPage.dirPickConfirm'),
      properties: ['openDirectory']
    })
    .catch((error: unknown) => {
      log.error('Failed to open the directory picker', error)
      return undefined
    })
  const path = result?.filePaths?.[0]
  if (!path) return

  dirsBusy.value = true
  try {
    await skillSdk.addDir(path)
    toast.success(t('settings.skillsPage.dirAdded'))
  } catch (error) {
    log.error('Failed to add a skill directory', error)
    toast.error(
      t('settings.skillsPage.dirAddFailed', {
        reason: errorMessage(error, t('settings.skillsPage.toggleFailedUnknown'))
      })
    )
  } finally {
    dirsBusy.value = false
  }
  await loadInventory()
}

async function removeDir(path: string): Promise<void> {
  if (dirsBusy.value) return
  dirsBusy.value = true
  try {
    await skillSdk.removeDir(path)
    toast.success(t('settings.skillsPage.dirRemoved'))
  } catch (error) {
    log.error('Failed to remove a skill directory', error)
    toast.error(
      t('settings.skillsPage.dirRemoveFailed', {
        reason: errorMessage(error, t('settings.skillsPage.toggleFailedUnknown'))
      })
    )
  } finally {
    dirsBusy.value = false
  }
  await loadInventory()
}

/* ─── the drawer ─── */

const drawerRow = computed(() => {
  const view = drawerView.value
  return view?.mode === 'local' ? rowById(view.id) : undefined
})

const builtinId = computed(() => {
  const view = drawerView.value
  return view?.mode === 'builtin' ? view.id : null
})

const storedBuiltin = computed(() =>
  builtinId.value ? (capabilities.value?.[builtinId.value] ?? null) : null
)

/** What the editor shows: the stored skill with the unsaved edits laid over it. */
const shownBuiltin = computed(() =>
  storedBuiltin.value ? mergeBuiltinDraft(storedBuiltin.value, draft.value) : null
)

const pendingDraft = computed<BuiltinSkillDraft>(() =>
  storedBuiltin.value ? normalizeBuiltinDraft(storedBuiltin.value, draft.value) : {}
)
const draftDirty = computed(() => builtinDraftDirty(pendingDraft.value))

const shownBindings = computed<CapabilityBinding[]>(() =>
  (shownBuiltin.value?.providers ?? [])
    .filter((binding) => binding.enabled !== false)
    .map((binding) => ({ ...binding, provider: visibleProviderMap.value.get(binding.providerId) }))
)

const drawerTitle = computed(() => {
  if (drawerRow.value) return drawerRow.value.name
  const capability = storedBuiltin.value
  return capability ? capability.label || capability.id : ''
})

function openRow(row: SkillInventoryRow): void {
  drawerView.value = { mode: 'local', id: row.id }
  drawerVisible.value = true
}

function openBuiltin(capability: IntelligenceCapabilityConfig): void {
  draft.value = {}
  saveError.value = ''
  drawerView.value = { mode: 'builtin', id: capability.id }
  drawerVisible.value = true
}

/* ─── the built-in skill's draft ─── */

function setDraft(next: BuiltinSkillDraft): void {
  draft.value = next
  saveError.value = ''
}

function onUpdateModels(providerId: string, models: string[]): void {
  const stored = storedBuiltin.value
  if (!stored) return
  setDraft(draftSetModels(stored, draft.value, providerId, models))
}

function onReorderProviders(bindings: NonNullable<BuiltinSkillDraft['providers']>): void {
  if (!storedBuiltin.value) return
  setDraft(draftReorder(draft.value, bindings))
}

/**
 * The editor hands a prompt over under the skill it was typed for. Only the open skill's own prompt
 * enters the draft: anything else is an editor flushing as it is torn down or reused.
 */
function onUpdatePrompt(capabilityId: string, prompt: string): void {
  if (capabilityId !== builtinId.value) {
    log.warn(`Ignored a prompt for ${capabilityId}; the drawer holds ${builtinId.value ?? 'none'}`)
    return
  }
  setDraft(draftPrompt(draft.value, prompt))
}

function applyWrite(id: string, write: BuiltinStoreWrite): void {
  if (write.providers) setCapabilityProviders(id, write.providers)
  if (write.patch) updateCapability(id, write.patch)
}

/**
 * Writes the draft and waits for the store to report the write.
 *
 * The store saves every change on its own 300 ms after it; letting that save start first, then asking
 * for a forced one, makes this request the one whose result comes back — a request superseded by the
 * store's own would report nothing. A failed write puts the fields it replaced back, so the edit
 * lives only in the draft and no later save of the store can write it behind the user's back.
 */
async function saveBuiltin(): Promise<boolean> {
  const id = builtinId.value
  const stored = storedBuiltin.value
  if (!id || !stored || saving.value) return false
  infoRef.value?.flushPrompt()
  const changes = normalizeBuiltinDraft(stored, draft.value)
  if (!builtinDraftDirty(changes)) {
    draft.value = {}
    return true
  }

  saving.value = true
  saveError.value = ''
  const before = JSON.parse(JSON.stringify(stored)) as IntelligenceCapabilityConfig
  const write = builtinSaveWrite(stored, changes)
  applyWrite(id, write)
  try {
    await nextTick()
    await saveSettings()
    draft.value = {}
    toast.success(t('settings.skillsPage.saved', { name: before.label || id }))
    return true
  } catch (error) {
    log.error('Failed to save a built-in skill', error)
    const current = capabilities.value?.[id]
    if (current) applyWrite(id, builtinRevertWrite(before, write, current))
    saveError.value = builtinSaveErrorText(error, t)
    return false
  } finally {
    saving.value = false
  }
}

function discardDraft(): void {
  draft.value = {}
  saveError.value = ''
}

async function runTest(params?: {
  providerId?: string
  userInput?: string
  model?: string
  promptTemplate?: string
  promptVariables?: Record<string, unknown>
}): Promise<void> {
  const id = builtinId.value
  // The test runs on what main holds, which is the saved configuration, never the draft.
  if (!id || testing[id] || draftDirty.value) return
  testing[id] = true
  testResults[id] = null
  try {
    const response = (await aiClient.testCapability({
      capabilityId: id,
      providerId: params?.providerId,
      userInput: params?.userInput,
      model: params?.model,
      promptTemplate: params?.promptTemplate,
      promptVariables: params?.promptVariables
    })) as CapabilityTestResult
    testResults[id] = { ...response, timestamp: Date.now() }
  } catch (error) {
    testResults[id] = {
      success: false,
      message: error instanceof Error ? error.message : t('settings.skillsPage.testFailed'),
      timestamp: Date.now()
    }
  } finally {
    testing[id] = false
  }
}

/* ─── closing ─── */

function askClose(name: string): Promise<CloseChoice> {
  closeRequest.value?.resolve('cancel')
  return new Promise((resolve) => {
    closeRequest.value = { name, settled: false, resolve }
  })
}

function settleClose(choice: CloseChoice): boolean {
  const request = closeRequest.value
  if (request && !request.settled) {
    request.settled = true
    request.resolve(choice)
  }
  return true
}

/** The dialog's own close (✕, Escape, or after a button): anything not yet answered is a cancel. */
function dismissClose(): void {
  settleClose('cancel')
  closeRequest.value = null
}

const closeButtons = computed<DialogButton[]>(() => [
  {
    content: t('settings.skillsPage.closeSave'),
    type: 'success',
    onClick: () => settleClose('save')
  },
  {
    content: t('settings.skillsPage.closeDiscard'),
    type: 'error',
    onClick: () => settleClose('discard')
  },
  {
    content: t('settings.skillsPage.closeCancel'),
    type: 'info',
    onClick: () => settleClose('cancel')
  }
])

/**
 * Every way the drawer closes comes through here: its ✕, its mask, Escape. A built-in skill with
 * unsaved changes asks first — save, discard, or stay. An Escape meant for a drawer nested inside, a
 * second request while the question is up or a save is running, and keys pressed on another page
 * are not requests to close.
 */
async function requestClose(): Promise<void> {
  if (!pageActive || closeRequest.value || saving.value || infoRef.value?.hasOpenDrawer()) return
  if (builtinId.value) {
    // A prompt still being typed is part of what would be lost.
    infoRef.value?.flushPrompt()
    if (draftDirty.value) {
      const choice = await askClose(drawerTitle.value)
      if (choice === 'cancel') return
      if (choice === 'save' && !(await saveBuiltin())) return
      if (choice === 'discard') discardDraft()
    }
  }
  drawerVisible.value = false
}

const drawerModel = computed({
  get: () => drawerVisible.value,
  set: (value: boolean) => {
    if (value) drawerVisible.value = true
    else void requestClose()
  }
})

// A rescan can take the open row away; the drawer must not keep describing it.
watch(drawerRow, (row) => {
  if (drawerVisible.value && drawerView.value?.mode === 'local' && !row) drawerVisible.value = false
})

function clearFilters(): void {
  query.value = ''
  agentFilter.value = null
}

function openDirs(): void {
  dirsVisible.value = true
}

onMounted(() => {
  void loadInventory()
  if (!builtinReady.value)
    void intelligenceSettings.whenHydrated().then(() => {
      builtinReady.value = true
    })
})

/**
 * Settings pages stay alive in the background. Coming back reads the machine again — agents may have
 * gained or lost skills meanwhile — without the skeleton: the old rows stay until the new ones land.
 */
let firstActivation = true
onActivated(() => {
  pageActive = true
  if (firstActivation) {
    firstActivation = false
    return
  }
  if (!loading.value) void loadInventory()
})

onDeactivated(() => {
  pageActive = false
})
</script>

<template>
  <section class="SkillsPage" data-testid="skills-page" :aria-busy="loading">
    <InsightsHeader :title="props.title" actions-class="SkillsPage-Actions">
      <template #actions>
        <TxButton
          variant="secondary"
          :loading="loading && hasLoaded"
          :disabled="!hasLoaded"
          data-testid="skills-rescan"
          @click="loadInventory"
        >
          <span class="i-ri-refresh-line" aria-hidden="true" />
          <span>{{ t('settings.skillsPage.rescan') }}</span>
        </TxButton>
        <TxButton variant="primary" data-testid="skills-add-dir" @click="openDirs">
          <span class="i-ri-folder-add-line" aria-hidden="true" />
          <span>{{ t('settings.skillsPage.addDir') }}</span>
        </TxButton>
      </template>
    </InsightsHeader>

    <InsightsNotice
      v-if="loadFailed"
      tone="error"
      :title="t('settings.skillsPage.scanFailedTitle')"
      :description="t('settings.skillsPage.scanFailedDesc')"
      data-testid="skills-scan-failed"
    >
      <template #action>
        <TxButton variant="flat" size="sm" :loading="loading" @click="loadInventory">
          {{ t('settings.skillsPage.retry') }}
        </TxButton>
      </template>
    </InsightsNotice>

    <!-- First read only: the same bar, field, headings and rows the loaded page draws. -->
    <div
      v-if="showSkeleton"
      class="SkillsPage-Body"
      aria-hidden="true"
      data-testid="skills-skeleton"
    >
      <ResourceAgentBar placeholder />
      <TxSkeleton class="SkillsPage-SearchPlaceholder" width="100%" :height="32" :radius="12" />
      <div class="SkillsPage-Group">
        <h2 class="SkillsPage-GroupTitle">{{ t('settings.skillsPage.localGroup') }}</h2>
        <div class="SkillsPage-List">
          <ResourceRow v-for="index in SKELETON_LOCAL_ROWS" :key="index" placeholder />
        </div>
      </div>
      <div class="SkillsPage-Group">
        <h2 class="SkillsPage-GroupTitle">{{ t('settings.skillsPage.builtinGroup') }}</h2>
        <div class="SkillsPage-List">
          <ResourceRow
            v-for="index in SKELETON_BUILTIN_ROWS"
            :key="index"
            placeholder
            :placeholder-tags="false"
            :placeholder-agents="0"
            :placeholder-switch="false"
            placeholder-hint
          />
        </div>
      </div>
    </div>

    <div v-else-if="hasLoaded && builtinReady" class="SkillsPage-Body">
      <ResourceAgentBar
        v-if="inventory"
        v-model="agentFilter"
        :agents="agentCounts"
        :enabled="enabledCount"
        :total="rows.length"
      />

      <TxSearchInput
        v-model="query"
        class="SkillsPage-Search"
        :placeholder="t('settings.skillsPage.searchPlaceholder')"
        :aria-label="t('settings.skillsPage.searchLabel')"
        data-testid="skills-search"
      />

      <section
        v-if="inventory && (visibleRows.length > 0 || !filtering)"
        class="SkillsPage-Group"
        :aria-labelledby="localHeadingId"
        data-testid="skills-local"
      >
        <h2 :id="localHeadingId" class="SkillsPage-GroupTitle">
          {{ t('settings.skillsPage.localGroup') }}
          <span class="SkillsPage-GroupCount">{{ visibleRows.length }}</span>
        </h2>
        <div v-if="visibleRows.length > 0" class="SkillsPage-List" data-testid="skills-local-list">
          <ResourceRow
            v-for="row in visibleRows"
            :key="row.id"
            :name="row.name"
            :description="row.description || t('settings.skillsPage.noDescription')"
            :tags="rowTags(row)"
            :agents="agentRefs"
            :configured="skillAgentIds(row)"
            :active="drawerVisible && drawerRow?.id === row.id"
            :data-skill-id="row.id"
            @open="openRow(row)"
          >
            <template #trailing>
              <TxSwitch
                :model-value="row.enabledInTuff"
                :loading="pending.has(row.id)"
                :aria-label="t('settings.skillsPage.switchLabel', { name: row.name })"
                @update:model-value="(value) => onSwitch(row, Boolean(value))"
              />
            </template>
          </ResourceRow>
        </div>
        <TxEmptyState
          v-else
          class="SkillsPage-Empty"
          variant="empty"
          surface="card"
          role="status"
          :title="t('settings.skillsPage.emptyTitle')"
          :description="t('settings.skillsPage.emptyDesc')"
          :primary-action="{
            label: t('settings.skillsPage.addDir'),
            type: 'primary',
            icon: 'i-ri-folder-add-line'
          }"
          data-testid="skills-empty"
          @primary="openDirs"
        />
      </section>

      <section
        v-if="visibleBuiltins.length > 0"
        class="SkillsPage-Group"
        :aria-labelledby="builtinHeadingId"
        data-testid="skills-builtin"
      >
        <h2 :id="builtinHeadingId" class="SkillsPage-GroupTitle">
          {{ t('settings.skillsPage.builtinGroup') }}
          <span class="SkillsPage-GroupCount">{{ visibleBuiltins.length }}</span>
        </h2>
        <div class="SkillsPage-List" data-testid="skills-builtin-list">
          <ResourceRow
            v-for="capability in visibleBuiltins"
            :key="capability.id"
            :name="capability.label || capability.id"
            :description="builtinDescription(capability)"
            :open-label="
              t('settings.skillsPage.openBuiltin', { name: capability.label || capability.id })
            "
            :open-hint="t('settings.skillsPage.configureHint')"
            :active="drawerVisible && builtinId === capability.id"
            :data-capability-id="capability.id"
            @open="openBuiltin(capability)"
          />
        </div>
      </section>

      <TxEmptyState
        v-if="filtering && visibleRows.length === 0 && visibleBuiltins.length === 0"
        class="SkillsPage-Empty"
        variant="search-empty"
        surface="card"
        role="status"
        :title="t('settings.skillsPage.searchEmptyTitle')"
        :description="t('settings.skillsPage.searchEmptyDesc')"
        :primary-action="{ label: t('settings.skillsPage.clearFilters') }"
        data-testid="skills-search-empty"
        @primary="clearFilters"
      />
    </div>

    <TxDrawer
      v-model:visible="drawerModel"
      :title="drawerTitle"
      :size="builtinId ? '600px' : '520px'"
    >
      <IntelligenceCapabilityInfo
        v-if="builtinId && shownBuiltin"
        ref="infoRef"
        :capability="shownBuiltin"
        :providers="visibleProviders"
        :bindings="shownBindings"
        :is-testing="Boolean(testing[builtinId])"
        :test-result="testResults[builtinId]"
        :test-blocked-reason="draftDirty ? t('settings.skillsPage.testBlocked') : undefined"
        @update-models="onUpdateModels"
        @update-prompt="onUpdatePrompt"
        @reorder-providers="onReorderProviders"
        @test="runTest"
      />
      <SettingSkillDetail
        v-else-if="drawerRow"
        :row="drawerRow"
        :pending="pending.has(drawerRow.id)"
        :failure="failures.get(drawerRow.id)"
        :tags="rowTags(drawerRow)"
        :storage-label="storageLabel(drawerRow.storage)"
        @toggle="(value) => drawerRow && onSwitch(drawerRow, value)"
      />

      <!--
        Always provided: TxDrawer decides once whether a footer exists, so a slot that came and went
        would leave the built-in editor without its Save. A skill on disk gets the read-only note.
        The drawer's root is a teleport and takes no attributes, so the footer carries its handle.
      -->
      <template #footer>
        <div class="SkillsPage-DrawerFooter" data-drawer="skill">
          <div v-if="builtinId" class="SkillsPage-DrawerActions">
            <p
              class="SkillsPage-DrawerStatus"
              :class="{ 'is-error': Boolean(saveError) }"
              role="status"
              data-testid="skill-drawer-status"
            >
              {{
                saveError
                  ? t('settings.intelligence.capabilitySaveErrorWithDetail', { detail: saveError })
                  : draftDirty
                    ? t('settings.skillsPage.unsaved')
                    : ''
              }}
            </p>
            <TxButton
              variant="primary"
              size="sm"
              :disabled="!draftDirty"
              :loading="saving"
              data-testid="skill-drawer-save"
              @click="saveBuiltin"
            >
              {{ t('settings.skillsPage.save') }}
            </TxButton>
          </div>
          <p v-else class="SkillsPage-DrawerNote" data-testid="skill-read-only">
            {{
              drawerRow?.kind === 'imported'
                ? t('settings.skillsPage.importedNote')
                : t('settings.skillsPage.readOnlyNote')
            }}
          </p>
        </div>
      </template>
    </TxDrawer>

    <TxDrawer
      v-model:visible="dirsVisible"
      :title="t('settings.skillsPage.dirsTitle')"
      size="520px"
    >
      <SettingSkillDirs :dirs="inventory?.dirs ?? []" :busy="dirsBusy" @remove="removeDir" />
      <template #footer>
        <div class="SkillsPage-DrawerActions" data-drawer="dirs">
          <span class="SkillsPage-Spacer" />
          <TxButton
            variant="primary"
            size="sm"
            :loading="dirsBusy"
            data-testid="skill-dirs-add"
            @click="addDir"
          >
            <span class="i-ri-folder-add-line" aria-hidden="true" />
            <span>{{ t('settings.skillsPage.dirAdd') }}</span>
          </TxButton>
        </div>
      </template>
    </TxDrawer>

    <TxBottomDialog
      v-if="closeRequest"
      :title="t('settings.skillsPage.closeTitle', { name: closeRequest.name })"
      :message="t('settings.skillsPage.closeMessage')"
      :btns="closeButtons"
      :close="dismissClose"
    />
  </section>
</template>

<style lang="scss" scoped>
/*
 * A block, not a flex column: the insights header and notices centre themselves with auto margins
 * under a max width, and in a flex column those margins would also shrink them to their content.
 */
.SkillsPage {
  width: 100%;
  min-width: 0;
  color: var(--shell-text-primary);
}

.SkillsPage-Body {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--shell-space-4);
}

.SkillsPage-SearchPlaceholder {
  --tx-skeleton-base-color: var(--shell-surface-2);
}

.SkillsPage-Group {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--shell-space-2);
}

.SkillsPage-GroupTitle {
  display: flex;
  align-items: baseline;
  gap: var(--shell-space-2);
  margin: 0;
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-md);
  font-weight: 600;
}

.SkillsPage-GroupCount {
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);
  font-weight: 400;
  font-variant-numeric: tabular-nums;
}

/*
 * The list's card: one border and radius around rows that draw only the hairline between
 * themselves. It clips, so a row's hover fill follows the rounded corners.
 */
.SkillsPage-List {
  overflow: hidden;
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-lg);
  background: var(--shell-bg);
}

.SkillsPage-DrawerFooter {
  width: 100%;
}

.SkillsPage-DrawerActions {
  display: flex;
  align-items: center;
  gap: var(--shell-space-3);
  width: 100%;
}

.SkillsPage-DrawerStatus {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);
  line-height: 1.5;

  &.is-error {
    color: var(--shell-danger);
  }
}

.SkillsPage-Spacer {
  flex: 1 1 auto;
}

.SkillsPage-DrawerNote {
  margin: 0;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);
  line-height: 1.5;
}
</style>
