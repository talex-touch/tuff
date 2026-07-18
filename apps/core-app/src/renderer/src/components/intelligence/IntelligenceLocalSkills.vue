<script setup name="IntelligenceLocalSkills" lang="ts">
import type {
  AiCliProviderId,
  AiImportCandidate,
  AiImportScanResult,
  AiImportedConfigItem,
  AiOrchestratorRunRecord,
  IntelligenceLocalEnvironmentSummary,
  IntelligenceLocalSkillGateStatus,
  IntelligenceLocalToolSummary
} from '@talex-touch/tuff-intelligence'
import type { IntelligenceLocalSkillChipDisplay } from '~/modules/intelligence/local-skills-display'
import { TxButton } from '@talex-touch/tuffex/button'
import { useIntelligenceSdk } from '@talex-touch/utils/renderer'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { buildIntelligenceLocalSkillsDisplayModel } from '~/modules/intelligence/local-skills-display'

const { t } = useI18n()
const aiClient = useIntelligenceSdk()

const environment = ref<IntelligenceLocalEnvironmentSummary | null>(null)
const loading = ref(false)
const error = ref('')
const importScan = ref<AiImportScanResult | null>(null)
const importedItems = ref<AiImportedConfigItem[]>([])
const pendingRuns = ref<AiOrchestratorRunRecord[]>([])
const selectedImportIds = ref<string[]>([])
const importLoading = ref(false)
const importApplying = ref(false)
const importOverrides = ref<Record<string, { alias: string; targetScope: 'global' | 'workspace' }>>(
  {}
)

const installedImportProviderCount = computed(
  () =>
    new Set(
      importScan.value?.sources
        .filter((source) => source.installed)
        .map((source) => source.provider)
    ).size
)
const importCandidates = computed(() => importScan.value?.candidates ?? [])
const importableCandidates = computed(() =>
  importCandidates.value.filter(
    (candidate) =>
      candidate.state !== 'source-missing' &&
      candidate.state !== 'invalid' &&
      candidate.blockingIssues.length === 0
  )
)
const hasSourceMissingCandidates = computed(() =>
  importCandidates.value.some(
    (candidate) =>
      candidate.state === 'source-missing' &&
      !importedItems.value.some(
        (item) => item.candidateId === candidate.id && item.state === 'source-missing'
      )
  )
)
const importCandidateGroups = computed(() => {
  const groups = new Map<
    string,
    {
      key: string
      provider: AiCliProviderId
      scope: AiImportCandidate['scope']
      kind: AiImportCandidate['kind']
      candidates: AiImportCandidate[]
    }
  >()
  for (const candidate of importCandidates.value) {
    const key = `${candidate.provider}:${candidate.scope}:${candidate.kind}`
    const group = groups.get(key) ?? {
      key,
      provider: candidate.provider,
      scope: candidate.scope,
      kind: candidate.kind,
      candidates: []
    }
    group.candidates.push(candidate)
    groups.set(key, group)
  }
  return [...groups.values()]
})

function candidateDescription(candidate: AiImportCandidate): string {
  if (candidate.kind === 'config' && candidate.sensitiveKeyPaths.length > 0) {
    return t('settings.intelligence.localSkills.importSensitiveKeysIgnored', {
      count: candidate.sensitiveKeyPaths.length
    })
  }
  if (candidate.kind === 'mcp' && candidate.secretKeyPaths.length > 0) {
    return t('settings.intelligence.localSkills.importSensitiveKeys', {
      count: candidate.secretKeyPaths.length
    })
  }
  return candidate.path
}

function candidateRequiresSecretMigration(candidate: AiImportCandidate): boolean {
  return candidate.kind === 'mcp' && candidate.secretKeyPaths.length > 0
}

function importedItemStatus(item: AiImportedConfigItem): string {
  if (!item.active) return t('settings.intelligence.localSkills.importedState.disabled')
  if (item.secrets.some((secret) => secret.reauthRequired)) {
    return t('settings.intelligence.localSkills.importedState.reauthRequired')
  }
  return t(`settings.intelligence.localSkills.importedState.${item.state}`)
}

function selectAllImports(): void {
  selectedImportIds.value = importableCandidates.value.map((candidate) => candidate.id)
}

function clearImportSelection(): void {
  selectedImportIds.value = []
}

