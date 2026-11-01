<script setup lang="ts" name="SettingLocalAiCliImport">
import type { DialogButton } from '@talex-touch/tuffex/dialog'
import type {
  AiCliProviderId,
  AiConfigImportCandidate,
  AiImportApplyRequest,
  AiImportScanResult
} from '@talex-touch/utils/types/ai-orchestrator'
import { TxBottomDialog } from '@talex-touch/tuffex/dialog'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxDrawer } from '@talex-touch/tuffex/drawer'
import { TxEmptyState } from '@talex-touch/tuffex/empty-state'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import { useIntelligenceSdk } from '@talex-touch/utils/renderer'
import { computed, reactive, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import { createRendererLogger } from '~/utils/renderer-log'

const LOCAL_CLI_PROVIDERS: AiCliProviderId[] = ['pi', 'oh-my-pi', 'codex', 'claude', 'opencode']
const PROVIDER_LABELS: Record<AiCliProviderId, string> = {
  pi: 'Pi',
  'oh-my-pi': 'Oh My Pi',
  codex: 'Codex',
  claude: 'Claude Code',
  opencode: 'OpenCode'
}

interface SecretConfirmRequest {
  count: number
  settled: boolean
  resolve: (confirmed: boolean) => void
}

const { t } = useI18n()
const aiClient = useIntelligenceSdk()
const log = createRendererLogger('SettingLocalAiCliImport')

const drawerVisible = ref(false)
const loading = ref(false)
const applying = ref(false)
const scan = shallowRef<AiImportScanResult | null>(null)
const selectedCandidateIds = reactive(new Set<string>())
const selectedProviderIds = reactive<Record<string, string[]>>({})
const secretConfirm = shallowRef<SecretConfirmRequest | null>(null)

const modelCandidates = computed<AiConfigImportCandidate[]>(() => {
  const candidates = scan.value?.candidates ?? []
  return candidates.filter(
    (candidate): candidate is AiConfigImportCandidate =>
      candidate.kind === 'config' && (candidate.modelProviders?.length ?? 0) > 0
  )
})

const selectedCandidates = computed(() =>
  modelCandidates.value.filter((candidate) => selectedCandidateIds.has(candidate.id))
)

const selectedCount = computed(() => selectedCandidates.value.length)
const selectedSecretCount = computed(() =>
  selectedCandidates.value.reduce(
    (count, candidate) =>
      count +
      (candidate.modelProviders ?? []).filter(
        (provider) => provider.hasApiKey && modelProviderIds(candidate).includes(provider.id)
      ).length,
    0
  )
)

const secretConfirmButtons = computed<DialogButton[]>(() => [
  {
    content: t('settingLocalAiCli.import.cancel'),
    type: 'info',
    onClick: () => settleSecretConfirm(false)
  },
  {
    content: t('settingLocalAiCli.import.confirmSecrets'),
    type: 'success',
    onClick: () => settleSecretConfirm(true)
  }
])

function providerLabel(provider: AiCliProviderId): string {
  return PROVIDER_LABELS[provider] ?? provider
}

function scopeLabel(scope: AiConfigImportCandidate['scope']): string {
  return scope === 'user'
    ? t('settingLocalAiCli.import.global')
    : t('settingLocalAiCli.import.workspace')
}

function importErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string')
    return (error as { code: string }).code
  if (error instanceof Error) return error.message.split(':', 1)[0] ?? ''
  return typeof error === 'string' ? (error.split(':', 1)[0] ?? '') : ''
}

function allModelProviderIds(candidate: AiConfigImportCandidate): string[] {
  return (candidate.modelProviders ?? []).map((provider) => provider.id)
}

function modelProviderIds(candidate: AiConfigImportCandidate): string[] {
  return selectedProviderIds[candidate.id] ?? allModelProviderIds(candidate)
}

function isCandidateSelected(candidate: AiConfigImportCandidate): boolean {
  return selectedCandidateIds.has(candidate.id)
}

function isModelProviderSelected(candidate: AiConfigImportCandidate, providerId: string): boolean {
  return modelProviderIds(candidate).includes(providerId)
}

