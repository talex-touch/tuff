<!--
  SettingMcpServers

  Every MCP server on this machine and in Tuff, one row per server: the servers each local agent
  (Claude Code, Codex, Pi, …) declares in its own configuration, merged across agents, plus the ones
  typed in by hand. Each row says which agents declare it and carries Tuff's own switch for that one
  server.

  Read-only toward the agents. Switching a server on imports that server alone into Tuff — after the
  user confirms moving its credentials, when it has any — and switching it off stops that server
  alone. Probing one Tuff does not hold starts it alone from the agent's file and stops it after,
  importing and keeping nothing. No agent's directory or configuration file is ever written.
-->
<script lang="ts" name="SettingMcpServers" setup>
import type { DialogButton } from '@talex-touch/tuffex/dialog'
import type {
  McpServerInventory,
  McpServerRow,
  McpServerTuffState
} from '@talex-touch/utils/transport/sdk/domains/mcp-servers'
import type { AiAgentId } from '@talex-touch/utils/types/ai-orchestrator'
import type { AgentRef } from '~/components/settings/resources/agent-registry'
import type { ResourceRowTag } from '~/components/settings/resources/types'
import type { ManualServerDraft, McpProbeState } from './setting-mcp-display'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxBottomDialog } from '@talex-touch/tuffex/dialog'
import { TxDrawer } from '@talex-touch/tuffex/drawer'
import { TxEmptyState } from '@talex-touch/tuffex/empty-state'
import { TxSearchInput } from '@talex-touch/tuffex/search-input'
import { TxSkeleton, useDeferredLoading } from '@talex-touch/tuffex/skeleton'
import { TxSwitch } from '@talex-touch/tuffex/switch'
import { useIntelligenceSdk, useMcpServersSdk } from '@talex-touch/utils/renderer'
import { computed, onActivated, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import InsightsHeader from '~/components/settings/insights/InsightsHeader.vue'
import InsightsNotice from '~/components/settings/insights/InsightsNotice.vue'
import { agentBrand, agentCountsFrom } from '~/components/settings/resources/agent-registry'
import ResourceAgentBar from '~/components/settings/resources/ResourceAgentBar.vue'
import ResourceRow from '~/components/settings/resources/ResourceRow.vue'
import { createRendererLogger } from '~/utils/renderer-log'
import { errorMessage } from './setting-ai-import-shared'
import {
  declaredProbeRequestFor,
  emptyManualDraft,
  enabledRowCount,
  filterMcpRows,
  importRequestFor,
  importSourceFor,
  manualDraftFromItem,
  manualDraftValid,
  manualInputFromDraft,
  mcpCredentialNames,
  mcpFailureKind,
  mcpProbeTarget,
  mcpSwitchModel,
  rowAgentIds
} from './setting-mcp-display'
import SettingMcpServerDetail from './SettingMcpServerDetail.vue'
import SettingMcpServerForm from './SettingMcpServerForm.vue'

const props = defineProps<{
  /** The page heading; this section owns the page's title row. */
  title: string
}>()

type DrawerView =
  | { mode: 'detail'; key: string }
  | { mode: 'edit'; key: string }
  | { mode: 'create' }

interface ConfirmRequest {
  title: string
  message: string
  confirmLabel: string
  danger: boolean
  settled: boolean
  resolve: (confirmed: boolean) => void
}

/** Rows the skeleton draws. The real count is unknown until the scan lands; this is a typical one. */
const SKELETON_ROWS = 4

const { t } = useI18n()
const aiClient = useIntelligenceSdk()
const mcpSdk = useMcpServersSdk()
const log = createRendererLogger('SettingMcpServers')

const inventory = shallowRef<McpServerInventory | null>(null)
const loading = ref(false)
const loadFailed = ref(false)
/** Set once the first read settles either way; only the first read draws the skeleton. */
const hasLoaded = ref(false)
const showSkeleton = useDeferredLoading(() => !hasLoaded.value)

const query = ref('')
const agentFilter = ref<AiAgentId | null>(null)

/** Rows whose switch has a request in flight; a second flip waits for the first. */
const pending = reactive(new Set<string>())
/** The last failure per row, in the page's words, shown in the drawer until the next attempt. */
const failures = reactive(new Map<string, string>())
const probes = reactive(new Map<string, McpProbeState>())
/** Rows whose probe is under way, a confirmation included: a second press waits for the first. */
const probesInFlight = reactive(new Set<string>())

const drawerVisible = ref(false)
const drawerView = shallowRef<DrawerView>({ mode: 'create' })
const draft = ref<ManualServerDraft>(emptyManualDraft())
const editSecretNames = ref<string[]>([])
const saving = ref(false)
const editLoading = ref(false)

const confirmRequest = shallowRef<ConfirmRequest | null>(null)

const rows = computed(() => inventory.value?.rows ?? [])
const agentCounts = computed(() => agentCountsFrom(inventory.value?.agents ?? [], 'mcp'))
const agentRefs = computed<AgentRef[]>(() =>
  agentCounts.value.map(({ agentId, label }) => ({ agentId, label }))
)

function agentLabel(agentId: AiAgentId): string {
  return (
    agentCounts.value.find((agent) => agent.agentId === agentId)?.label ?? agentBrand(agentId).label
  )
}

const visibleRows = computed(() =>
  filterMcpRows(rows.value, { query: query.value, agentId: agentFilter.value, agentLabel })
)
const enabledCount = computed(() => enabledRowCount(rows.value))
const filtering = computed(() => query.value.trim() !== '' || agentFilter.value !== null)

const unreadable = computed(() => inventory.value?.unreadableSources ?? [])

function rowByKey(key: string): McpServerRow | undefined {
  return rows.value.find((row) => row.key === key)
}

function rowTags(row: McpServerRow): ResourceRowTag[] {
  const tags: ResourceRowTag[] = [
    {
      key: 'transport',
      label:
        row.transport === 'http' ? t('settings.mcpPage.tagHttp') : t('settings.mcpPage.tagStdio')
    }
  ]
  if (row.hasSecrets)
    tags.push({ key: 'secrets', label: t('settings.mcpPage.tagSecrets'), tone: 'warning' })
  if (row.tuff.origin === 'manual')
    tags.push({ key: 'manual', label: t('settings.mcpPage.tagManual'), tone: 'info' })
  if (row.tuff.state === 'not-imported')
    tags.push({ key: 'not-imported', label: t('settings.mcpPage.tagNotImported') })
  if (row.tuff.blockedReason === 'reauth-required')
    tags.push({ key: 'blocked', label: t('settings.mcpPage.tagReauth'), tone: 'warning' })
  else if (row.tuff.blockedReason === 'source-missing')
    tags.push({ key: 'blocked', label: t('settings.mcpPage.tagSourceMissing'), tone: 'warning' })
  else if (row.tuff.blockedReason === 'invalid')
    tags.push({ key: 'blocked', label: t('settings.mcpPage.tagInvalid'), tone: 'warning' })
  return tags
}

/* ─── reading ─── */

/**
 * One read is one discovery scan of every agent's configuration plus Tuff's own copies. A failed
 * read leaves the rows already on screen in place and says so above them; only the very first read
 * has nothing to keep.
 */
async function loadInventory(): Promise<void> {
  loading.value = true
  try {
    inventory.value = await mcpSdk.inventory()
    loadFailed.value = false
  } catch (error) {
    log.error('Failed to read the MCP server inventory', error)
    loadFailed.value = true
  } finally {
    loading.value = false
    hasLoaded.value = true
  }
}

/* ─── the switch ─── */

function patchRowState(key: string, state: McpServerTuffState): void {
  const current = inventory.value
  if (!current) return
  inventory.value = {
    ...current,
    rows: current.rows.map((row) => (row.key === key ? { ...row, tuff: state } : row))
  }
}

function failureText(row: McpServerRow, error: unknown, action: 'enable' | 'disable'): string {
  const name = row.name
  switch (mcpFailureKind(error)) {
    case 'reauth':
      return t('settings.mcpPage.errorReauth', { name })
    case 'source-changed':
      return t('settings.mcpPage.errorSourceChanged', { name })
    case 'secure-store':
      return t('settings.mcpPage.errorSecureStore', { name })
    case 'confirmation':
      return t('settings.mcpPage.errorConfirmation', { name })
    case 'source-missing':
      return t('settings.mcpPage.errorSourceMissing', { name })
    case 'invalid':
      return t('settings.mcpPage.errorInvalid', { name })
    default:
      return t(
        action === 'disable' ? 'settings.mcpPage.disableFailed' : 'settings.mcpPage.enableFailed',
        { name, reason: errorMessage(error, t('settings.skillsMcp.toggleFailed')) }
      )
  }
}

function reportFailure(row: McpServerRow, error: unknown, action: 'enable' | 'disable'): void {
  log.error(`Failed to switch ${action === 'enable' ? 'on' : 'off'} an MCP server`, error)
  const message = failureText(row, error, action)
  failures.set(row.key, message)
  toast.error(message)
}

function confirm(request: Omit<ConfirmRequest, 'settled' | 'resolve'>): Promise<boolean> {
  confirmRequest.value?.resolve(false)
  return new Promise((resolve) => {
    confirmRequest.value = { ...request, settled: false, resolve }
  })
}

function settleConfirm(confirmed: boolean): boolean {
  const request = confirmRequest.value
  if (request && !request.settled) {
    request.settled = true
    request.resolve(confirmed)
  }
  return true
}

/** The dialog's own close (✕, Esc, or after a button): anything not yet answered is a no. */
function closeConfirm(): void {
  settleConfirm(false)
  confirmRequest.value = null
}

const confirmButtons = computed<DialogButton[]>(() => {
  const request = confirmRequest.value
  if (!request) return []
  return [
    { content: t('settings.mcpPage.cancel'), type: 'info', onClick: () => settleConfirm(false) },
    {
      content: request.confirmLabel,
      type: request.danger ? 'error' : 'success',
      onClick: () => settleConfirm(true)
    }
  ]
})

function askSecretConfirmation(row: McpServerRow): Promise<boolean> {
  const names = mcpCredentialNames(row)
  return confirm({
    title: t('settings.mcpPage.secretTitle', { name: row.name }),
    message:
      names.length > 0
        ? t('settings.mcpPage.secretMessage', { names: names.join(', ') })
        : t('settings.mcpPage.secretMessageGeneric'),
    confirmLabel: t('settings.mcpPage.secretConfirm'),
    danger: false
  })
}

/**
 * Switches on a server Tuff does not hold yet: imports this server alone from the first agent file
 * that declares it.
 *
 * Main decides what needs the user: credentials the secure store does not hold yet come back as a
 * confirmation request, and only then is the user asked — before anything moves. A file that changed
 * since the scan is scanned again and the import retried once. Every attempt ends with a fresh read,
 * since an in-place activation reports `unchanged` and only the inventory says what happened.
 */
async function enableByImport(row: McpServerRow): Promise<void> {
  let current = row
  let confirmed = false
  let rescanned = false
  for (;;) {
    const source = importSourceFor(current)
    const scanId = inventory.value?.scanId
    if (!source || !scanId) return
    try {
      await aiClient.orchestratorApplyImport(importRequestFor(scanId, current, source, confirmed))
      await loadInventory()
      if (rowByKey(row.key)?.tuff.state === 'enabled')
        toast.success(t('settings.mcpPage.imported', { name: row.name }))
      return
    } catch (error) {
      const kind = mcpFailureKind(error)
      if (kind === 'confirmation' && !confirmed) {
        if (!(await askSecretConfirmation(current))) return
        confirmed = true
        continue
      }
      if (kind === 'source-changed' && !rescanned) {
        rescanned = true
        await loadInventory()
        const fresh = rowByKey(row.key)
        // Whatever the rescan says it is now is what the row shows; only a server still waiting to
        // be added is worth a second attempt.
        if (!fresh || fresh.tuff.state !== 'not-imported') return
        current = fresh
        continue
      }
      reportFailure(row, error, 'enable')
      await loadInventory()
      return
    }
  }
}

async function setServerEnabled(row: McpServerRow, enabled: boolean): Promise<void> {
  try {
    patchRowState(row.key, await mcpSdk.setServerEnabled(row.key, enabled))
  } catch (error) {
    reportFailure(row, error, enabled ? 'enable' : 'disable')
    // A change that failed on the way back may still have landed.
    await loadInventory()
  }
}

async function onSwitch(row: McpServerRow, value: boolean): Promise<void> {
  if (pending.has(row.key)) return
  const model = mcpSwitchModel(row)
  if (model.mode === 'blocked' || model.checked === value) return
  pending.add(row.key)
  failures.delete(row.key)
  try {
    if (model.mode === 'import') await enableByImport(row)
    else await setServerEnabled(row, value)
  } finally {
    pending.delete(row.key)
  }
}

/* ─── probe ─── */

function askProbeSecretConfirmation(row: McpServerRow): Promise<boolean> {
  const names = mcpCredentialNames(row)
  return confirm({
    title: t('settings.mcpPage.probeSecretTitle', { name: row.name }),
    message:
      names.length > 0
        ? t('settings.mcpPage.probeSecretMessage', { names: names.join(', ') })
        : t('settings.mcpPage.probeSecretMessageGeneric'),
    confirmLabel: t('settings.mcpPage.probeSecretConfirm'),
    danger: false
  })
}

/** A refusal main explains with a code, in the probe's words; anything else as it came. */
function probeFailureText(error: string | undefined): string {
  switch (mcpFailureKind(error)) {
    case 'reauth':
      return t('settings.mcpPage.probeReasonReauth')
    case 'source-changed':
      return t('settings.mcpPage.probeReasonSourceChanged')
    case 'source-missing':
      return t('settings.mcpPage.probeReasonSourceMissing')
    default:
      return error || t('settings.skillsMcp.mcp.probeUnknownError')
  }
}

/** What the drawer says about a row's probe; nothing to say reads as never probed. */
function showProbe(key: string, state: McpProbeState | undefined): void {
  if (state) probes.set(key, state)
  else probes.delete(key)
}

/**
 * Probes a server Tuff does not hold, straight from the first agent file that declares it: main
 * starts it alone and stops it after, and nothing is imported or kept.
 *
 * Main decides what needs the user, as for switching it on: a server with credentials comes back as
 * a confirmation request before anything starts, and only after a yes is it started with them — used
 * from memory for that one start. While the user decides nothing runs, so the drawer keeps what it
 * said before (`previous`). A file that changed since the scan is scanned again and the probe retried
 * once; a yes carries over only while the server still names the same credentials. Answers null when
 * there is nothing to show: the user said no, or the rescan took the server away.
 */
async function probeDeclared(
  row: McpServerRow,
  previous: McpProbeState | undefined
): Promise<McpProbeState | null> {
  let current = row
  let confirmedNames: string[] | null = null
  let rescanned = false
  for (;;) {
    const target = mcpProbeTarget(current)
    const scanId = inventory.value?.scanId
    if (target?.mode !== 'declared' || !scanId) return null
    const result = await mcpSdk.probeDeclared(
      declaredProbeRequestFor(scanId, current, target.source, confirmedNames !== null)
    )
    if (result.ok) return { status: 'ok', toolCount: result.toolCount ?? 0 }
    const kind = mcpFailureKind(result.error)
    if (kind === 'confirmation' && confirmedNames === null) {
      showProbe(row.key, previous)
      if (!(await askProbeSecretConfirmation(current))) return null
      showProbe(row.key, { status: 'probing' })
      confirmedNames = mcpCredentialNames(current)
      continue
    }
    if (kind === 'source-changed' && !rescanned) {
      rescanned = true
      await loadInventory()
      const fresh = rowByKey(row.key)
      if (!fresh || fresh.tuff.state !== 'not-imported') return null
      if (confirmedNames?.join('\n') !== mcpCredentialNames(fresh).join('\n')) confirmedNames = null
      current = fresh
      continue
    }
    return { status: 'failed', error: probeFailureText(result.error) }
  }
}

async function probeRow(row: McpServerRow): Promise<void> {
  const target = mcpProbeTarget(row)
  if (!target || probesInFlight.has(row.key)) return
  const previous = probes.get(row.key)
  probesInFlight.add(row.key)
  showProbe(row.key, { status: 'probing' })
  try {
    if (target.mode === 'declared') {
      // Nothing was probed when it answers null: whatever the drawer said before stays.
      showProbe(row.key, (await probeDeclared(row, previous)) ?? previous)
      return
    }
    const result = await mcpSdk.probe(target.itemId, target.profileId)
    probes.set(
      row.key,
      result.ok
        ? { status: 'ok', toolCount: result.toolCount ?? 0 }
        : { status: 'failed', error: result.error || t('settings.skillsMcp.mcp.probeUnknownError') }
    )
  } catch (error) {
    log.error('MCP probe failed', error)
    probes.set(row.key, {
      status: 'failed',
      error: errorMessage(error, t('settings.skillsMcp.mcp.probeUnavailable'))
    })
  } finally {
    probesInFlight.delete(row.key)
  }
}

/* ─── the drawer ─── */

const drawerRow = computed(() => {
  const view = drawerView.value
  return view.mode === 'create' ? undefined : rowByKey(view.key)
})

const drawerTitle = computed(() => {
  const view = drawerView.value
  if (view.mode === 'create') return t('settings.mcpPage.createTitle')
  const name = drawerRow.value?.name ?? ''
  return view.mode === 'edit' ? t('settings.mcpPage.editTitle', { name }) : name
})

const editing = computed(() => drawerView.value.mode !== 'detail')
const draftValid = computed(() => manualDraftValid(draft.value))

function openRow(row: McpServerRow): void {
  drawerView.value = { mode: 'detail', key: row.key }
  drawerVisible.value = true
}

function openCreate(): void {
  draft.value = emptyManualDraft()
  editSecretNames.value = []
  drawerView.value = { mode: 'create' }
  drawerVisible.value = true
}

/**
 * Edits read the stored item itself — the inventory masks arguments, and an edit has to start from
 * the real ones. Credential values are never read back; the form says what an empty field does.
 */
async function startEdit(row: McpServerRow): Promise<void> {
  const itemId = row.tuff.itemId
  if (!itemId || row.tuff.origin !== 'manual' || editLoading.value) return
  editLoading.value = true
  try {
    const snapshot = await aiClient.orchestratorGetSnapshot()
    const item = snapshot.importedItems.find((candidate) => candidate.id === itemId)
    if (!item) throw new Error(`MCP server ${itemId} is not configured`)
    draft.value = manualDraftFromItem(item, row.name)
    editSecretNames.value = mcpCredentialNames(row)
    drawerView.value = { mode: 'edit', key: row.key }
  } catch (error) {
    log.error('Failed to read the manual MCP server for editing', error)
    toast.error(errorMessage(error, t('settings.skillsMcp.loadFailedDesc')))
  } finally {
    editLoading.value = false
  }
}

function cancelEdit(): void {
  const view = drawerView.value
  if (view.mode === 'edit') drawerView.value = { mode: 'detail', key: view.key }
  else drawerVisible.value = false
}

async function saveDraft(): Promise<void> {
  if (!draftValid.value || saving.value) return
  saving.value = true
  try {
    const input = manualInputFromDraft(draft.value)
    const { itemId } = await mcpSdk.upsertManual(
      draft.value.itemId ? { ...input, itemId: draft.value.itemId } : input
    )
    toast.success(t('settings.skillsMcp.dialog.saved'))
    await loadInventory()
    // The merge key follows the name and command, so an edit can move the row; find it by item.
    const saved = rows.value.find((row) => row.tuff.itemId === itemId)
    if (saved) drawerView.value = { mode: 'detail', key: saved.key }
    else drawerVisible.value = false
  } catch (error) {
    log.error('Failed to save the manual MCP server', error)
    toast.error(errorMessage(error, t('settings.skillsMcp.dialog.saveFailed')))
  } finally {
    saving.value = false
  }
}

async function deleteRow(row: McpServerRow): Promise<void> {
  const itemId = row.tuff.itemId
  if (!itemId || row.tuff.origin !== 'manual') return
  const confirmed = await confirm({
    title: t('settings.mcpPage.deleteTitle', { name: row.name }),
    message: t('settings.mcpPage.deleteMessage'),
    confirmLabel: t('settings.mcpPage.delete'),
    danger: true
  })
  if (!confirmed) return
  try {
    await aiClient.orchestratorDeleteImportedItem({ itemId })
    probes.delete(row.key)
    failures.delete(row.key)
    drawerVisible.value = false
    toast.success(t('settings.mcpPage.deleted', { name: row.name }))
  } catch (error) {
    log.error('Failed to delete the MCP server', error)
    toast.error(
      t('settings.mcpPage.deleteFailed', {
        reason: errorMessage(error, t('settings.skillsMcp.dialog.deleteFailed'))
      })
    )
  }
  await loadInventory()
}

// A rescan or a delete can take the open row away; the drawer must not keep describing it. A save
// moves the row on purpose (its key follows its name and command) and re-points the drawer itself.
watch(drawerRow, (row) => {
  if (saving.value) return
  if (drawerVisible.value && drawerView.value.mode !== 'create' && !row) drawerVisible.value = false
})

function clearFilters(): void {
  query.value = ''
  agentFilter.value = null
}

onMounted(() => {
  void loadInventory()
})

/**
 * Settings pages stay alive in the background. Coming back reads the machine again — agents may
 * have gained or lost servers meanwhile — without the skeleton: the old rows stay until the new ones
 * land.
 */
let firstActivation = true
onActivated(() => {
  if (firstActivation) {
    firstActivation = false
    return
  }
  if (!loading.value) void loadInventory()
})
</script>

<template>
  <section class="McpServers" data-testid="mcp-servers" :aria-busy="loading">
    <InsightsHeader :title="props.title" actions-class="McpServers-Actions">
      <template #actions>
        <TxButton
          variant="secondary"
          :loading="loading && hasLoaded"
          :disabled="!hasLoaded"
          data-testid="mcp-servers-rescan"
          @click="loadInventory"
        >
          <span class="i-ri-refresh-line" aria-hidden="true" />
          <span>{{ t('settings.mcpPage.rescan') }}</span>
        </TxButton>
        <TxButton variant="primary" data-testid="mcp-servers-add" @click="openCreate">
          <span class="i-ri-add-line" aria-hidden="true" />
          <span>{{ t('settings.mcpPage.add') }}</span>
        </TxButton>
      </template>
    </InsightsHeader>

    <InsightsNotice
      v-if="loadFailed"
      tone="error"
      :title="t('settings.mcpPage.scanFailedTitle')"
      :description="t('settings.mcpPage.scanFailedDesc')"
      data-testid="mcp-servers-scan-failed"
    >
      <template #action>
        <TxButton variant="flat" size="sm" :loading="loading" @click="loadInventory">
          {{ t('settings.mcpPage.retry') }}
        </TxButton>
      </template>
    </InsightsNotice>

    <InsightsNotice
      v-if="unreadable.length > 0"
      tone="warning"
      :title="t('settings.mcpPage.unreadableTitle', { count: unreadable.length })"
      :description="
        t('settings.mcpPage.unreadableDesc', {
          paths: unreadable.map((source) => source.sourcePath).join(', ')
        })
      "
      data-testid="mcp-servers-unreadable"
    />

    <!-- First read only: the same bar, field and rows the loaded list draws, as placeholders. -->
    <div
      v-if="showSkeleton"
      class="McpServers-Body"
      aria-hidden="true"
      data-testid="mcp-servers-skeleton"
    >
      <ResourceAgentBar placeholder />
      <TxSkeleton class="McpServers-SearchPlaceholder" width="100%" :height="32" :radius="12" />
      <div class="McpServers-List">
        <ResourceRow v-for="index in SKELETON_ROWS" :key="index" placeholder description-mono />
      </div>
    </div>

    <div v-else-if="inventory" class="McpServers-Body">
      <ResourceAgentBar
        v-model="agentFilter"
        :agents="agentCounts"
        :enabled="enabledCount"
        :total="rows.length"
      />

      <TxSearchInput
        v-if="rows.length > 0"
        v-model="query"
        class="McpServers-Search"
        :placeholder="t('settings.mcpPage.searchPlaceholder')"
        :aria-label="t('settings.mcpPage.searchLabel')"
        data-testid="mcp-servers-search"
      />

      <div
        v-if="visibleRows.length > 0"
        class="McpServers-List"
        role="group"
        :aria-label="t('settings.mcpPage.listLabel')"
        data-testid="mcp-servers-list"
      >
        <ResourceRow
          v-for="row in visibleRows"
          :key="row.key"
          :name="row.name"
          :description="row.summary"
          description-mono
          :tags="rowTags(row)"
          :agents="agentRefs"
          :configured="rowAgentIds(row)"
          :active="drawerVisible && drawerRow?.key === row.key"
          :data-server-key="row.key"
          @open="openRow(row)"
        >
          <template #trailing>
            <TxSwitch
              :model-value="mcpSwitchModel(row).checked"
              :disabled="mcpSwitchModel(row).mode === 'blocked'"
              :loading="pending.has(row.key)"
              :aria-label="t('settings.mcpPage.switchLabel', { name: row.name })"
              @update:model-value="(value) => onSwitch(row, Boolean(value))"
            />
          </template>
        </ResourceRow>
      </div>

      <TxEmptyState
        v-else-if="rows.length === 0"
        class="McpServers-Empty"
        variant="empty"
        surface="card"
        role="status"
        :title="t('settings.mcpPage.emptyTitle')"
        :description="t('settings.mcpPage.emptyDesc')"
        :primary-action="{
          label: t('settings.mcpPage.add'),
          type: 'primary',
          icon: 'i-ri-add-line'
        }"
        data-testid="mcp-servers-empty"
        @primary="openCreate"
      />

      <TxEmptyState
        v-else
        class="McpServers-Empty"
        variant="search-empty"
        surface="card"
        role="status"
        :title="t('settings.mcpPage.searchEmptyTitle')"
        :description="t('settings.mcpPage.searchEmptyDesc')"
        :primary-action="filtering ? { label: t('settings.mcpPage.clearFilters') } : undefined"
        data-testid="mcp-servers-search-empty"
        @primary="clearFilters"
      />
    </div>

    <TxDrawer v-model:visible="drawerVisible" :title="drawerTitle" size="520px">
      <SettingMcpServerForm
        v-if="editing"
        v-model="draft"
        :stored-secret-names="drawerView.mode === 'edit' ? editSecretNames : []"
      />
      <SettingMcpServerDetail
        v-else-if="drawerRow"
        :row="drawerRow"
        :switch-model="mcpSwitchModel(drawerRow)"
        :pending="pending.has(drawerRow.key)"
        :failure="failures.get(drawerRow.key)"
        :probe="probes.get(drawerRow.key) ?? { status: 'idle' }"
        :tags="rowTags(drawerRow)"
        @toggle="(value) => drawerRow && onSwitch(drawerRow, value)"
        @probe="drawerRow && probeRow(drawerRow)"
      />

      <!--
        Always provided: TxDrawer decides once whether a footer exists, so a slot that came and went
        would leave the form without its buttons. A server an agent declares gets the read-only note
        where a hand-entered one gets its actions.
      -->
      <template #footer>
        <div v-if="editing" class="McpServers-DrawerActions">
          <span class="McpServers-Spacer" />
          <TxButton variant="secondary" size="sm" @click="cancelEdit">
            {{ t('settings.skillsMcp.dialog.cancel') }}
          </TxButton>
          <TxButton
            variant="primary"
            size="sm"
            :disabled="!draftValid"
            :loading="saving"
            data-testid="mcp-form-save"
            @click="saveDraft"
          >
            {{ t('settings.skillsMcp.dialog.save') }}
          </TxButton>
        </div>
        <div
          v-else-if="drawerRow && drawerRow.tuff.origin === 'manual'"
          class="McpServers-DrawerActions"
        >
          <TxButton
            variant="secondary"
            size="sm"
            data-testid="mcp-server-delete"
            @click="deleteRow(drawerRow)"
          >
            {{ t('settings.mcpPage.delete') }}
          </TxButton>
          <span class="McpServers-Spacer" />
          <TxButton
            variant="primary"
            size="sm"
            :loading="editLoading"
            data-testid="mcp-server-edit"
            @click="startEdit(drawerRow)"
          >
            {{ t('settings.mcpPage.edit') }}
          </TxButton>
        </div>
        <p v-else class="McpServers-DrawerNote" data-testid="mcp-server-read-only">
          {{ t('settings.mcpPage.readOnlyNote') }}
        </p>
      </template>
    </TxDrawer>

    <TxBottomDialog
      v-if="confirmRequest"
      :title="confirmRequest.title"
      :message="confirmRequest.message"
      :btns="confirmButtons"
      :close="closeConfirm"
    />
  </section>
</template>

<style lang="scss" scoped>
/*
 * A block, not a flex column: the insights header and notices centre themselves with auto margins
 * under a max width, and in a flex column those margins would also shrink them to their content.
 */
.McpServers {
  width: 100%;
  min-width: 0;
  color: var(--shell-text-primary);
}

.McpServers-Body {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--shell-space-4);
}

.McpServers-SearchPlaceholder {
  --tx-skeleton-base-color: var(--shell-surface-2);
}

/*
 * The list's card: one border and radius around rows that draw only the hairline between
 * themselves. It clips, so a row's hover fill follows the rounded corners.
 */
.McpServers-List {
  overflow: hidden;
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-lg);
  background: var(--shell-bg);
}

.McpServers-DrawerActions {
  display: flex;
  align-items: center;
  gap: var(--shell-space-2);
  width: 100%;
}

.McpServers-Spacer {
  flex: 1 1 auto;
}

.McpServers-DrawerNote {
  margin: 0;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);
  line-height: 1.5;
}
</style>