async function previewImport(providerIds?: AiCliProviderId[]): Promise<void> {
  if (importLoading.value) return
  importLoading.value = true
  try {
    importScan.value = await aiClient.orchestratorPreviewImport(
      providerIds ? { providerIds } : undefined
    )
    selectedImportIds.value = importScan.value.candidates
      .filter(
        (candidate) =>
          candidate.state !== 'source-missing' &&
          candidate.state !== 'invalid' &&
          candidate.blockingIssues.length === 0
      )
      .map((candidate) => candidate.id)
    importOverrides.value = Object.fromEntries(
      importScan.value.candidates.map((candidate) => [
        candidate.id,
        { alias: '', targetScope: candidate.targetScope }
      ])
    )
  } catch (err) {
    toast.error(
      err instanceof Error ? err.message : t('settings.intelligence.localSkills.importFailed')
    )
  } finally {
    importLoading.value = false
  }
}

async function previewImportSource(provider: AiCliProviderId): Promise<void> {
  await previewImport([provider])
}

async function applyImport(): Promise<void> {
  if (
    !importScan.value ||
    (selectedImportIds.value.length === 0 && !hasSourceMissingCandidates.value) ||
    importApplying.value
  )
    return
  const selectedIds = new Set(selectedImportIds.value)
  const secretCandidateCount = importScan.value.candidates.filter(
    (candidate) => selectedIds.has(candidate.id) && candidateRequiresSecretMigration(candidate)
  ).length
  const confirmSecretMigration =
    secretCandidateCount > 0 &&
    window.confirm(
      t('settings.intelligence.localSkills.importSecretMigrationConfirm', {
        count: secretCandidateCount
      })
    )
  if (secretCandidateCount > 0 && !confirmSecretMigration) return

  importApplying.value = true
  try {
    const result = await aiClient.orchestratorApplyImport({
      scanId: importScan.value.scanId,
      candidateIds: selectedImportIds.value,
      overrides: Object.fromEntries(
        selectedImportIds.value.map((candidateId) => [
          candidateId,
          importOverrides.value[candidateId] ?? { alias: '', targetScope: 'global' }
        ])
      ),
      confirmSecretMigration
    })
    toast.success(
      t('settings.intelligence.localSkills.importSuccess', {
        imported: result.imported,
        unchanged: result.unchanged,
        removed: result.removed
      })
    )
    const reauthRequired = result.items.filter((item) => item.status === 'reauth-required').length
    if (reauthRequired > 0) {
      toast.warning(
        t('settings.intelligence.localSkills.importReauthRequired', { count: reauthRequired })
      )
    }
    const failed = result.items.filter((item) => item.status === 'failed').length
    if (failed > 0) {
      toast.error(t('settings.intelligence.localSkills.importPartialFailure', { count: failed }))
    }
    await refreshImportedItems()
  } catch (err) {
    toast.error(
      err instanceof Error ? err.message : t('settings.intelligence.localSkills.importFailed')
    )
  } finally {
    importApplying.value = false
  }
}

const skillDisplay = computed(() =>
  buildIntelligenceLocalSkillsDisplayModel(environment.value?.skillProviders ?? [])
)
const installedTools = computed(
  () => environment.value?.tools.filter((tool) => tool.installed) ?? []
)
const installedSkills = computed(() => skillDisplay.value.installedSkills)
const enabledSkills = computed(() => skillDisplay.value.enabledSkills)
const readySkills = computed(() => skillDisplay.value.readySkills)
const approvalRequiredSkills = computed(() => skillDisplay.value.approvalRequiredSkills)
const unavailableSkills = computed(() => skillDisplay.value.unavailableSkills)
const installedGatedSkills = computed(() => skillDisplay.value.installedGatedSkills)
const configFileCount = computed(
  () => environment.value?.configFiles.filter((file) => file.exists).length ?? 0
)
const sceneHintCount = computed(() => skillDisplay.value.sceneIds.length)
const visibleSkillChips = computed(() => skillDisplay.value.visibleSkillChips)

function formatToolNames(): string {
  if (!environment.value) return t('settings.intelligence.localSkills.loading')
  if (installedTools.value.length === 0) return t('settings.intelligence.localSkills.noTools')
  return installedTools.value.map((tool) => tool.name).join(' / ')
}

function formatSkillNames(): string {
  if (!environment.value) return t('settings.intelligence.localSkills.loading')
  if (installedSkills.value.length === 0) return t('settings.intelligence.localSkills.noSkills')
  const names = enabledSkills.value
    .slice(0, 4)
    .map((skill) => skill.name)
    .join(' / ')
  return names || t('settings.intelligence.localSkills.noReadySkills')
}

