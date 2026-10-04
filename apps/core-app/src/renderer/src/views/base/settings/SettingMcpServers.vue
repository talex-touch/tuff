<!--
  SettingMcpServers Component

  The MCP servers the home conversation's agent runtime may start: the ones already adopted, the
  ones the agents on this machine define that nobody has adopted yet, and a way to type one in.

  A discovered server is listed, but adopting it is a click. Importing one enables a stdio command or
  an HTTP endpoint the agent runtime may then start, and that is a grant the user has to make rather
  than one this page makes for them.
-->
<script lang="ts" name="SettingMcpServers" setup>
import type { AiImportCandidate, AiImportedConfigItem } from '@talex-touch/tuff-intelligence'
import type { McpManualServerInput } from '@talex-touch/utils/transport/sdk/domains/mcp-servers'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxInput } from '@talex-touch/tuffex/input'
import { TxModal } from '@talex-touch/tuffex/modal'
import { useDeferredLoading } from '@talex-touch/tuffex/skeleton'
import { TxSwitch } from '@talex-touch/tuffex/switch'
import { TxTooltip } from '@talex-touch/tuffex/tooltip'
import { useIntelligenceSdk, useMcpServersSdk } from '@talex-touch/utils/renderer'
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import SettingChip from '~/components/settings/SettingChip.vue'
import SettingRow from '~/components/settings/SettingRow.vue'
import SettingSkeleton from '~/components/settings/SettingSkeleton.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { createRendererLogger } from '~/utils/renderer-log'
import { agentLabel, displayName, errorMessage, MAX_VISIBLE_ROWS } from './setting-ai-import-shared'
import {
  isManualMcpServer,
  parseCommandArgs,
  parseKeyValueLines,
  resolveMcpTransport
} from './setting-mcp-display'

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

const IDLE_PROBE: ProbeState = { status: 'idle' }

const i18n = useI18n()
const { t } = i18n
const aiClient = useIntelligenceSdk()
const mcpSdk = useMcpServersSdk()
const mcpServersLog = createRendererLogger('SettingMcpServers')

/** The snapshot's MCP items. Skills come from the same snapshot and are listed on their own page. */
const servers = ref<AiImportedConfigItem[]>([])
const loading = ref(true)
const loadError = ref('')
const probeStates = reactive(new Map<string, ProbeState>())
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

function quoteIfNeeded(value: string): string {
  return /\s/.test(value) ? `"${value}"` : value
}

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
  const sorted = servers.value.slice().sort(byActiveThenName)
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

const hiddenMcpCount = computed(() => Math.max(servers.value.length - MAX_VISIBLE_ROWS, 0))
const showStateRow = computed(() => loading.value && servers.value.length === 0)
const showMcpEmptyHint = computed(
  () =>
    !loading.value &&
    !loadError.value &&
    servers.value.length === 0 &&
    discoveredServers.value.length === 0
)

/**
 * Only the first load draws a skeleton. Binding to `loading` would also fire on
 * every retry, swapping already-rendered rows back out for placeholders; this
 * flag never returns to false once the first snapshot has landed.
 */
const hasLoaded = ref(false)
const showSkeleton = useDeferredLoading(() => !hasLoaded.value)

/**
 * The list is capped at `MAX_VISIBLE_ROWS` and always ends with the add row, so a
 * count inside that range is as close as a skeleton can get before the real one lands.
 */
