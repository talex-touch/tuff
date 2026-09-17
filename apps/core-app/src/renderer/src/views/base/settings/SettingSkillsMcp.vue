<!--
  SettingSkillsMcp Component

  Skills and MCP servers, the two halves of what the home conversation can reach for beyond the
  model itself.

  Nothing here needs importing first. The skills list reads what the agents on this machine already
  keep — Codex, Claude Code, cc-switch and their neighbours — plus whatever the user linked by hand
  and whatever was imported before; main owns that merge and this page renders the snapshot it gets
  back. Every row it shows is a skill the conversation can already use.

  MCP servers are the exception, and deliberately so: a discovered server is listed, but adopting it
  is a click. Importing one enables a stdio command or an HTTP endpoint the agent runtime may then
  start, and that is a grant the user has to make rather than one this page makes for them.
-->
<script lang="ts" name="SettingSkillsMcp" setup>
import type { AiImportCandidate, AiImportedConfigItem } from '@talex-touch/tuff-intelligence'
import type { McpManualServerInput } from '@talex-touch/utils/transport/sdk/domains/mcp-servers'
import type { McpHostState } from '@talex-touch/utils/transport/sdk/domains/mcp-host'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxInput } from '@talex-touch/tuffex/input'
import { TxModal } from '@talex-touch/tuffex/modal'
import { useDeferredLoading } from '@talex-touch/tuffex/skeleton'
import { TxSwitch } from '@talex-touch/tuffex/switch'
import { TxTooltip } from '@talex-touch/tuffex/tooltip'
import { useIntelligenceSdk, useMcpHostSdk, useMcpServersSdk } from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { defineEvent, defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import SettingChip from '~/components/settings/SettingChip.vue'
import SettingRow from '~/components/settings/SettingRow.vue'
import SettingSkeleton from '~/components/settings/SettingSkeleton.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { createRendererLogger } from '~/utils/renderer-log'
import {
  isManualMcpServer,
  parseCommandArgs,
  parseKeyValueLines,
  resolveMcpTransport
} from './setting-skills-mcp-display'

/** Row budget per section. Everything past it unfolds in place rather than leaving the page. */
const MAX_VISIBLE_ROWS = 5

type ProbeStatus = 'idle' | 'probing' | 'ok' | 'failed'

interface ProbeState {
  status: ProbeStatus
  toolCount?: number
  error?: string
}

interface ManualDraft {
  /** Set when editing an existing manual server; `null` creates one. */
  itemId: string | null
  name: string
  transport: 'stdio' | 'streamable-http'
  command: string
  args: string
  env: string
  url: string
  headers: string
}

/**
 * Mirrored from `skill-local-runtime.ts`; edit both copies or neither.
 *
 * `sourceId` names the agent that owns a directory and is null for one the user linked, so the label
 * a row shows stays the renderer's decision.
 */
interface LocalSkillDirView {
  path: string
  sourceId: string | null
  auto: boolean
}

interface LocalSkillView {
  id: string
  name: string
  description: string
  path: string
  sourceDir: string
  enabled: boolean
}

interface LocalSkillSnapshotView {
  dirs: LocalSkillDirView[]
  skills: LocalSkillView[]
}

/** Where a row in the unified skills list came from. */
type SkillRowKind = 'agent' | 'linked' | 'imported'

interface SkillRow {
  key: string
  title: string
  description: string
  kind: SkillRowKind
  sourceId: string | null
  enabled: boolean
  /** Set for the two rows backed by a file on disk. */
  local: LocalSkillView | null
  /** Set for the row backed by an imported item. */
  item: AiImportedConfigItem | null
}

const skillLocalListEvent = defineEvent('ai')
  .module('skill-local')
  .event('list')
  .define<void, LocalSkillSnapshotView>()
const skillLocalAddDirEvent = defineEvent('ai')
  .module('skill-local')
  .event('add-dir')
  .define<{ path: string }, LocalSkillSnapshotView>()
const skillLocalRemoveDirEvent = defineEvent('ai')
  .module('skill-local')
  .event('remove-dir')
  .define<{ path: string }, LocalSkillSnapshotView>()
const skillLocalSetEnabledEvent = defineEvent('ai')
  .module('skill-local')
  .event('set-enabled')
  .define<{ id: string; enabled: boolean }, LocalSkillSnapshotView>()

const openFileEvent = defineRawEvent<
  { title?: string; buttonLabel?: string; properties?: string[] },
  { filePaths?: string[] }
>('dialog:open-file')

const IDLE_PROBE: ProbeState = { status: 'idle' }

const { t, te } = useI18n()
const aiClient = useIntelligenceSdk()
const mcpSdk = useMcpServersSdk()
const mcpHostSdk = useMcpHostSdk()
const tuffTransport = useTuffTransport()
const skillsMcpLog = createRendererLogger('SettingSkillsMcp')

const items = ref<AiImportedConfigItem[]>([])
const loading = ref(true)
const loadError = ref('')
const probeStates = reactive(new Map<string, ProbeState>())

const localDirs = ref<LocalSkillDirView[]>([])
const localSkills = ref<LocalSkillView[]>([])
const localBusy = ref(false)
const showAllSkills = ref(false)
const showAllMcp = ref(false)

/** Servers found on disk that nobody has adopted yet, plus the scan that found them. */
const scanId = ref('')
const discovered = ref<AiImportCandidate[]>([])
const scanFailed = ref(false)
const adoptingId = ref('')

const dialogVisible = ref(false)
const dialogSaving = ref(false)
const draft = reactive<ManualDraft>(createEmptyDraft())

function createEmptyDraft(): ManualDraft {
  return {
    itemId: null,
    name: '',
    transport: 'stdio',
    command: '',
    args: '',
    env: '',
    url: '',
    headers: ''
  }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function displayName(item: AiImportedConfigItem): string {
  return item.alias || item.name
}

function quoteIfNeeded(value: string): string {
  return /\s/.test(value) ? `"${value}"` : value
}

/** Agent names are brands; only a missing key falls back to the raw id. */
function agentLabel(sourceId: string): string {
  const key = `settings.skillsMcp.sources.${sourceId}`
  return te(key) ? t(key) : sourceId
}

const mcpServers = computed(() => items.value.filter((item) => item.kind === 'mcp'))
const importedSkills = computed(() => items.value.filter((item) => item.kind === 'skill'))

/**
 * Servers nobody has adopted. `added` is what the scanner reports for a config it found with no
 * stored item behind it, which is exactly the "on this machine, not in Tuff yet" set.
 */
type McpCandidate = Extract<AiImportCandidate, { kind: 'mcp' }>

const discoveredServers = computed<McpCandidate[]>(() =>
  discovered.value.filter(
    (candidate): candidate is McpCandidate =>
      candidate.kind === 'mcp' &&
      candidate.state === 'added' &&
      candidate.blockingIssues.length === 0 &&
      candidate.serverNames.length > 0
  )
)

const mcpRows = computed(() => {
  const sorted = mcpServers.value.slice().sort(byActiveThenName)
  const visible = showAllMcp.value ? sorted : sorted.slice(0, MAX_VISIBLE_ROWS)
  return visible.map((item) => {
    const transport = resolveMcpTransport(item)
    return {
      item,
      title: displayName(item),
      description: transport.detail || t('settings.skillsMcp.mcp.detailUnknown'),
      manual: isManualMcpServer(item),
      transportLabel:
        transport.kind === 'stdio'
          ? t('settings.skillsMcp.mcp.transportStdio')
          : transport.kind === 'streamable-http'
            ? t('settings.skillsMcp.mcp.transportHttp')
            : t('settings.skillsMcp.mcp.transportUnknown'),
      probe: probeStates.get(item.id) ?? IDLE_PROBE
    }
  })
})

function byActiveThenName(left: AiImportedConfigItem, right: AiImportedConfigItem): number {
  if (left.active !== right.active) return left.active ? -1 : 1
  return displayName(left).localeCompare(displayName(right))
}

/**
 * One list for every skill the conversation can reach: the agents' own libraries, the directories
 * the user linked, and anything imported earlier. They differ only in the source chip a row shows —
 * keeping them in separate lists is what made the page look empty while the disk was full.
 */
const skillRowsAll = computed<SkillRow[]>(() => {
  const agentOfDir = new Map(
    localDirs.value
      .filter((dir): dir is LocalSkillDirView & { sourceId: string } => Boolean(dir.sourceId))
      .map((dir) => [dir.path, dir.sourceId] as const)
  )
  const rows: SkillRow[] = localSkills.value.map((skill) => {
    const sourceId = agentOfDir.get(skill.sourceDir) ?? null
    return {
      key: skill.id,
      title: skill.name,
      description: skill.description || t('settings.skillsMcp.skills.noDescription'),
      kind: sourceId ? 'agent' : 'linked',
      sourceId,
      enabled: skill.enabled,
      local: skill,
      item: null
    }
  })

  for (const item of importedSkills.value) {
    const description = item.normalizedProjection?.description
    rows.push({
      key: item.id,
      title: displayName(item),
      description:
        typeof description === 'string' && description.trim()
          ? description.trim()
          : t('settings.skillsMcp.skills.noDescription'),
      kind: 'imported',
      sourceId: null,
      enabled: item.active,
      local: null,
      item
    })
  }

  return rows.sort((left, right) => {
    if (left.enabled !== right.enabled) return left.enabled ? -1 : 1
    return left.title.localeCompare(right.title)
  })
})

const skillRows = computed(() =>
  showAllSkills.value ? skillRowsAll.value : skillRowsAll.value.slice(0, MAX_VISIBLE_ROWS)
)
const hiddenSkillCount = computed(() =>
  Math.max(skillRowsAll.value.length - skillRows.value.length, 0)
)

const hiddenMcpCount = computed(() => Math.max(mcpServers.value.length - MAX_VISIBLE_ROWS, 0))
const showStateRow = computed(() => loading.value && items.value.length === 0)
const showMcpEmptyHint = computed(
  () =>
    !loading.value &&
    !loadError.value &&
    mcpServers.value.length === 0 &&
    discoveredServers.value.length === 0
)

const localDirRows = computed(() =>
  localDirs.value.map((dir) => ({
    ...dir,
    count: localSkills.value.filter((skill) => skill.sourceDir === dir.path).length
  }))
)

/**
 * Only the first load draws a skeleton. Binding to `loading` would also fire on
 * every retry, swapping already-rendered rows back out for placeholders; this
 * flag never returns to false once the first snapshot has landed.
 */
const hasLoaded = ref(false)
const showSkeleton = useDeferredLoading(() => !hasLoaded.value)

/**
 * Mirrors the three sections the loaded page draws. Every list is capped at
 * `MAX_VISIBLE_ROWS` and each section always ends with an action row, so a count
 * inside that range is as close as a skeleton can get before the real one lands.
 */
const skeletonGroups = computed(() => [
  { label: t('settings.skillsMcp.mcp.label'), rows: 4, description: true, trailing: true },
  { label: t('settings.skillsMcp.skills.label'), rows: 4, description: true, trailing: true },
  { label: t('settings.skillsMcp.localDirs.label'), rows: 2, description: true, trailing: true }
])

const draftValid = computed(() => {
  if (!draft.name.trim()) return false
  return draft.transport === 'stdio' ? Boolean(draft.command.trim()) : Boolean(draft.url.trim())
})

function probeChipTone(state: ProbeState): 'neutral' | 'success' | 'danger' {
  if (state.status === 'ok') return 'success'
  if (state.status === 'failed') return 'danger'
  return 'neutral'
}

function probeChipText(state: ProbeState): string {
  if (state.status === 'probing') return t('settings.skillsMcp.mcp.stateProbing')
  if (state.status === 'ok') {
    return t('settings.skillsMcp.mcp.stateOk', { count: state.toolCount ?? 0 })
  }
  if (state.status === 'failed') return t('settings.skillsMcp.mcp.stateFailed')
  return t('settings.skillsMcp.mcp.stateIdle')
}

function skillSourceLabel(row: SkillRow): string {
  if (row.kind === 'imported') return t('settings.skillsMcp.sources.imported')
  if (row.kind === 'linked') return t('settings.skillsMcp.sources.linked')
  return agentLabel(row.sourceId ?? '')
}

async function loadItems(): Promise<void> {
  loading.value = true
  try {
    const snapshot = await aiClient.orchestratorGetSnapshot()
    items.value = snapshot.importedItems
    loadError.value = ''
  } catch (error) {
    skillsMcpLog.error('Failed to read the orchestrator snapshot', error)
    loadError.value = errorMessage(error, t('settings.skillsMcp.loadFailedDesc'))
  } finally {
    loading.value = false
    hasLoaded.value = true
  }
}

async function setItemActive(item: AiImportedConfigItem, active: boolean): Promise<void> {
  try {
    const updated = await aiClient.orchestratorSetImportedItemActive({ itemId: item.id, active })
    items.value = items.value.map((candidate) =>
      candidate.id === updated.id ? updated : candidate
    )
  } catch (error) {
    skillsMcpLog.error('Failed to change the imported item state', error)
    toast.error(errorMessage(error, t('settings.skillsMcp.toggleFailed')))
  }
}

/**
 * Finds the servers the local agents already define. A failed scan leaves the section empty rather
 * than blocking the page: the skills half of it still works, and the retry row is right there.
 */
async function refreshDiscovery(): Promise<void> {
  try {
    const scan = await aiClient.orchestratorPreviewImport({})
    scanId.value = scan.scanId
    discovered.value = scan.candidates
    scanFailed.value = false
  } catch (error) {
    skillsMcpLog.error('Failed to scan local AI CLI configurations', error)
    scanFailed.value = true
  }
}

/**
 * Adopting a server copies its definition into Tuff's store and turns it on for the agent runtime.
 * That is a grant, so it takes a click — and when the definition carries credentials, an explicit
 * confirmation before those values move into the secure store.
 */
async function adoptServer(candidate: AiImportCandidate): Promise<void> {
  if (adoptingId.value) return
  const secretCount = candidate.kind === 'mcp' ? candidate.secretKeyPaths.length : 0
  if (
    secretCount > 0 &&
    !window.confirm(t('settings.skillsMcp.mcp.sensitiveConfirm', { count: secretCount }))
  )
    return

  adoptingId.value = candidate.id
  try {
    await aiClient.orchestratorApplyImport({
      scanId: scanId.value,
      candidateIds: [candidate.id],
      ...(secretCount > 0 ? { confirmSecretMigration: true } : {})
    })
    toast.success(t('settings.skillsMcp.mcp.adopted'))
    await Promise.all([loadItems(), refreshDiscovery()])
  } catch (error) {
    skillsMcpLog.error('Failed to adopt the discovered MCP server', error)
    toast.error(errorMessage(error, t('settings.skillsMcp.mcp.adoptFailed')))
  } finally {
    adoptingId.value = ''
  }
}

function applyLocalSnapshot(snapshot: LocalSkillSnapshotView | undefined): void {
  localDirs.value = snapshot?.dirs ?? []
  localSkills.value = snapshot?.skills ?? []
}

/**
 * Every local mutation answers with the rescanned snapshot, so the page never
 * builds its own idea of what the directories hold — a skill added or renamed on
 * disk shows up on the same round trip.
 */
async function runLocalAction(
  action: () => Promise<LocalSkillSnapshotView | undefined>,
  failureKey: string
): Promise<void> {
  if (localBusy.value) return
  localBusy.value = true
  try {
    applyLocalSnapshot(await action())
  } catch (error) {
    skillsMcpLog.error('Local skill directory action failed', error)
    toast.error(errorMessage(error, t(failureKey)))
  } finally {
    localBusy.value = false
  }
}

async function loadLocalSkills(): Promise<void> {
  await runLocalAction(
    () => tuffTransport.send(skillLocalListEvent),
    'settings.skillsMcp.localDirs.loadFailed'
  )
}

async function addLocalDir(): Promise<void> {
  const result = await tuffTransport
    .send(openFileEvent, {
      title: t('settings.skillsMcp.localDirs.pickTitle'),
      buttonLabel: t('settings.skillsMcp.localDirs.pickConfirm'),
      properties: ['openDirectory']
    })
    .catch((error: unknown) => {
      skillsMcpLog.error('Failed to open the directory picker', error)
      return undefined
    })
  const path = result?.filePaths?.[0]
  if (!path) return

  await runLocalAction(
    () => tuffTransport.send(skillLocalAddDirEvent, { path }),
    'settings.skillsMcp.localDirs.addFailed'
  )
}

async function removeLocalDir(path: string): Promise<void> {
  await runLocalAction(
    () => tuffTransport.send(skillLocalRemoveDirEvent, { path }),
    'settings.skillsMcp.localDirs.removeFailed'
  )
}

async function setLocalSkillEnabled(skill: LocalSkillView, enabled: boolean): Promise<void> {
  await runLocalAction(
    () => tuffTransport.send(skillLocalSetEnabledEvent, { id: skill.id, enabled }),
    'settings.skillsMcp.localDirs.toggleFailed'
  )
}

/** Imported skills and disk-backed ones are stored in different places, so the toggle splits here. */
async function setSkillEnabled(row: SkillRow, enabled: boolean): Promise<void> {
  if (row.item) {
    await setItemActive(row.item, enabled)
    return
  }
  if (row.local) await setLocalSkillEnabled(row.local, enabled)
}

async function probeServer(item: AiImportedConfigItem): Promise<void> {
  if (probeStates.get(item.id)?.status === 'probing') return
  probeStates.set(item.id, { status: 'probing' })
  try {
    const result = await mcpSdk.probe(item.id)
    probeStates.set(
      item.id,
      result.ok
        ? { status: 'ok', toolCount: result.toolCount ?? 0 }
        : { status: 'failed', error: result.error || t('settings.skillsMcp.mcp.probeUnknownError') }
    )
  } catch (error) {
    // A rejected send means the main-process handler is missing or the module never came up —
    // report it in the row's own chip rather than leaving it stuck on "testing".
    skillsMcpLog.error('MCP probe failed', error)
    probeStates.set(item.id, {
      status: 'failed',
      error: errorMessage(error, t('settings.skillsMcp.mcp.probeUnavailable'))
    })
  }
}

function openCreateDialog(): void {
  Object.assign(draft, createEmptyDraft())
  dialogVisible.value = true
}

function openEditDialog(item: AiImportedConfigItem): void {
  const transport = resolveMcpTransport(item)
  const next = createEmptyDraft()
  next.itemId = item.id
  next.name = displayName(item)
  if (transport.kind === 'streamable-http') {
    next.transport = 'streamable-http'
    next.url = transport.detail
  } else {
    const [command = '', ...args] = parseCommandArgs(transport.detail)
    next.command = command
    next.args = args.map(quoteIfNeeded).join(' ')
  }
  Object.assign(draft, next)
  dialogVisible.value = true
}

function buildManualInput(): McpManualServerInput {
  const name = draft.name.trim()
  if (draft.transport === 'streamable-http') {
    const headers = parseKeyValueLines(draft.headers)
    return {
      name,
      transport: 'streamable-http',
      url: draft.url.trim(),
      headers: Object.keys(headers).length > 0 ? headers : undefined
    }
  }
  const env = parseKeyValueLines(draft.env)
  return {
    name,
    transport: 'stdio',
    command: draft.command.trim(),
    args: parseCommandArgs(draft.args),
    env: Object.keys(env).length > 0 ? env : undefined
  }
}

async function saveManualServer(): Promise<void> {
  if (!draftValid.value || dialogSaving.value) return
  dialogSaving.value = true
  try {
    const input = buildManualInput()
    await mcpSdk.upsertManual(draft.itemId ? { ...input, itemId: draft.itemId } : input)
    dialogVisible.value = false
    toast.success(t('settings.skillsMcp.dialog.saved'))
    await loadItems()
  } catch (error) {
    skillsMcpLog.error('Failed to save the manual MCP server', error)
    toast.error(errorMessage(error, t('settings.skillsMcp.dialog.saveFailed')))
  } finally {
    dialogSaving.value = false
  }
}

async function deleteDraftServer(): Promise<void> {
  const itemId = draft.itemId
  if (!itemId) return
  if (!window.confirm(t('settings.skillsMcp.dialog.deleteConfirm', { name: draft.name }))) return
  try {
    await aiClient.orchestratorDeleteImportedItem({ itemId })
    probeStates.delete(itemId)
    dialogVisible.value = false
    await Promise.all([loadItems(), refreshDiscovery()])
  } catch (error) {
    skillsMcpLog.error('Failed to delete the MCP server', error)
    toast.error(errorMessage(error, t('settings.skillsMcp.dialog.deleteFailed')))
  }
}

async function rescan(): Promise<void> {
  await Promise.all([loadLocalSkills(), refreshDiscovery()])
}

/*
 * The other direction of the same wire the sections above configure: those are servers Tuff talks
 * to, this is Tuff being talked to. Kept in one place here because every row below is a property of
 * one listener — its address, its credential, and which of Tuff's tools it is allowed to publish.
 */
const mcpHost = ref<McpHostState | null>(null)
const hostBusy = ref(false)
const hostTokenRevealed = ref(false)
const hostPortDraft = ref('')

const hostRunning = computed(() => mcpHost.value?.running === true)
const enabledHostToolCount = computed(
  () => (mcpHost.value?.tools ?? []).filter((tool) => tool.enabled).length
)
/** Nothing to list while the listener is off: the rows describe a running endpoint. */
const hostTools = computed(() => (mcpHost.value?.enabled ? (mcpHost.value.tools ?? []) : []))

/**
 * A listener can be switched on and still not be bound — a taken port is exactly that — so the
 * status line says which of the two the user is looking at rather than leaving them to guess.
 */
const hostStatusDescription = computed(() => {
  const state = mcpHost.value
  if (!state) return t('settings.skillsMcp.host.loading')
  if (state.lastError) return t('settings.skillsMcp.host.errorDesc', { reason: state.lastError })
  if (!state.enabled) return t('settings.skillsMcp.host.enableDesc')
  if (!state.running) return t('settings.skillsMcp.host.startingDesc')
  return t('settings.skillsMcp.host.runningDesc', { count: enabledHostToolCount.value })
})

/** The token is a credential: shown as its own length, and only in full on request. */
const hostTokenDisplay = computed(() => {
  const token = mcpHost.value?.token ?? ''
  return token ? '•'.repeat(Math.min(token.length, 32)) : '—'
})

/**
 * What a client pastes. Written as the `mcpServers` block the common clients read, so it is a
 * paste rather than four fields to transcribe by hand.
 */
const hostClientConfig = computed(() => {
  const state = mcpHost.value
  if (!state?.endpoint || !state.token) return ''
  return JSON.stringify(
    {
      mcpServers: {
        tuff: {
          type: 'http',
          url: state.endpoint,
          headers: { Authorization: `Bearer ${state.token}` }
        }
      }
    },
    null,
    2
  )
})

function hostRiskTone(risk: 'read' | 'write' | 'execute'): 'neutral' | 'warning' | 'danger' {
  if (risk === 'write') return 'warning'
  if (risk === 'execute') return 'danger'
  return 'neutral'
}

async function loadMcpHost(): Promise<void> {
  try {
    mcpHost.value = await mcpHostSdk.getState()
  } catch (error) {
    // No toast: the section renders its own unavailable state, and a failure
    // here must not look like the MCP servers above failing to load.
    skillsMcpLog.error('Failed to load the local MCP server state', error)
  }
}

async function runHostCommand(
  command: () => Promise<McpHostState>,
  failureKey: string
): Promise<void> {
  if (hostBusy.value) return
  hostBusy.value = true
  try {
    mcpHost.value = await command()
  } catch (error) {
    skillsMcpLog.error('Local MCP server command failed', error)
    toast.error(errorMessage(error, t(failureKey)))
  } finally {
    hostBusy.value = false
  }
}

function toggleMcpHost(enabled: boolean): void {
  void runHostCommand(() => mcpHostSdk.setEnabled(enabled), 'settings.skillsMcp.host.toggleFailed')
}

function setHostTool(name: string, enabled: boolean): void {
  void runHostCommand(
    () => mcpHostSdk.setToolEnabled(name, enabled),
    'settings.skillsMcp.host.toolFailed'
  )
}

function rotateHostToken(): void {
  void runHostCommand(() => mcpHostSdk.rotateToken(), 'settings.skillsMcp.host.rotateFailed')
}

function applyHostPort(): void {
  const port = Number(hostPortDraft.value)
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    toast.error(t('settings.skillsMcp.host.portInvalid'))
    hostPortDraft.value = String(mcpHost.value?.port ?? '')
    return
  }
  void runHostCommand(() => mcpHostSdk.setPort(port), 'settings.skillsMcp.host.portFailed')
}

async function copyHostValue(value: string, successKey: string): Promise<void> {
  if (!value) return
  try {
    await navigator.clipboard.writeText(value)
    toast.success(t(successKey))
  } catch (error) {
    skillsMcpLog.error('Clipboard write failed', error)
    toast.error(t('settings.skillsMcp.host.copyFailed'))
  }
}

watch(
  () => mcpHost.value?.port,
  (port) => {
    if (typeof port === 'number') hostPortDraft.value = String(port)
  },
  { immediate: true }
)

onMounted(() => {
  void loadItems()
  void loadLocalSkills()
  void refreshDiscovery()
  void loadMcpHost()
})
</script>

<template>
  <!--
    Stands in for both sections on first load. The dialog further down stays
    outside the branch: the user opens it, not the initial fetch.
  -->
  <SettingSkeleton v-if="showSkeleton" :groups="skeletonGroups" />

  <TuffGroupBlock v-else-if="loadError" :name="t('settings.skillsMcp.mcp.label')">
    <SettingRow :title="t('settings.skillsMcp.loadFailed')" :description="loadError">
      <template #trailing>
        <TxButton variant="secondary" size="sm" @click="loadItems">
          {{ t('settings.skillsMcp.retry') }}
        </TxButton>
      </template>
    </SettingRow>
  </TuffGroupBlock>

  <!-- The card draws the hairline between its own rows, so none of these sections place one. -->
  <TuffGroupBlock v-else :name="t('settings.skillsMcp.mcp.label')">
    <SettingRow v-if="showStateRow" :title="t('settings.skillsMcp.loading')" />

    <SettingRow
      v-for="row in mcpRows"
      :key="row.item.id"
      :title="row.title"
      :description="row.description"
    >
      <template #trailing>
        <SettingChip>
          {{
            row.manual
              ? t('settings.skillsMcp.mcp.sourceManual')
              : t('settings.skillsMcp.mcp.sourceImported')
          }}
        </SettingChip>
        <SettingChip>{{ row.transportLabel }}</SettingChip>

        <!-- Only the failure state carries a reason worth a tooltip; the other two read fully. -->
        <TxTooltip
          v-if="row.probe.status === 'failed'"
          :content="row.probe.error"
          :anchor="{ placement: 'top', showArrow: true }"
        >
          <SettingChip tone="danger">{{ probeChipText(row.probe) }}</SettingChip>
        </TxTooltip>
        <SettingChip v-else :tone="probeChipTone(row.probe)">
          {{ probeChipText(row.probe) }}
        </SettingChip>

        <TxButton
          variant="secondary"
          size="sm"
          :loading="row.probe.status === 'probing'"
          @click="probeServer(row.item)"
        >
          {{ t('settings.skillsMcp.mcp.probe') }}
        </TxButton>
        <TxButton v-if="row.manual" variant="secondary" size="sm" @click="openEditDialog(row.item)">
          {{ t('settings.skillsMcp.mcp.edit') }}
        </TxButton>
        <TxSwitch
          :model-value="row.item.active"
          @update:model-value="(value) => setItemActive(row.item, Boolean(value))"
        />
      </template>
    </SettingRow>

    <!--
      Found on this machine, not adopted yet. One row per configuration that defines servers, since
      that is the unit an import acts on; the description names the servers inside it.
    -->
    <SettingRow
      v-for="candidate in discoveredServers"
      :key="candidate.id"
      :title="candidate.name"
      :description="
        t('settings.skillsMcp.mcp.discoveredDesc', {
          count: candidate.serverNames.length,
          names: candidate.serverNames.join('、')
        })
      "
    >
      <template #trailing>
        <SettingChip tone="info">{{ t('settings.skillsMcp.mcp.discoveredChip') }}</SettingChip>
        <SettingChip>{{ agentLabel(candidate.provider) }}</SettingChip>
        <SettingChip v-if="candidate.secretKeyPaths.length > 0" tone="warning">
          {{ t('settings.skillsMcp.mcp.secretChip') }}
        </SettingChip>
        <TxButton size="sm" :loading="adoptingId === candidate.id" @click="adoptServer(candidate)">
          {{ t('settings.skillsMcp.mcp.adoptAction') }}
        </TxButton>
      </template>
    </SettingRow>

    <SettingRow
      v-if="scanFailed"
      :title="t('settings.skillsMcp.mcp.scanFailed')"
      :description="t('settings.skillsMcp.mcp.scanFailedDesc')"
    >
      <template #trailing>
        <TxButton variant="secondary" size="sm" @click="refreshDiscovery">
          {{ t('settings.skillsMcp.mcp.scanAction') }}
        </TxButton>
      </template>
    </SettingRow>

    <SettingRow
      v-if="hiddenMcpCount > 0"
      :title="t('settings.skillsMcp.mcp.showAllTitle')"
      :description="t('settings.skillsMcp.mcp.showAllDesc', { count: hiddenMcpCount })"
      navigable
      @activate="showAllMcp = true"
    />

    <SettingRow
      :title="t('settings.skillsMcp.mcp.addTitle')"
      :description="
        showMcpEmptyHint
          ? t('settings.skillsMcp.mcp.addDescEmpty')
          : t('settings.skillsMcp.mcp.addDesc')
      "
    >
      <template #trailing>
        <TxButton variant="secondary" size="sm" @click="refreshDiscovery">
          {{ t('settings.skillsMcp.mcp.scanAction') }}
        </TxButton>
        <TxButton size="sm" @click="openCreateDialog">
          {{ t('settings.skillsMcp.mcp.addAction') }}
        </TxButton>
      </template>
    </SettingRow>
  </TuffGroupBlock>

  <!--
    The other half of the same wire the section above configures: those are servers Tuff talks to,
    this is Tuff being talked to. An editor or terminal agent on this machine can call the tools
    listed below, and every call still lands on the confirmation prompt the home conversation uses —
    so nothing here can run without the user seeing it first.
  -->
  <TuffGroupBlock v-if="!showSkeleton" :name="t('settings.skillsMcp.host.label')">
    <SettingRow
      :title="t('settings.skillsMcp.host.enableTitle')"
      :description="hostStatusDescription"
    >
      <template #trailing>
        <SettingChip :tone="hostRunning ? 'success' : 'neutral'">
          {{
            hostRunning
              ? t('settings.skillsMcp.host.running')
              : t('settings.skillsMcp.host.stopped')
          }}
        </SettingChip>
        <TxSwitch
          :model-value="mcpHost?.enabled ?? false"
          :disabled="hostBusy"
          @update:model-value="(value) => toggleMcpHost(Boolean(value))"
        />
      </template>
    </SettingRow>

    <SettingRow
      v-if="mcpHost?.enabled"
      :title="t('settings.skillsMcp.host.endpointTitle')"
      :description="t('settings.skillsMcp.host.endpointDesc')"
    >
      <template #trailing>
        <code class="SettingsMcpHost-Code">{{ mcpHost?.endpoint ?? '—' }}</code>
        <TxButton
          variant="secondary"
          size="sm"
          :disabled="!mcpHost?.endpoint"
          @click="copyHostValue(mcpHost?.endpoint ?? '', 'settings.skillsMcp.host.endpointCopied')"
        >
          {{ t('settings.skillsMcp.host.copy') }}
        </TxButton>
      </template>
    </SettingRow>

    <SettingRow
      v-if="mcpHost?.enabled"
      :title="t('settings.skillsMcp.host.portTitle')"
      :description="t('settings.skillsMcp.host.portDesc')"
    >
      <template #trailing>
        <TxInput
          v-model="hostPortDraft"
          class="SettingsMcpHost-Port"
          @keyup.enter="applyHostPort"
        />
        <TxButton size="sm" :loading="hostBusy" @click="applyHostPort">
          {{ t('settings.skillsMcp.host.apply') }}
        </TxButton>
      </template>
    </SettingRow>

    <SettingRow
      v-if="mcpHost?.enabled"
      :title="t('settings.skillsMcp.host.tokenTitle')"
      :description="t('settings.skillsMcp.host.tokenDesc')"
    >
      <template #trailing>
        <code class="SettingsMcpHost-Code">
          {{ hostTokenRevealed ? mcpHost?.token : hostTokenDisplay }}
        </code>
        <TxButton variant="secondary" size="sm" @click="hostTokenRevealed = !hostTokenRevealed">
          {{
            hostTokenRevealed
              ? t('settings.skillsMcp.host.hide')
              : t('settings.skillsMcp.host.reveal')
          }}
        </TxButton>
        <TxButton
          variant="secondary"
          size="sm"
          @click="copyHostValue(mcpHost?.token ?? '', 'settings.skillsMcp.host.tokenCopied')"
        >
          {{ t('settings.skillsMcp.host.copy') }}
        </TxButton>
        <TxButton variant="secondary" size="sm" :loading="hostBusy" @click="rotateHostToken">
          {{ t('settings.skillsMcp.host.rotate') }}
        </TxButton>
      </template>
    </SettingRow>

    <!-- One row per tool. Everything that writes, opens or runs arrives switched off. -->
    <SettingRow
      v-for="tool in hostTools"
      :key="tool.name"
      :title="tool.name"
      :description="tool.description"
    >
      <template #trailing>
        <SettingChip :tone="hostRiskTone(tool.risk)">
          {{ t(`settings.skillsMcp.host.risk.${tool.risk}`) }}
        </SettingChip>
        <TxSwitch
          :model-value="tool.enabled"
          @update:model-value="(value) => setHostTool(tool.name, Boolean(value))"
        />
      </template>
    </SettingRow>

    <TuffBlockSlot
      v-if="mcpHost?.enabled && hostClientConfig"
      :title="t('settings.skillsMcp.host.configTitle')"
      :description="t('settings.skillsMcp.host.configDesc')"
    >
      <pre class="SettingsMcpHost-Snippet">{{ hostClientConfig }}</pre>
      <TxButton
        variant="secondary"
        size="sm"
        @click="copyHostValue(hostClientConfig, 'settings.skillsMcp.host.configCopied')"
      >
        {{ t('settings.skillsMcp.host.copy') }}
      </TxButton>
    </TuffBlockSlot>
  </TuffGroupBlock>

  <!--
    One list, three sources. Everything here is live: the agents' libraries and the linked
    directories are read from disk on every snapshot, and the imported rows are the leftovers from
    the earlier one-shot import flow.
  -->
  <TuffGroupBlock v-if="!showSkeleton" :name="t('settings.skillsMcp.skills.label')">
    <SettingRow v-if="showStateRow" :title="t('settings.skillsMcp.loading')" />

    <SettingRow
      v-for="row in skillRows"
      :key="row.key"
      :title="row.title"
      :description="row.description"
    >
      <template #trailing>
        <SettingChip :tone="row.kind === 'imported' ? 'neutral' : 'info'">
          {{ skillSourceLabel(row) }}
        </SettingChip>
        <TxSwitch
          :model-value="row.enabled"
          :disabled="localBusy"
          @update:model-value="(value) => setSkillEnabled(row, Boolean(value))"
        />
      </template>
    </SettingRow>

    <SettingRow
      v-if="hiddenSkillCount > 0"
      :title="t('settings.skillsMcp.skills.showAllTitle')"
      :description="t('settings.skillsMcp.skills.showAllDesc', { count: hiddenSkillCount })"
      navigable
      @activate="showAllSkills = true"
    />

    <SettingRow
      :title="t('settings.skillsMcp.skills.rescanTitle')"
      :description="t('settings.skillsMcp.skills.rescanDesc')"
    >
      <template #trailing>
        <TxButton variant="secondary" size="sm" @click="rescan">
          {{ t('settings.skillsMcp.skills.rescanAction') }}
        </TxButton>
      </template>
    </SettingRow>

    <SettingRow
      :title="t('settings.skillsMcp.skills.injectionTitle')"
      :description="t('settings.skillsMcp.skills.injectionDesc')"
    />
  </TuffGroupBlock>

  <!--
    Linked, not imported: these rows describe files that stay where the user put
    them, so removing a directory unlinks it and never deletes anything. The detected rows are the
    agents' own libraries and cannot be unlinked — they are not ours to detach.
  -->
  <TuffGroupBlock v-if="!showSkeleton" :name="t('settings.skillsMcp.localDirs.label')">
    <SettingRow
      v-for="row in localDirRows"
      :key="row.path"
      :title="row.sourceId ? agentLabel(row.sourceId) : row.path"
      :description="
        row.auto
          ? t('settings.skillsMcp.localDirs.autoDesc', { count: row.count })
          : t('settings.skillsMcp.localDirs.dirDesc', { count: row.count })
      "
    >
      <template #trailing>
        <SettingChip v-if="row.auto" tone="info">
          {{ t('settings.skillsMcp.localDirs.auto') }}
        </SettingChip>
        <TxTooltip
          v-if="row.auto"
          :content="row.path"
          :anchor="{ placement: 'top', showArrow: true }"
        >
          <SettingChip mono>{{ t('settings.skillsMcp.localDirs.pathChip') }}</SettingChip>
        </TxTooltip>
        <TxButton
          v-else
          variant="secondary"
          size="sm"
          :disabled="localBusy"
          @click="removeLocalDir(row.path)"
        >
          {{ t('settings.skillsMcp.localDirs.remove') }}
        </TxButton>
      </template>
    </SettingRow>

    <SettingRow
      :title="t('settings.skillsMcp.localDirs.addTitle')"
      :description="t('settings.skillsMcp.localDirs.addDesc')"
    >
      <template #trailing>
        <TxButton variant="secondary" size="sm" :disabled="localBusy" @click="loadLocalSkills">
          {{ t('settings.skillsMcp.localDirs.rescan') }}
        </TxButton>
        <TxButton size="sm" :disabled="localBusy" @click="addLocalDir">
          {{ t('settings.skillsMcp.localDirs.addAction') }}
        </TxButton>
      </template>
    </SettingRow>
  </TuffGroupBlock>

  <TxModal
    v-model="dialogVisible"
    :title="
      draft.itemId
        ? t('settings.skillsMcp.dialog.editTitle')
        : t('settings.skillsMcp.dialog.createTitle')
    "
    width="560px"
  >
    <div class="SettingSkillsMcp-Dialog">
      <label class="SettingSkillsMcp-Field">
        <span class="SettingSkillsMcp-FieldLabel">{{ t('settings.skillsMcp.dialog.name') }}</span>
        <TxInput
          v-model="draft.name"
          :placeholder="t('settings.skillsMcp.dialog.namePlaceholder')"
          clearable
        />
      </label>

      <div class="SettingSkillsMcp-Field">
        <span class="SettingSkillsMcp-FieldLabel">
          {{ t('settings.skillsMcp.dialog.transport') }}
        </span>
        <div class="SettingSkillsMcp-Segmented">
          <button
            type="button"
            :aria-pressed="draft.transport === 'stdio'"
            :class="{ 'is-active': draft.transport === 'stdio' }"
            @click="draft.transport = 'stdio'"
          >
            {{ t('settings.skillsMcp.dialog.transportStdio') }}
          </button>
          <button
            type="button"
            :aria-pressed="draft.transport === 'streamable-http'"
            :class="{ 'is-active': draft.transport === 'streamable-http' }"
            @click="draft.transport = 'streamable-http'"
          >
            {{ t('settings.skillsMcp.dialog.transportHttp') }}
          </button>
        </div>
      </div>

      <template v-if="draft.transport === 'stdio'">
        <label class="SettingSkillsMcp-Field">
          <span class="SettingSkillsMcp-FieldLabel">
            {{ t('settings.skillsMcp.dialog.command') }}
          </span>
          <TxInput
            v-model="draft.command"
            :placeholder="t('settings.skillsMcp.dialog.commandPlaceholder')"
            clearable
          />
        </label>

        <label class="SettingSkillsMcp-Field">
          <span class="SettingSkillsMcp-FieldLabel">{{ t('settings.skillsMcp.dialog.args') }}</span>
          <TxInput
            v-model="draft.args"
            :placeholder="t('settings.skillsMcp.dialog.argsPlaceholder')"
            clearable
          />
        </label>

        <label class="SettingSkillsMcp-Field">
          <span class="SettingSkillsMcp-FieldLabel">{{ t('settings.skillsMcp.dialog.env') }}</span>
          <textarea
            v-model="draft.env"
            class="SettingSkillsMcp-Textarea"
            :placeholder="t('settings.skillsMcp.dialog.envPlaceholder')"
          />
          <span class="SettingSkillsMcp-FieldNote">
            {{ t('settings.skillsMcp.dialog.envNote') }}
          </span>
        </label>
      </template>

      <template v-else>
        <label class="SettingSkillsMcp-Field">
          <span class="SettingSkillsMcp-FieldLabel">{{ t('settings.skillsMcp.dialog.url') }}</span>
          <TxInput
            v-model="draft.url"
            :placeholder="t('settings.skillsMcp.dialog.urlPlaceholder')"
            clearable
          />
        </label>

        <label class="SettingSkillsMcp-Field">
          <span class="SettingSkillsMcp-FieldLabel">
            {{ t('settings.skillsMcp.dialog.headers') }}
          </span>
          <textarea
            v-model="draft.headers"
            class="SettingSkillsMcp-Textarea"
            :placeholder="t('settings.skillsMcp.dialog.headersPlaceholder')"
          />
          <span class="SettingSkillsMcp-FieldNote">
            {{ t('settings.skillsMcp.dialog.envNote') }}
          </span>
        </label>
      </template>
    </div>

    <template #footer>
      <div class="SettingSkillsMcp-DialogActions">
        <TxButton v-if="draft.itemId" variant="secondary" size="sm" @click="deleteDraftServer">
          {{ t('settings.skillsMcp.dialog.delete') }}
        </TxButton>
        <span class="SettingSkillsMcp-DialogSpacer" />
        <TxButton variant="secondary" size="sm" @click="dialogVisible = false">
          {{ t('settings.skillsMcp.dialog.cancel') }}
        </TxButton>
        <TxButton
          size="sm"
          :disabled="!draftValid"
          :loading="dialogSaving"
          @click="saveManualServer"
        >
          {{ t('settings.skillsMcp.dialog.save') }}
        </TxButton>
      </div>
    </template>
  </TxModal>
</template>

<style lang="scss" scoped>
.SettingSkillsMcp-Dialog {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.SettingSkillsMcp-Field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.SettingSkillsMcp-FieldLabel {
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-body);
}

.SettingSkillsMcp-FieldNote {
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);
  line-height: 1.5;
}

