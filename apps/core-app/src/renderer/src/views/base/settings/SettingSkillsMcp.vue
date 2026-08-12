<!--
  SettingSkillsMcp Component

  Skills and MCP servers, the two halves of what the home conversation can reach for beyond the
  model itself. Both are imported-config items in the orchestrator store, so listing, enabling and
  deleting ride the channels the Intelligence surface already uses; only liveness probing and
  hand-entering a server are new.
-->
<script lang="ts" name="SettingSkillsMcp" setup>
import type { AiImportedConfigItem } from '@talex-touch/tuff-intelligence'
import type { McpManualServerInput } from '@talex-touch/utils/transport/sdk/domains/mcp-servers'
import { TxInput } from '@talex-touch/tuffex/input'
import { TxModal } from '@talex-touch/tuffex/modal'
import { TxSwitch } from '@talex-touch/tuffex/switch'
import { TxTooltip } from '@talex-touch/tuffex/tooltip'
import { useIntelligenceSdk, useMcpServersSdk } from '@talex-touch/utils/renderer'
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import SettingButton from '~/components/settings/SettingButton.vue'
import SettingChip from '~/components/settings/SettingChip.vue'
import SettingDivider from '~/components/settings/SettingDivider.vue'
import SettingRow from '~/components/settings/SettingRow.vue'
import SettingSection from '~/components/settings/SettingSection.vue'
import { createRendererLogger } from '~/utils/renderer-log'
import {
  isManualMcpServer,
  parseCommandArgs,
  parseKeyValueLines,
  resolveMcpTransport
} from './setting-skills-mcp-display'

/** Row budget per section. Anything past it moves to the Intelligence surface. */
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

const IDLE_PROBE: ProbeState = { status: 'idle' }

const { t } = useI18n()
const router = useRouter()
const aiClient = useIntelligenceSdk()
const mcpSdk = useMcpServersSdk()
const skillsMcpLog = createRendererLogger('SettingSkillsMcp')

const items = ref<AiImportedConfigItem[]>([])
const loading = ref(true)
const loadError = ref('')
const probeStates = reactive(new Map<string, ProbeState>())

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

function byActiveThenName(left: AiImportedConfigItem, right: AiImportedConfigItem): number {
  if (left.active !== right.active) return left.active ? -1 : 1
  return displayName(left).localeCompare(displayName(right))
}

function quoteIfNeeded(value: string): string {
  return /\s/.test(value) ? `"${value}"` : value
}

const mcpServers = computed(() =>
  items.value.filter((item) => item.kind === 'mcp').sort(byActiveThenName)
)
const skills = computed(() =>
  items.value.filter((item) => item.kind === 'skill').sort(byActiveThenName)
)

const mcpRows = computed(() =>
  mcpServers.value.slice(0, MAX_VISIBLE_ROWS).map((item) => {
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
)

const skillRows = computed(() =>
  skills.value.slice(0, MAX_VISIBLE_ROWS).map((item) => {
    const description = item.normalizedProjection?.description
    return {
      item,
      title: displayName(item),
      description:
        typeof description === 'string' && description.trim()
          ? description.trim()
          : t('settings.skillsMcp.skills.noDescription', { provider: item.provider })
    }
  })
)

const hiddenMcpCount = computed(() => Math.max(mcpServers.value.length - MAX_VISIBLE_ROWS, 0))
const hiddenSkillCount = computed(() => Math.max(skills.value.length - MAX_VISIBLE_ROWS, 0))
const showStateRow = computed(() => loading.value && items.value.length === 0)

const addServerDescription = computed(() =>
  mcpServers.value.length === 0 && !loading.value && !loadError.value
    ? t('settings.skillsMcp.mcp.addDescEmpty')
    : t('settings.skillsMcp.mcp.addDesc')
)
const importSkillsDescription = computed(() =>
  skills.value.length === 0 && !loading.value && !loadError.value
    ? t('settings.skillsMcp.skills.importDescEmpty')
    : t('settings.skillsMcp.skills.importDesc')
)

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
    items.value = snapshot.importedItems
    loadError.value = ''
  } catch (error) {
    skillsMcpLog.error('Failed to read the orchestrator snapshot', error)
    loadError.value = errorMessage(error, t('settings.skillsMcp.loadFailedDesc'))
  } finally {
    loading.value = false
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
    await loadItems()
  } catch (error) {
    skillsMcpLog.error('Failed to delete the MCP server', error)
    toast.error(errorMessage(error, t('settings.skillsMcp.dialog.deleteFailed')))
  }
}