function formatConfigSummary(): string {
  if (!environment.value) return t('settings.intelligence.localSkills.loading')
  return t('settings.intelligence.localSkills.configSummary', {
    count: configFileCount.value
  })
}

function formatGateSummary(): string {
  if (!environment.value) return t('settings.intelligence.localSkills.loading')
  return t('settings.intelligence.localSkills.gateSummary', {
    ready: readySkills.value.length,
    approval: approvalRequiredSkills.value.length,
    unavailable: unavailableSkills.value.length,
    scenes: sceneHintCount.value
  })
}

function gateStatusLabel(status: IntelligenceLocalSkillGateStatus): string {
  return t(`settings.intelligence.localSkills.gateStatus.${status}`)
}

function formatToolPath(tool: IntelligenceLocalToolSummary): string {
  return tool.executablePath || tool.configRoots[0] || tool.id
}

function toolChipTitle(tool: IntelligenceLocalToolSummary): string {
  const lines = [tool.name]
  if (tool.executablePath) {
    lines.push(tool.executablePath)
  }
  if (tool.configRoots.length) {
    lines.push(...tool.configRoots)
  }
  return lines.join('\n')
}

function skillChipTitle(skill: IntelligenceLocalSkillChipDisplay): string {
  if (skill.sceneIds.length === 0) {
    return gateStatusLabel(skill.status)
  }
  return `${gateStatusLabel(skill.status)} / ${skill.sceneIds.join(' / ')}`
}

async function refreshImportedItems(): Promise<void> {
  const snapshot = await aiClient.orchestratorGetSnapshot()
  importedItems.value = snapshot.importedItems
  pendingRuns.value = snapshot.recentRuns.filter((run) => run.status === 'pending_approval')
}
async function approveRun(run: AiOrchestratorRunRecord): Promise<void> {
  try {
    await aiClient.orchestratorApprove({ runId: run.id })
    await refreshImportedItems()
  } catch (err) {
    toast.error(
      err instanceof Error ? err.message : t('settings.intelligence.localSkills.approvalFailed')
    )
  }
}

async function cancelRun(run: AiOrchestratorRunRecord): Promise<void> {
  try {
    await aiClient.orchestratorCancel({ runId: run.id })
    await refreshImportedItems()
  } catch (err) {
    toast.error(
      err instanceof Error ? err.message : t('settings.intelligence.localSkills.approvalFailed')
    )
  }
}

async function runImportedMutation(mutation: () => Promise<void>): Promise<void> {
  try {
    await mutation()
  } catch (err) {
    toast.error(
      err instanceof Error
        ? err.message
        : t('settings.intelligence.localSkills.importManagementFailed')
    )
  }
}

async function setImportedItemActive(item: AiImportedConfigItem): Promise<void> {
  await runImportedMutation(async () => {
    const updated = await aiClient.orchestratorSetImportedItemActive({
      itemId: item.id,
      active: !item.active
    })
    importedItems.value = importedItems.value.map((candidate) =>
      candidate.id === updated.id ? updated : candidate
    )
  })
}

async function cloneImportedItem(item: AiImportedConfigItem): Promise<void> {
  await runImportedMutation(async () => {
    await aiClient.orchestratorCloneImportedItem({ itemId: item.id })
    await refreshImportedItems()
  })
}

async function deleteImportedItem(item: AiImportedConfigItem): Promise<void> {
  if (
    !window.confirm(
      t('settings.intelligence.localSkills.importedDeleteConfirm', {
        name: item.alias || item.name
      })
    )
  )
    return
  await runImportedMutation(async () => {
    await aiClient.orchestratorDeleteImportedItem({ itemId: item.id })
    await refreshImportedItems()
  })
}

async function refreshEnvironment(): Promise<void> {
  if (loading.value) return
  loading.value = true
  error.value = ''
  try {
    environment.value = await aiClient.getLocalEnvironment()
  } catch (err) {
    error.value =
      err instanceof Error ? err.message : t('settings.intelligence.localSkills.refreshFailed')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  refreshEnvironment()
  previewImport()
  refreshImportedItems().catch((err) => {
    toast.error(
      err instanceof Error ? err.message : t('settings.intelligence.localSkills.refreshFailed')
    )
  })
})
</script>