function resetSelection(): void {
  selectedCandidateIds.clear()
  for (const key of Object.keys(selectedProviderIds)) delete selectedProviderIds[key]
}

function selectAll(): void {
  resetSelection()
  for (const candidate of modelCandidates.value) {
    selectedCandidateIds.add(candidate.id)
    selectedProviderIds[candidate.id] = allModelProviderIds(candidate)
  }
}

function toggleCandidate(candidate: AiConfigImportCandidate, selected: boolean): void {
  if (selected) {
    selectedCandidateIds.add(candidate.id)
    selectedProviderIds[candidate.id] = allModelProviderIds(candidate)
  } else {
    selectedCandidateIds.delete(candidate.id)
    delete selectedProviderIds[candidate.id]
  }
}

function toggleModelProvider(
  candidate: AiConfigImportCandidate,
  providerId: string,
  selected: boolean
): void {
  const next = new Set(modelProviderIds(candidate))
  if (selected) next.add(providerId)
  else next.delete(providerId)
  selectedProviderIds[candidate.id] = [...next]
  if (next.size > 0) selectedCandidateIds.add(candidate.id)
  else selectedCandidateIds.delete(candidate.id)
}

function confirmSecretMigration(count: number): Promise<boolean> {
  secretConfirm.value?.resolve(false)
  return new Promise((resolve) => {
    secretConfirm.value = { count, settled: false, resolve }
  })
}

function settleSecretConfirm(confirmed: boolean): boolean {
  const request = secretConfirm.value
  if (!request || request.settled) return true
  request.settled = true
  request.resolve(confirmed)
  secretConfirm.value = null
  return true
}

function closeSecretConfirm(): void {
  settleSecretConfirm(false)
}

async function refreshScan(force = false): Promise<void> {
  if (loading.value || (applying.value && !force)) return
  loading.value = true
  try {
    const next = await aiClient.orchestratorPreviewImport({ providerIds: LOCAL_CLI_PROVIDERS })
    scan.value = next
    selectAll()
  } catch (error) {
    log.error('Failed to scan local CLI model configuration', error)
    scan.value = null
    resetSelection()
    toast.error(t('settingLocalAiCli.import.scanFailed'))
  } finally {
    loading.value = false
  }
}

async function openImport(): Promise<void> {
  drawerVisible.value = true
  await refreshScan()
}

function importRequest(): AiImportApplyRequest | null {
  const current = scan.value
  const candidates = selectedCandidates.value.filter(
    (candidate) => modelProviderIds(candidate).length > 0
  )
  if (!current || candidates.length === 0) return null

  return {
    scanId: current.scanId,
    candidateIds: candidates.map((candidate) => candidate.id),
    modelProviders: Object.fromEntries(
      candidates.map((candidate) => [candidate.id, { include: modelProviderIds(candidate) }])
    )
  }
}

async function applyImport(): Promise<void> {
  if (applying.value) return
  const request = importRequest()
  if (!request) {
    toast.error(t('settingLocalAiCli.import.selectAtLeastOne'))
    return
  }

  applying.value = true
  let confirmed = false
  try {
    for (;;) {
      try {
        const result = await aiClient.orchestratorApplyImport({
          ...request,
          ...(confirmed ? { confirmSecretMigration: true } : {})
        })
        toast.success(
          t('settingLocalAiCli.import.success', {
            imported: result.imported,
            unchanged: result.unchanged
          })
        )
        drawerVisible.value = false
        return
      } catch (error) {
        const code = importErrorCode(error)
        if (code === 'AI_IMPORT_SECRET_CONFIRMATION_REQUIRED' && !confirmed) {
          const count = Math.max(1, selectedSecretCount.value)
          if (!(await confirmSecretMigration(count))) return
          confirmed = true
          continue
        }
        if (code === 'AI_IMPORT_SOURCE_CHANGED') {
          toast.error(t('settingLocalAiCli.import.sourceChanged'))
          await refreshScan(true)
          return
        }
        log.error('Failed to import local CLI model configuration', error)
        toast.error(t('settingLocalAiCli.import.failed'))
        return
      }
    }
  } finally {
    applying.value = false
  }
}
</script>