function openIntelligence(): void {
  void router.push('/intelligence')
}

onMounted(() => {
  void loadItems()
})
</script>

<template>
  <SettingSection v-if="loadError" :label="t('settings.skillsMcp.mcp.label')">
    <SettingRow :title="t('settings.skillsMcp.loadFailed')" :description="loadError">
      <template #trailing>
        <SettingButton variant="secondary" @click="loadItems">
          {{ t('settings.skillsMcp.retry') }}
        </SettingButton>
      </template>
    </SettingRow>
  </SettingSection>

  <SettingSection v-else :label="t('settings.skillsMcp.mcp.label')">
    <SettingRow v-if="showStateRow" :title="t('settings.skillsMcp.loading')" />

    <template v-for="(row, index) in mcpRows" :key="row.item.id">
      <SettingDivider v-if="index > 0 || showStateRow" />
      <SettingRow :title="row.title" :description="row.description">
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

          <SettingButton
            variant="secondary"
            :disabled="row.probe.status === 'probing'"
            @click="probeServer(row.item)"
          >
            {{ t('settings.skillsMcp.mcp.probe') }}
          </SettingButton>
          <SettingButton v-if="row.manual" variant="secondary" @click="openEditDialog(row.item)">
            {{ t('settings.skillsMcp.mcp.edit') }}
          </SettingButton>
          <TxSwitch
            :model-value="row.item.active"
            @update:model-value="(value) => setItemActive(row.item, Boolean(value))"
          />
        </template>
      </SettingRow>
    </template>

    <template v-if="hiddenMcpCount > 0">
      <SettingDivider />
      <SettingRow
        :title="t('settings.skillsMcp.mcp.viewAllTitle')"
        :description="t('settings.skillsMcp.mcp.viewAllDesc', { count: hiddenMcpCount })"
        navigable
        @activate="openIntelligence"
      />
    </template>

    <SettingDivider v-if="mcpRows.length > 0 || showStateRow" />
    <SettingRow :title="t('settings.skillsMcp.mcp.addTitle')" :description="addServerDescription">
      <template #trailing>
        <SettingButton @click="openCreateDialog">
          {{ t('settings.skillsMcp.mcp.addAction') }}
        </SettingButton>
      </template>
    </SettingRow>
  </SettingSection>

  <SettingSection :label="t('settings.skillsMcp.skills.label')">
    <SettingRow v-if="showStateRow" :title="t('settings.skillsMcp.loading')" />

    <template v-for="(row, index) in skillRows" :key="row.item.id">
      <SettingDivider v-if="index > 0 || showStateRow" />
      <SettingRow :title="row.title" :description="row.description">
        <template #trailing>
          <TxSwitch
            :model-value="row.item.active"
            @update:model-value="(value) => setItemActive(row.item, Boolean(value))"
          />
        </template>
      </SettingRow>
    </template>

    <template v-if="hiddenSkillCount > 0">
      <SettingDivider />
      <SettingRow
        :title="t('settings.skillsMcp.skills.viewAllTitle')"
        :description="t('settings.skillsMcp.skills.viewAllDesc', { count: hiddenSkillCount })"
        navigable
        @activate="openIntelligence"
      />
    </template>

    <SettingDivider v-if="skillRows.length > 0 || showStateRow" />
    <!-- Importing is the Intelligence surface's flow; duplicating its candidate list here would
         mean two places to keep in step with the scanner. -->
    <SettingRow
      :title="t('settings.skillsMcp.skills.importTitle')"
      :description="importSkillsDescription"
      navigable
      @activate="openIntelligence"
    />

    <SettingDivider />
    <SettingRow
      :title="t('settings.skillsMcp.skills.injectionTitle')"
      :description="t('settings.skillsMcp.skills.injectionDesc')"
    />
  </SettingSection>

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
        <SettingButton v-if="draft.itemId" variant="secondary" @click="deleteDraftServer">
          {{ t('settings.skillsMcp.dialog.delete') }}
        </SettingButton>
        <span class="SettingSkillsMcp-DialogSpacer" />
        <SettingButton variant="secondary" @click="dialogVisible = false">
          {{ t('settings.skillsMcp.dialog.cancel') }}
        </SettingButton>
        <SettingButton :disabled="!draftValid || dialogSaving" @click="saveManualServer">
          {{ t('settings.skillsMcp.dialog.save') }}
        </SettingButton>
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
</style>