<template>
  <TuffGroupBlock
    :name="t('settings.intelligence.localSkills.title')"
    :description="t('settings.intelligence.localSkills.desc')"
    default-icon="i-carbon-tool-kit"
    active-icon="i-carbon-tool-kit"
    memory-name="intelligence-local-skills"
  >
    <TuffBlockSlot
      :title="t('settings.intelligence.localSkills.toolsTitle')"
      :description="formatToolNames()"
      default-icon="i-carbon-terminal"
      active-icon="i-carbon-terminal"
    >
      <span class="local-skills__stat">
        {{ installedTools.length }}/{{ environment?.tools.length ?? 2 }}
      </span>
    </TuffBlockSlot>

    <TuffBlockSlot
      :title="t('settings.intelligence.localSkills.providersTitle')"
      :description="formatSkillNames()"
      default-icon="i-carbon-ibm-watson-discovery"
      active-icon="i-carbon-ibm-watson-discovery"
    >
      <span class="local-skills__stat">
        {{ enabledSkills.length }}/{{ installedSkills.length }}
      </span>
    </TuffBlockSlot>

    <TuffBlockSlot
      :title="t('settings.intelligence.localSkills.gateTitle')"
      :description="formatGateSummary()"
      default-icon="i-carbon-rule"
      active-icon="i-carbon-rule"
    >
      <span class="local-skills__stat">
        {{ readySkills.length }}/{{ installedSkills.length }}
      </span>
    </TuffBlockSlot>

    <TuffBlockSlot
      :title="t('settings.intelligence.localSkills.configTitle')"
      :description="error || formatConfigSummary()"
      default-icon="i-carbon-document-configuration"
      active-icon="i-carbon-document-configuration"
    >
      <TxButton variant="flat" :loading="loading" @click.stop="refreshEnvironment">
        <i class="i-carbon-renew" />
        <span>{{ t('settings.intelligence.localSkills.refresh') }}</span>
      </TxButton>
      <TxButton variant="flat" :loading="importLoading" @click.stop="previewImport()">
        <i class="i-carbon-document-import" />
        <span>{{ t('settings.intelligence.localSkills.importPreview') }}</span>
      </TxButton>
    </TuffBlockSlot>

    <div v-if="environment" class="local-skills__chips">
      <span
        v-for="tool in installedTools"
        :key="tool.id"
        class="local-skills__tool-chip"
        :title="toolChipTitle(tool)"
      >
        <i class="i-carbon-terminal" aria-hidden="true" />
        <span>{{ tool.name }}</span>
        <span class="local-skills__tool-path">
          {{ formatToolPath(tool) }}
        </span>
      </span>
      <span
        v-for="skill in visibleSkillChips"
        :key="skill.id"
        class="local-skills__chip"
        :class="`is-${skill.status}`"
        :title="skillChipTitle(skill)"
      >
        <span>{{ skill.name }}</span>
        <span class="local-skills__chip-status">
          {{ gateStatusLabel(skill.status) }}
        </span>
        <span v-if="skill.scenePreview.length" class="local-skills__chip-scenes">
          {{ skill.scenePreview.join(' / ') }}
          <span v-if="skill.sceneOverflow">+{{ skill.sceneOverflow }}</span>
        </span>
      </span>
      <span v-if="installedGatedSkills.length" class="local-skills__hint">
        {{
          t('settings.intelligence.localSkills.gatedHint', {
            count: installedGatedSkills.length
          })
        }}
      </span>
    </div>
    <section v-if="pendingRuns.length > 0" class="local-skills__import">
      <div class="local-skills__import-header">
        <div>
          <strong>{{ t('settings.intelligence.localSkills.approvalTitle') }}</strong>
          <p>
            {{
              t('settings.intelligence.localSkills.approvalSummary', { count: pendingRuns.length })
            }}
          </p>
        </div>
      </div>
      <div class="local-skills__candidate-list">
        <div v-for="run in pendingRuns" :key="run.id" class="local-skills__candidate">
          <span class="local-skills__candidate-main">
            <span class="local-skills__candidate-name">{{ run.objective }}</span>
            <span class="local-skills__candidate-path">{{ run.approvalReason }}</span>
          </span>
          <span class="local-skills__item-actions">
            <TxButton variant="primary" size="small" @click="approveRun(run)">
              {{ t('settings.intelligence.localSkills.approvalApprove') }}
            </TxButton>
            <TxButton variant="flat" size="small" @click="cancelRun(run)">
              {{ t('settings.intelligence.localSkills.approvalCancel') }}
            </TxButton>
          </span>
        </div>
      </div>
    </section>

    <section v-if="importedItems.length > 0" class="local-skills__import">
      <div class="local-skills__import-header">
        <div>
          <strong>{{ t('settings.intelligence.localSkills.importedTitle') }}</strong>
          <p>
            {{
              t('settings.intelligence.localSkills.importedSummary', {
                count: importedItems.length
              })
            }}
          </p>
        </div>
      </div>
      <div class="local-skills__candidate-list">
        <div v-for="item in importedItems" :key="item.id" class="local-skills__candidate">
          <span class="local-skills__candidate-main">
            <span class="local-skills__candidate-name">{{ item.alias || item.name }}</span>
            <span class="local-skills__candidate-meta">
              {{ item.provider }} · {{ item.targetScope }} · {{ item.kind }} ·
              {{ importedItemStatus(item) }}
            </span>
          </span>
          <span class="local-skills__item-actions">
            <TxButton variant="flat" size="small" @click="setImportedItemActive(item)">
              {{
                item.active
                  ? t('settings.intelligence.localSkills.importedDisable')
                  : t('settings.intelligence.localSkills.importedEnable')
              }}
            </TxButton>
            <TxButton variant="flat" size="small" @click="cloneImportedItem(item)">
              {{ t('settings.intelligence.localSkills.importedClone') }}
            </TxButton>
            <TxButton variant="flat" size="small" @click="deleteImportedItem(item)">
              {{ t('settings.intelligence.localSkills.importedDelete') }}
            </TxButton>
          </span>
        </div>
      </div>
    </section>

    <section v-if="importScan" class="local-skills__import">
      <div class="local-skills__import-header">
        <div>
          <strong>{{ t('settings.intelligence.localSkills.importTitle') }}</strong>
          <p>
            {{
              t('settings.intelligence.localSkills.importSummary', {
                sources: installedImportProviderCount,
                candidates: importCandidates.length
              })
            }}
          </p>
        </div>
        <div class="local-skills__import-actions">
          <TxButton variant="flat" size="small" @click="selectAllImports">
            {{ t('settings.intelligence.localSkills.importSelectAll') }}
          </TxButton>
          <TxButton variant="flat" size="small" @click="clearImportSelection">
            {{ t('settings.intelligence.localSkills.importClear') }}
          </TxButton>
          <TxButton
            variant="primary"
            size="small"
            :loading="importApplying"
            :disabled="selectedImportIds.length === 0 && !hasSourceMissingCandidates"
            @click="applyImport"
          >
            {{
              selectedImportIds.length === 0
                ? t('settings.intelligence.localSkills.importSyncMissing')
                : t('settings.intelligence.localSkills.importApply', {
                    count: selectedImportIds.length
                  })
            }}
          </TxButton>
        </div>
      </div>

      <div class="local-skills__source-list">
        <button
          v-for="source in importScan.sources"
          :key="source.id"
          type="button"
          class="local-skills__source-chip"
          :class="{ 'is-missing': !source.installed }"
          :title="source.rootPath"
          @click="previewImportSource(source.provider)"
        >
          <i :class="source.installed ? 'i-carbon-checkmark' : 'i-carbon-close'" />
          {{ source.label }}
        </button>
      </div>

      <div class="local-skills__candidate-groups">
        <section v-for="group in importCandidateGroups" :key="group.key">
          <div class="local-skills__candidate-group-title">
            {{ group.provider }} · {{ group.scope }} · {{ group.kind }}
          </div>
          <div class="local-skills__candidate-list">
            <label
              v-for="candidate in group.candidates"
              :key="candidate.id"
              class="local-skills__candidate"
            >
              <input
                v-model="selectedImportIds"
                type="checkbox"
                :value="candidate.id"
                :disabled="
                  candidate.state === 'source-missing' ||
                  candidate.state === 'invalid' ||
                  candidate.blockingIssues.length > 0
                "
              />
              <span class="local-skills__candidate-main">
                <span class="local-skills__candidate-name">{{ candidate.name }}</span>
                <span class="local-skills__candidate-meta">{{ candidate.state }}</span>
                <span class="local-skills__candidate-path">
                  {{ candidateDescription(candidate) }}
                </span>
                <span v-if="candidate.ignoredFields.length" class="local-skills__candidate-path">
                  {{
                    t('settings.intelligence.localSkills.importIgnoredFields', {
                      count: candidate.ignoredFields.length
                    })
                  }}
                </span>
                <span v-if="candidate.blockingIssues.length" class="local-skills__candidate-path">
                  {{
                    t('settings.intelligence.localSkills.importBlockingIssues', {
                      issues: candidate.blockingIssues.join(' / ')
                    })
                  }}
                </span>
                <span
                  v-if="candidate.blockingIssues.length === 0 && importOverrides[candidate.id]"
                  class="local-skills__candidate-overrides"
                  @click.stop
                >
                  <input
                    v-model="importOverrides[candidate.id].alias"
                    type="text"
                    :placeholder="t('settings.intelligence.localSkills.importAlias')"
                    @click.stop
                  />
                  <select v-model="importOverrides[candidate.id].targetScope" @click.stop>
                    <option value="global">
                      {{ t('settings.intelligence.localSkills.importScopeGlobal') }}
                    </option>
                    <option value="workspace">
                      {{ t('settings.intelligence.localSkills.importScopeWorkspace') }}
                    </option>
                  </select>
                </span>
              </span>
            </label>
          </div>
        </section>
        <div v-if="importCandidates.length === 0" class="local-skills__candidate-empty">
          {{ t('settings.intelligence.localSkills.importEmpty') }}
        </div>
      </div>
    </section>
  </TuffGroupBlock>