const skeletonGroups = computed(() => [
  { label: t('settings.skillsMcp.mcp.label'), rows: 4, description: true, trailing: true }
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

async function loadItems(): Promise<void> {
  loading.value = true
  try {
    const snapshot = await aiClient.orchestratorGetSnapshot()
    servers.value = snapshot.importedItems.filter((item) => item.kind === 'mcp')
    loadError.value = ''
  } catch (error) {
    mcpServersLog.error('Failed to read the orchestrator snapshot', error)
    loadError.value = errorMessage(error, t('settings.skillsMcp.loadFailedDesc'))
  } finally {
    loading.value = false
    hasLoaded.value = true
  }
}

async function setItemActive(item: AiImportedConfigItem, active: boolean): Promise<void> {
  try {
    const updated = await aiClient.orchestratorSetImportedItemActive({ itemId: item.id, active })
    servers.value = servers.value.map((candidate) =>
      candidate.id === updated.id ? updated : candidate
    )
  } catch (error) {
    mcpServersLog.error('Failed to change the imported item state', error)
    toast.error(errorMessage(error, t('settings.skillsMcp.toggleFailed')))
    // A change that failed on the way back may still have landed, so the rows are read again
    // rather than left showing what this page last believed.
    void loadItems()
  }
}

/**
 * Finds the servers the local agents already define. A failed scan leaves those rows out rather
 * than blocking the section: the adopted servers still work, and the retry row is right there.
 */
async function refreshDiscovery(): Promise<void> {
  try {
    const scan = await aiClient.orchestratorPreviewImport({})
    scanId.value = scan.scanId
    discovered.value = scan.candidates
    scanFailed.value = false
  } catch (error) {
    mcpServersLog.error('Failed to scan local AI CLI configurations', error)
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
    mcpServersLog.error('Failed to adopt the discovered MCP server', error)
    toast.error(errorMessage(error, t('settings.skillsMcp.mcp.adoptFailed')))
  } finally {
    adoptingId.value = ''
  }
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
    mcpServersLog.error('MCP probe failed', error)
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
    mcpServersLog.error('Failed to save the manual MCP server', error)
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
    mcpServersLog.error('Failed to delete the MCP server', error)
    toast.error(errorMessage(error, t('settings.skillsMcp.dialog.deleteFailed')))
  }
}

onMounted(() => {
  void loadItems()
  void refreshDiscovery()
})
</script>

<template>
  <!--
    Stands in for the section on first load. The dialog further down stays outside
    the branch: the user opens it, not the initial fetch.
  -->
  <SettingSkeleton v-if="showSkeleton" :groups="skeletonGroups" />

  <!-- The card draws the hairline between its own rows, so none of these rows place one. -->
  <TuffGroupBlock v-else :name="t('settings.skillsMcp.mcp.label')">
    <SettingRow
      v-if="loadError"
      :title="t('settings.skillsMcp.loadFailed')"
      :description="loadError"
    >
      <template #trailing>
        <TxButton variant="secondary" size="sm" @click="loadItems">
          {{ t('settings.skillsMcp.retry') }}
        </TxButton>
      </template>
    </SettingRow>

    <template v-else>
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
          <TxButton
            v-if="row.manual"
            variant="secondary"
            size="sm"
            @click="openEditDialog(row.item)"
          >
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
          <SettingChip>{{ agentLabel(candidate.provider, i18n) }}</SettingChip>
          <SettingChip v-if="candidate.secretKeyPaths.length > 0" tone="warning">
            {{ t('settings.skillsMcp.mcp.secretChip') }}
          </SettingChip>
          <TxButton
            size="sm"
            :loading="adoptingId === candidate.id"
            @click="adoptServer(candidate)"
          >
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
    </template>
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
    <div class="SettingMcpServers-Dialog">
      <label class="SettingMcpServers-Field">
        <span class="SettingMcpServers-FieldLabel">{{ t('settings.skillsMcp.dialog.name') }}</span>
        <TxInput
          v-model="draft.name"
          :placeholder="t('settings.skillsMcp.dialog.namePlaceholder')"
          clearable
        />
      </label>

      <div class="SettingMcpServers-Field">
        <span class="SettingMcpServers-FieldLabel">
          {{ t('settings.skillsMcp.dialog.transport') }}
        </span>
        <div class="SettingMcpServers-Segmented">
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
        <label class="SettingMcpServers-Field">
          <span class="SettingMcpServers-FieldLabel">
            {{ t('settings.skillsMcp.dialog.command') }}
          </span>
          <TxInput
            v-model="draft.command"
            :placeholder="t('settings.skillsMcp.dialog.commandPlaceholder')"
            clearable
          />
        </label>

        <label class="SettingMcpServers-Field">
          <span class="SettingMcpServers-FieldLabel">
            {{ t('settings.skillsMcp.dialog.args') }}
          </span>
          <TxInput
            v-model="draft.args"
            :placeholder="t('settings.skillsMcp.dialog.argsPlaceholder')"
            clearable
          />
        </label>

        <label class="SettingMcpServers-Field">
          <span class="SettingMcpServers-FieldLabel">{{ t('settings.skillsMcp.dialog.env') }}</span>
          <textarea
            v-model="draft.env"
            class="SettingMcpServers-Textarea"
            :placeholder="t('settings.skillsMcp.dialog.envPlaceholder')"
          />
          <span class="SettingMcpServers-FieldNote">
            {{ t('settings.skillsMcp.dialog.envNote') }}
          </span>
        </label>
      </template>

      <template v-else>
        <label class="SettingMcpServers-Field">
          <span class="SettingMcpServers-FieldLabel">{{ t('settings.skillsMcp.dialog.url') }}</span>
          <TxInput
            v-model="draft.url"
            :placeholder="t('settings.skillsMcp.dialog.urlPlaceholder')"
            clearable
          />
        </label>

        <label class="SettingMcpServers-Field">
          <span class="SettingMcpServers-FieldLabel">
            {{ t('settings.skillsMcp.dialog.headers') }}
          </span>
          <textarea
            v-model="draft.headers"
            class="SettingMcpServers-Textarea"
            :placeholder="t('settings.skillsMcp.dialog.headersPlaceholder')"
          />
          <span class="SettingMcpServers-FieldNote">
            {{ t('settings.skillsMcp.dialog.envNote') }}
          </span>
        </label>
      </template>
    </div>

    <template #footer>
      <div class="SettingMcpServers-DialogActions">
        <TxButton v-if="draft.itemId" variant="secondary" size="sm" @click="deleteDraftServer">
          {{ t('settings.skillsMcp.dialog.delete') }}
        </TxButton>
        <span class="SettingMcpServers-DialogSpacer" />
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
.SettingMcpServers-Dialog {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.SettingMcpServers-Field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.SettingMcpServers-FieldLabel {
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-body);
}

.SettingMcpServers-FieldNote {
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);
  line-height: 1.5;
}

.SettingMcpServers-Textarea {
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

.SettingMcpServers-Segmented {
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

.SettingMcpServers-DialogActions {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
}

.SettingMcpServers-DialogSpacer {
  flex: 1 1 auto;
}
</style>