<template>
  <TuffBlockSlot
    :title="t('settingLocalAiCli.import.title')"
    :description="t('settingLocalAiCli.import.description')"
    default-icon="i-carbon-import-export"
    active-icon="i-carbon-import-export"
  >
    <TxButton
      variant="flat"
      size="sm"
      :loading="loading"
      :disabled="applying"
      data-testid="local-ai-cli-import-open"
      @click.stop="openImport"
    >
      <i v-if="!loading" class="i-carbon-search" aria-hidden="true" />
      <span>{{ t('settingLocalAiCli.import.action') }}</span>
    </TxButton>
  </TuffBlockSlot>

  <TxDrawer
    v-model:visible="drawerVisible"
    :title="t('settingLocalAiCli.import.drawerTitle')"
    :close-label="t('common.close')"
    size="620px"
  >
    <div class="LocalAiCliImport" :aria-busy="loading">
      <div v-if="loading" class="LocalAiCliImport-Skeleton" aria-hidden="true">
        <TxSkeleton v-for="index in 4" :key="index" width="100%" height="72px" :radius="10" />
      </div>

      <TxEmptyState
        v-else-if="modelCandidates.length === 0"
        variant="empty"
        surface="card"
        :title="t('settingLocalAiCli.import.emptyTitle')"
        :description="t('settingLocalAiCli.import.emptyDescription')"
        data-testid="local-ai-cli-import-empty"
      />

      <template v-else>
        <div class="LocalAiCliImport-Summary">
          <p>
            {{
              t('settingLocalAiCli.import.summary', {
                sources: scan?.sources.filter((source) => source.installed).length ?? 0,
                candidates: modelCandidates.length
              })
            }}
          </p>
          <div class="LocalAiCliImport-SelectionActions">
            <TxButton variant="ghost" size="sm" :disabled="applying" @click="selectAll">
              {{ t('settingLocalAiCli.import.selectAll') }}
            </TxButton>
            <TxButton variant="ghost" size="sm" :disabled="applying" @click="resetSelection">
              {{ t('settingLocalAiCli.import.clear') }}
            </TxButton>
            <TxButton
              variant="ghost"
              size="sm"
              :loading="loading"
              :disabled="applying"
              @click="refreshScan()"
            >
              {{ t('settingLocalAiCli.import.rescan') }}
            </TxButton>
          </div>
        </div>

        <div class="LocalAiCliImport-List" data-testid="local-ai-cli-import-list">
          <article
            v-for="candidate in modelCandidates"
            :key="candidate.id"
            class="LocalAiCliImport-Card"
            :class="{ 'is-selected': isCandidateSelected(candidate) }"
          >
            <label class="LocalAiCliImport-CardHeader">
              <input
                type="checkbox"
                :checked="isCandidateSelected(candidate)"
                :disabled="applying"
                :aria-label="candidate.name"
                @change="toggleCandidate(candidate, ($event.target as HTMLInputElement).checked)"
              />
              <span class="LocalAiCliImport-CardTitle">{{ candidate.name }}</span>
              <span class="LocalAiCliImport-CardScope">
                {{ providerLabel(candidate.provider) }} · {{ scopeLabel(candidate.scope) }}
              </span>
            </label>
            <p class="LocalAiCliImport-Path" :title="candidate.path">{{ candidate.path }}</p>
            <div class="LocalAiCliImport-Providers">
              <label
                v-for="provider in candidate.modelProviders"
                :key="provider.id"
                class="LocalAiCliImport-Provider"
              >
                <input
                  type="checkbox"
                  :checked="isModelProviderSelected(candidate, provider.id)"
                  :disabled="applying"
                  :aria-label="provider.name"
                  @change="
                    toggleModelProvider(
                      candidate,
                      provider.id,
                      ($event.target as HTMLInputElement).checked
                    )
                  "
                />
                <span class="LocalAiCliImport-ProviderMain">
                  <span class="LocalAiCliImport-ProviderName">{{ provider.name }}</span>
                  <span class="LocalAiCliImport-ProviderMeta">
                    {{ provider.api }} ·
                    {{
                      provider.hasApiKey
                        ? t('settingLocalAiCli.import.apiKeyFound')
                        : t('settingLocalAiCli.import.apiKeyMissing')
                    }}
                    · {{ t('settingLocalAiCli.import.models', { count: provider.modelsCount }) }}
                  </span>
                </span>
              </label>
            </div>
            <p v-if="candidate.sensitiveKeyPaths.length" class="LocalAiCliImport-Sensitive">
              {{
                t('settingLocalAiCli.import.sensitive', {
                  count: candidate.sensitiveKeyPaths.length
                })
              }}
            </p>
          </article>
        </div>
      </template>
    </div>

    <template #footer>
      <div class="LocalAiCliImport-Footer">
        <span class="LocalAiCliImport-Count">
          {{ t('settingLocalAiCli.import.selected', { count: selectedCount }) }}
        </span>
        <TxButton
          variant="primary"
          size="sm"
          :disabled="selectedCount === 0 || applying || loading"
          :loading="applying"
          data-testid="local-ai-cli-import-apply"
          @click="applyImport"
        >
          {{ t('settingLocalAiCli.import.apply', { count: selectedCount }) }}
        </TxButton>
      </div>
    </template>
  </TxDrawer>

  <TxBottomDialog
    v-if="secretConfirm"
    :title="t('settingLocalAiCli.import.secretTitle')"
    :message="t('settingLocalAiCli.import.secretMessage', { count: secretConfirm.count })"
    :close-label="t('common.close')"
    :btns="secretConfirmButtons"
    :close="closeSecretConfirm"
  />