</template>

<style lang="scss" scoped>
.local-skills__stat {
  min-width: 48px;
  text-align: right;
  font-size: 13px;
  font-weight: 600;
  color: var(--tx-text-color-secondary);
}

.local-skills__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 16px 12px;
}

.local-skills__chip,
.local-skills__tool-chip,
.local-skills__hint {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 24px;
  padding: 0 8px;
  border-radius: 8px;
  font-size: 12px;
  color: var(--tx-text-color-secondary);
  background: var(--tx-fill-color-light);
}

.local-skills__tool-chip {
  max-width: 100%;
  color: var(--tx-text-color-primary);
}

.local-skills__tool-path {
  max-width: min(520px, 48vw);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--tx-color-primary);
}

.local-skills__chip-status {
  color: var(--tx-text-color-placeholder);
}

.local-skills__chip-scenes {
  color: var(--tx-color-primary);
}

.local-skills__chip.is-approval_required {
  color: var(--tx-color-warning);
}

.local-skills__chip.is-unavailable {
  color: var(--tx-text-color-placeholder);
}

.local-skills__hint {
  color: var(--tx-text-color-placeholder);
}

.local-skills__import {
  margin: 8px 16px 16px;
  padding: 12px;
  border: 1px solid var(--tx-border-color-lighter);
  border-radius: 10px;
  background: var(--tx-fill-color-lighter);
}