.SettingSkillsMcp-Textarea {
  min-height: 76px;
  padding: 8px 10px;
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-md);
  background: var(--shell-bg);
  color: var(--shell-text-primary);
  font-family: inherit;
  font-size: var(--shell-fs-body);
  resize: vertical;
  outline: none;

  &:focus {
    border-color: var(--shell-primary);
  }
}

.SettingSkillsMcp-Segmented {
  display: inline-flex;
  gap: 4px;
  align-self: flex-start;
  padding: 3px;
  border-radius: var(--shell-radius-md);
  background: var(--shell-surface-2);

  button {
    padding: 5px 14px;
    border: none;
    border-radius: var(--shell-radius-sm);
    background: transparent;
    color: var(--shell-text-secondary);
    font-family: inherit;
    font-size: var(--shell-fs-body);
    cursor: pointer;

    &.is-active {
      background: var(--shell-bg);
      color: var(--shell-text-primary);
    }
  }
}

.SettingSkillsMcp-DialogActions {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
}

.SettingSkillsMcp-DialogSpacer {
  flex: 1 1 auto;
}

/*
 * The address and the token are read character by character before being copied, so they are set in
 * a monospace face with the long ones allowed to scroll rather than wrap the row.
 */
.SettingsMcpHost-Code {
  max-width: 320px;
  overflow-x: auto;
  padding: 3px 8px;
  border-radius: var(--shell-radius-sm);
  background: var(--shell-surface-2);
  color: var(--shell-text-secondary);
  font-family: var(--shell-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: var(--shell-fs-sm);
  white-space: nowrap;
}

.SettingsMcpHost-Port {
  width: 104px;
}

.SettingsMcpHost-Snippet {
  max-height: 240px;
  margin: 10px 0;
  padding: 10px 12px;
  overflow: auto;
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-md);
  background: var(--shell-bg);
  color: var(--shell-text-secondary);
  font-family: var(--shell-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: var(--shell-fs-sm);
  line-height: 1.5;
  white-space: pre;
}
</style>