</template>

<style lang="scss" scoped>
.LocalAiCliImport {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 12px;
}

.LocalAiCliImport-Skeleton {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.LocalAiCliImport-Summary {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  color: var(--tx-text-color-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.LocalAiCliImport-Summary p {
  margin: 0;
}

.LocalAiCliImport-SelectionActions {
  display: flex;
  flex: 0 0 auto;
  gap: 4px;
}

.LocalAiCliImport-List {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.LocalAiCliImport-Card {
  padding: 12px;
  border: 1px solid var(--tx-border-color);
  border-radius: 10px;
  background: var(--tx-fill-color-blank);
}

.LocalAiCliImport-Card.is-selected {
  border-color: color-mix(in srgb, var(--tx-color-primary) 55%, var(--tx-border-color));
}

.LocalAiCliImport-CardHeader,
.LocalAiCliImport-Provider {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  cursor: pointer;
}

.LocalAiCliImport-CardHeader input,
.LocalAiCliImport-Provider input {
  flex: 0 0 auto;
  margin-top: 3px;
}

.LocalAiCliImport-CardTitle {
  min-width: 0;
  color: var(--tx-text-color-primary);
  font-weight: 600;
}

.LocalAiCliImport-CardScope {
  margin-left: auto;
  color: var(--tx-text-color-secondary);
  font-size: 12px;
  white-space: nowrap;
}

.LocalAiCliImport-Path {
  overflow: hidden;
  margin: 6px 0 0 24px;
  color: var(--tx-text-color-placeholder);
  font-family: var(--tx-font-family-mono, ui-monospace, monospace);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.LocalAiCliImport-Providers {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 10px 0 0 24px;
}

.LocalAiCliImport-ProviderMain {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.LocalAiCliImport-ProviderName {
  color: var(--tx-text-color-primary);
  font-size: 13px;
}

.LocalAiCliImport-ProviderMeta,
.LocalAiCliImport-Sensitive,
.LocalAiCliImport-Count {
  color: var(--tx-text-color-secondary);
  font-size: 12px;
}

.LocalAiCliImport-Sensitive {
  margin: 9px 0 0 24px;
  color: var(--tx-color-warning);
}

.LocalAiCliImport-Footer {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.LocalAiCliImport-Count {
  flex: 1 1 auto;
}
</style>