.local-skills__import-header,
.local-skills__import-actions,
.local-skills__source-list {
  display: flex;
  align-items: center;
  gap: 8px;
}

.local-skills__import-header {
  justify-content: space-between;

  strong {
    color: var(--tx-text-color-primary);
    font-size: 13px;
  }

  p {
    margin: 4px 0 0;
    color: var(--tx-text-color-secondary);
    font-size: 12px;
  }
}

.local-skills__source-list {
  flex-wrap: wrap;
  margin-top: 10px;
}

.local-skills__source-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 7px;
  border-radius: 7px;
  color: var(--tx-color-success);
  background: var(--tx-fill-color-light);
  border: 0;
  cursor: pointer;
  font-size: 11px;

  &.is-missing {
    color: var(--tx-text-color-placeholder);
  }
}

.local-skills__candidate-groups {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
}

.local-skills__candidate-group-title {
  margin-bottom: 4px;
  color: var(--tx-text-color-secondary);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}

.local-skills__candidate-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 6px;
  max-height: 320px;
  margin-top: 10px;
  overflow: auto;
}

.local-skills__candidate {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px;
  border-radius: 8px;
  background: var(--tx-bg-color);
  cursor: pointer;
}

.local-skills__item-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-left: auto;
}

.local-skills__candidate-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.local-skills__candidate-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--tx-text-color-primary);
}

.local-skills__candidate-meta,
.local-skills__candidate-path,
.local-skills__candidate-empty {
  font-size: 11px;
  color: var(--tx-text-color-secondary);
}

.local-skills__candidate-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.local-skills__candidate-overrides {
  display: flex;
  gap: 6px;
  margin-top: 4px;

  input,
  select {
    min-width: 0;
    height: 24px;
    padding: 0 6px;
    border: 1px solid var(--tx-border-color);
    border-radius: 6px;
    color: var(--tx-text-color-primary);
    background: var(--tx-bg-color);
    font-size: 11px;
  }

  input {
    flex: 1;
  }
}
</style>
