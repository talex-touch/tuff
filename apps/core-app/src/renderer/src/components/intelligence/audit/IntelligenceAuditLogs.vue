<script lang="ts" setup>
import type { ContextCheckpointSafeSummary, ContextPackageLogExplainItem, ContextPackageLogSafeSummary } from './context-package-log-summary'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxDrawer } from '@talex-touch/tuffex/drawer'
import { useIntelligenceSdk } from '@talex-touch/utils/renderer'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { createRendererLogger } from '~/utils/renderer-log'
import {

  getContextExplainReasonI18nKey,
  summarizeContextCheckpoint,
  summarizeContextPackageLog,
} from './context-package-log-summary'

interface IntelligenceAuditLogEntry {
  traceId: string
  timestamp: number
  capabilityId: string
  provider: string
  model: string
  promptHash?: string
  caller?: string
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  latency: number
  success: boolean
  error?: string
  estimatedCost?: number
}

const props = defineProps<{
  callerId?: string
}>()

const { t } = useI18n()
const aiClient = useIntelligenceSdk()
const intelligenceAuditLog = createRendererLogger('IntelligenceAuditLogs')
const loading = ref(false)
const packageLogsLoading = ref<Record<string, boolean>>({})
const packageLogsByTraceId = ref<Record<string, ContextPackageLogSafeSummary[]>>({})
const packageLogsErrorByTraceId = ref<Record<string, string>>({})
const checkpointsLoadingBySessionId = ref<Record<string, boolean>>({})
const checkpointsBySessionId = ref<Record<string, ContextCheckpointSafeSummary[]>>({})
const checkpointsErrorBySessionId = ref<Record<string, string>>({})

const logs = ref<IntelligenceAuditLogEntry[]>([])
const selectedLog = ref<IntelligenceAuditLogEntry | null>(null)
const selectedContextPackage = ref<ContextPackageLogSafeSummary | null>(null)
const showContextExplainDrawer = ref(false)
const limit = ref(50)
const hasMore = ref(true)

async function loadLogs(append = false) {
  loading.value = true
  try {
    const newLogs = await aiClient.getAuditLogs({
      caller: props.callerId,
      limit: limit.value,
      offset: append ? logs.value.length : 0,
    })

    if (append) {
      logs.value.push(...newLogs)
    }
    else {
      logs.value = newLogs
    }

    hasMore.value = newLogs.length === limit.value
  }
  catch (error) {
    intelligenceAuditLog.error('Failed to load logs:', error)
  }
  finally {
    loading.value = false
  }
}

onMounted(() => loadLogs())

async function loadPackageLogsForTrace(traceId: string) {
  if (
    packageLogsLoading.value[traceId]
    || packageLogsByTraceId.value[traceId]
    || packageLogsErrorByTraceId.value[traceId]
  ) {
    return
  }

  packageLogsLoading.value = {
    ...packageLogsLoading.value,
    [traceId]: true,
  }
  try {
    const result = await aiClient.contextListPackageLogs({
      traceId,
      limit: 5,
    })
    const summaries = result.logs.map(summarizeContextPackageLog)
    packageLogsByTraceId.value = {
      ...packageLogsByTraceId.value,
      [traceId]: summaries,
    }
    await loadCheckpointsForPackageLogs(summaries)
  }
  catch (error) {
    intelligenceAuditLog.error('Failed to load context package logs:', error)
    packageLogsErrorByTraceId.value = {
      ...packageLogsErrorByTraceId.value,
      [traceId]: t('intelligence.audit.contextLoadFailed'),
    }
  }
  finally {
    packageLogsLoading.value = {
      ...packageLogsLoading.value,
      [traceId]: false,
    }
  }
}

async function loadCheckpointsForPackageLogs(summaries: ContextPackageLogSafeSummary[]) {
  const sessionIds = Array.from(
    new Set(summaries.map(summary => summary.sessionId).filter(Boolean)),
  )
  await Promise.all(sessionIds.map(sessionId => loadCheckpointsForSession(sessionId)))
}

async function loadCheckpointsForSession(sessionId: string) {
  if (
    checkpointsLoadingBySessionId.value[sessionId]
    || checkpointsBySessionId.value[sessionId]
    || checkpointsErrorBySessionId.value[sessionId]
  ) {
    return
  }

  checkpointsLoadingBySessionId.value = {
    ...checkpointsLoadingBySessionId.value,
    [sessionId]: true,
  }
  try {
    const result = await aiClient.contextListCheckpoints({
      sessionId,
      limit: 5,
    })
    checkpointsBySessionId.value = {
      ...checkpointsBySessionId.value,
      [sessionId]: result.checkpoints.map(summarizeContextCheckpoint),
    }
  }
  catch (error) {
    intelligenceAuditLog.error('Failed to load context checkpoints:', error)
    checkpointsErrorBySessionId.value = {
      ...checkpointsErrorBySessionId.value,
      [sessionId]: t('intelligence.audit.contextLoadFailed'),
    }
  }
  finally {
    checkpointsLoadingBySessionId.value = {
      ...checkpointsLoadingBySessionId.value,
      [sessionId]: false,
    }
  }
}

function handleToggleLog(log: IntelligenceAuditLogEntry) {
  const nextLog = selectedLog.value?.traceId === log.traceId ? null : log
  selectedLog.value = nextLog
  if (nextLog?.traceId) {
    void loadPackageLogsForTrace(nextLog.traceId)
  }
}

function openContextExplainDrawer(summary: ContextPackageLogSafeSummary) {
  selectedContextPackage.value = summary
  showContextExplainDrawer.value = true
}

function closeContextExplainDrawer() {
  showContextExplainDrawer.value = false
  selectedContextPackage.value = null
}

function handleExportCSV() {
  const headers = [
    'Trace ID',
    'Timestamp',
    'Capability',
    'Provider',
    'Model',
    'Caller',
    'Prompt Tokens',
    'Completion Tokens',
    'Total Tokens',
    'Estimated Cost',
    'Latency (ms)',
    'Success',
    'Error',
  ]
  const rows = logs.value.map(log => [
    log.traceId,
    new Date(log.timestamp).toISOString(),
    log.capabilityId,
    log.provider,
    log.model,
    log.caller || '',
    log.usage.promptTokens,
    log.usage.completionTokens,
    log.usage.totalTokens,
    log.estimatedCost?.toFixed(6) || '',
    log.latency,
    log.success ? 'Yes' : 'No',
    log.error || '',
  ])
  const csv = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
  ].join('\n')
  const filename = `intelligence-audit-${new Date().toISOString().split('T')[0]}.csv`
  downloadAsFile(csv, filename, 'text/csv')
}

function handleExportJSON() {
  const json = JSON.stringify(logs.value, null, 2)
  const filename = `intelligence-audit-${new Date().toISOString().split('T')[0]}.json`
  downloadAsFile(json, filename, 'application/json')
}

function downloadAsFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString()
}

function formatLatency(ms: number): string {
  if (ms < 1000)
    return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatSourceTypes(summary: ContextPackageLogSafeSummary): string {
  if (summary.sourceTypes.length === 0) {
    return t('intelligence.audit.contextNoSources')
  }
  return summary.sourceTypes.map(source => `${source.sourceType} x${source.count}`).join(', ')
}

function formatExplainItem(item: ContextPackageLogExplainItem): string {
  const reasonKey = getContextExplainReasonI18nKey(item.reason)
  const reason = reasonKey ? t(reasonKey) : item.reason
  const parts = [`${item.sourceType}:${item.sourceId}`, reason]
  if (typeof item.tokenEstimate === 'number') {
    parts.push(`${item.tokenEstimate} ${t('intelligence.audit.contextTokens')}`)
  }
  return parts.filter(Boolean).join(' · ')
}

function formatCitation(item: ContextPackageLogExplainItem): string {
  const citation = item.citation
  if (!citation) {
    return ''
  }
  return [
    citation.title,
    citation.documentId,
    citation.chunkId,
    citation.sourceType,
    citation.sourceUri,
  ]
    .filter(Boolean)
    .join(' · ')
}

function checkpointsForPackage(
  summary: ContextPackageLogSafeSummary,
): ContextCheckpointSafeSummary[] {
  return checkpointsBySessionId.value[summary.sessionId] ?? []
}

const statusClass = computed(() => (log: IntelligenceAuditLogEntry) => {
  return log.success ? 'success' : 'error'
})
</script>

<template>
  <div class="audit-logs">
    <div class="logs-header">
      <div class="header-left">
        <span class="logs-count">{{ logs.length }} {{ t('intelligence.audit.records') }}</span>
      </div>
      <div class="header-actions">
        <TxButton variant="flat" size="small" @click="loadLogs(false)">
          <i class="i-carbon-renew" />
          {{ t('common.refresh') }}
        </TxButton>
        <TxButton variant="flat" size="small" @click="handleExportCSV">
          <i class="i-carbon-document-export" />
          CSV
        </TxButton>
        <TxButton variant="flat" size="small" @click="handleExportJSON">
          <i class="i-carbon-document-export" />
          JSON
        </TxButton>
      </div>
    </div>

    <div v-if="loading && logs.length === 0" class="loading">
      <i class="i-carbon-circle-dash animate-spin" />
      {{ t('common.loading') }}
    </div>

    <div v-else-if="logs.length === 0" class="empty">
      <i class="i-carbon-document-blank" />
      <span>{{ t('intelligence.audit.noLogs') }}</span>
    </div>

    <div v-else class="logs-list">
      <div
        v-for="log in logs"
        :key="log.traceId"
        class="log-item"
        :class="{ selected: selectedLog?.traceId === log.traceId }"
        @click="handleToggleLog(log)"
      >
        <div class="log-main">
          <div class="log-status" :class="statusClass(log)">
            <i :class="log.success ? 'i-carbon-checkmark-filled' : 'i-carbon-close-filled'" />
          </div>
          <div class="log-info">
            <div class="log-capability">
              {{ log.capabilityId }}
            </div>
            <div class="log-meta">
              <span class="provider">{{ log.provider }}</span>
              <span class="model">{{ log.model }}</span>
              <span class="time">{{ formatTime(log.timestamp) }}</span>
            </div>
          </div>
          <div class="log-stats">
            <span class="tokens">
              <i class="i-carbon-text-scale" />
              {{ log.usage.totalTokens }}
            </span>
            <span class="latency">
              <i class="i-carbon-time" />
              {{ formatLatency(log.latency) }}
            </span>
            <span v-if="log.estimatedCost" class="cost"> ${{ log.estimatedCost.toFixed(4) }} </span>
          </div>
        </div>

        <div v-if="selectedLog?.traceId === log.traceId" class="log-detail">
          <div class="detail-row">
            <span class="label">Trace ID:</span>
            <code>{{ log.traceId }}</code>
          </div>
          <div v-if="log.caller" class="detail-row">
            <span class="label">Caller:</span>
            <span>{{ log.caller }}</span>
          </div>
          <div v-if="log.promptHash" class="detail-row">
            <span class="label">Prompt Hash:</span>
            <code>{{ log.promptHash }}</code>
          </div>
          <div class="detail-row">
            <span class="label">Tokens:</span>
            <span>
              Prompt: {{ log.usage.promptTokens }} | Completion: {{ log.usage.completionTokens }} |
              Total: {{ log.usage.totalTokens }}
            </span>
          </div>
          <div v-if="log.error" class="detail-row error">
            <span class="label">Error:</span>
            <span>{{ log.error }}</span>
          </div>
          <div class="context-package-summary" @click.stop>
            <div class="context-package-title">
              <span>{{ t('intelligence.audit.contextPackage') }}</span>
              <span v-if="packageLogsByTraceId[log.traceId]?.length" class="context-package-count">
                {{ packageLogsByTraceId[log.traceId].length }}
              </span>
            </div>
            <div v-if="packageLogsLoading[log.traceId]" class="context-package-state">
              <i class="i-carbon-circle-dash animate-spin" />
              {{ t('common.loading') }}
            </div>
            <div
              v-else-if="packageLogsErrorByTraceId[log.traceId]"
              class="context-package-state error"
            >
              {{ packageLogsErrorByTraceId[log.traceId] }}
            </div>
            <div
              v-else-if="!packageLogsByTraceId[log.traceId]?.length"
              class="context-package-state"
            >
              {{ t('intelligence.audit.contextPackageEmpty') }}
            </div>
            <div v-else class="context-package-list">
              <div
                v-for="summary in packageLogsByTraceId[log.traceId]"
                :key="summary.id"
                class="context-package-item"
              >
                <div class="context-package-line">
                  <span class="context-scope">{{ summary.scope }}</span>
                  <span>
                    {{ summary.tokenEstimate }} / {{ summary.tokenBudget }}
                    {{ t('intelligence.audit.contextTokens') }}
                  </span>
                  <span>{{ summary.itemCount }} {{ t('intelligence.audit.contextItems') }}</span>
                  <TxButton
                    variant="flat"
                    size="small"
                    class="context-explain-button"
                    @click.stop="openContextExplainDrawer(summary)"
                  >
                    <i class="i-carbon-information" />
                    {{ t('intelligence.audit.contextExplain') }}
                  </TxButton>
                </div>
                <div class="context-package-line secondary">
                  <span>{{ t('intelligence.audit.contextSources') }}:
                    {{ formatSourceTypes(summary) }}</span>
                  <span v-if="summary.retrievalItemCount">
                    {{ t('intelligence.audit.contextRetrieval') }}: {{ summary.retrievalItemCount }}
                  </span>
                  <span v-if="summary.citationCount">
                    {{ t('intelligence.audit.contextCitations') }}: {{ summary.citationCount }}
                  </span>
                  <span v-if="summary.retrievalStatus">
                    {{ t('intelligence.audit.contextRetrievalStatus') }}:
                    {{ summary.retrievalStatus }}
                  </span>
                </div>
                <div v-if="summary.degradedReason" class="context-package-line warning">
                  {{ t('intelligence.audit.contextDegradedReason') }}: {{ summary.degradedReason }}
                </div>
                <div v-if="summary.excludedCount" class="context-package-line warning">
                  <span>
                    {{ t('intelligence.audit.contextExcluded') }}:
                    {{ summary.excludedCount }}
                  </span>
                  <span v-if="summary.policyBlockedCount">
                    {{ t('intelligence.audit.contextPolicyBlocked') }}:
                    {{ summary.policyBlockedCount }}
                  </span>
                  <span v-if="summary.tombstoneCount">
                    {{ t('intelligence.audit.contextTombstoned') }}:
                    {{ summary.tombstoneCount }}
                  </span>
                  <span v-if="summary.prunedCount">
                    {{ t('intelligence.audit.contextPruned') }}: {{ summary.prunedCount }}
                  </span>
                </div>
                <div
                  v-if="summary.includedItems.length || summary.excludedItems.length"
                  class="context-explain-summary"
                >
                  <div v-if="summary.includedItems.length" class="context-explain-group">
                    <div class="context-checkpoint-title">
                      {{ t('intelligence.audit.contextIncludedSources') }}
                    </div>
                    <div
                      v-for="item in summary.includedItems"
                      :key="`included-${item.sourceType}-${item.sourceId}-${item.reason}`"
                      class="context-explain-item"
                    >
                      <span>{{ formatExplainItem(item) }}</span>
                      <span v-if="formatCitation(item)" class="context-explain-citation">
                        {{ t('intelligence.audit.contextCitation') }}:
                        {{ formatCitation(item) }}
                      </span>
                    </div>
                  </div>
                  <div v-if="summary.excludedItems.length" class="context-explain-group">
                    <div class="context-checkpoint-title">
                      {{ t('intelligence.audit.contextExcludedSources') }}
                    </div>
                    <div
                      v-for="item in summary.excludedItems"
                      :key="`excluded-${item.sourceType}-${item.sourceId}-${item.reason}`"
                      class="context-explain-item warning"
                    >
                      {{ formatExplainItem(item) }}
                    </div>
                  </div>
                </div>
                <div class="context-checkpoint-summary">
                  <div class="context-checkpoint-title">
                    {{ t('intelligence.audit.contextCheckpoints') }}
                  </div>
                  <div
                    v-if="checkpointsLoadingBySessionId[summary.sessionId]"
                    class="context-package-state"
                  >
                    <i class="i-carbon-circle-dash animate-spin" />
                    {{ t('common.loading') }}
                  </div>
                  <div
                    v-else-if="checkpointsErrorBySessionId[summary.sessionId]"
                    class="context-package-state error"
                  >
                    {{ checkpointsErrorBySessionId[summary.sessionId] }}
                  </div>
                  <div
                    v-else-if="!checkpointsForPackage(summary).length"
                    class="context-package-state"
                  >
                    {{ t('intelligence.audit.contextCheckpointsEmpty') }}
                  </div>
                  <div v-else class="context-checkpoint-list">
                    <div
                      v-for="checkpoint in checkpointsForPackage(summary)"
                      :key="checkpoint.id"
                      class="context-checkpoint-item"
                    >
                      <span class="context-scope">{{ checkpoint.type }}</span>
                      <span>{{ checkpoint.reason }}</span>
                      <span>{{ checkpoint.contextScope }}</span>
                      <span v-if="checkpoint.metadataKeys.length">
                        {{ t('intelligence.audit.contextMetadataKeys') }}:
                        {{ checkpoint.metadataKeys.join(', ') }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="hasMore" class="load-more">
        <TxButton variant="flat" :loading="loading" @click="loadLogs(true)">
          <i class="i-carbon-add" />
          {{ t('common.loadMore') }}
        </TxButton>
      </div>
    </div>

    <TxDrawer
      v-model:visible="showContextExplainDrawer"
      :title="t('intelligence.audit.contextExplainTitle')"
      @close="closeContextExplainDrawer"
    >
      <div v-if="selectedContextPackage" class="context-explain-drawer">
        <div class="context-explain-drawer-section">
          <h3>{{ t('intelligence.audit.contextPackage') }}</h3>
          <div class="context-explain-drawer-grid">
            <span>{{ t('intelligence.audit.contextScope') }}</span>
            <strong>{{ selectedContextPackage.scope }}</strong>
            <span>{{ t('intelligence.audit.contextTokens') }}</span>
            <strong>
              {{ selectedContextPackage.tokenEstimate }} / {{ selectedContextPackage.tokenBudget }}
            </strong>
            <span>{{ t('intelligence.audit.contextItems') }}</span>
            <strong>{{ selectedContextPackage.itemCount }}</strong>
            <span v-if="selectedContextPackage.tombstoneCount">
              {{ t('intelligence.audit.contextTombstoned') }}
            </span>
            <strong v-if="selectedContextPackage.tombstoneCount">
              {{ selectedContextPackage.tombstoneCount }}
            </strong>
            <span v-if="selectedContextPackage.retrievalStatus">
              {{ t('intelligence.audit.contextRetrievalStatus') }}
            </span>
            <strong v-if="selectedContextPackage.retrievalStatus">
              {{ selectedContextPackage.retrievalStatus }}
            </strong>
          </div>
          <p v-if="selectedContextPackage.degradedReason" class="context-explain-drawer-warning">
            {{ t('intelligence.audit.contextDegradedReason') }}:
            {{ selectedContextPackage.degradedReason }}
          </p>
          <p
            v-if="selectedContextPackage.tombstoneCount"
            class="context-explain-drawer-warning"
          >
            {{
              t('intelligence.audit.contextTombstoneNotice', {
                count: selectedContextPackage.tombstoneCount,
              })
            }}
          </p>
        </div>

        <div class="context-explain-drawer-section">
          <h3>{{ t('intelligence.audit.contextIncludedSources') }}</h3>
          <div
            v-if="selectedContextPackage.includedItems.length"
            class="context-explain-drawer-list"
          >
            <div
              v-for="item in selectedContextPackage.includedItems"
              :key="`drawer-included-${item.sourceType}-${item.sourceId}-${item.reason}`"
              class="context-explain-drawer-item"
            >
              <span>{{ formatExplainItem(item) }}</span>
              <span v-if="formatCitation(item)" class="context-explain-citation">
                {{ t('intelligence.audit.contextCitation') }}: {{ formatCitation(item) }}
              </span>
            </div>
          </div>
          <p v-else class="context-explain-drawer-empty">
            {{ t('intelligence.audit.contextNoSources') }}
          </p>
        </div>

        <div class="context-explain-drawer-section">
          <h3>{{ t('intelligence.audit.contextExcludedSources') }}</h3>
          <div
            v-if="selectedContextPackage.excludedItems.length"
            class="context-explain-drawer-list"
          >
            <div
              v-for="item in selectedContextPackage.excludedItems"
              :key="`drawer-excluded-${item.sourceType}-${item.sourceId}-${item.reason}`"
              class="context-explain-drawer-item warning"
            >
              {{ formatExplainItem(item) }}
            </div>
          </div>
          <p v-else class="context-explain-drawer-empty">
            {{ t('intelligence.audit.contextExcludedEmpty') }}
          </p>
        </div>

        <div class="context-explain-drawer-section">
          <h3>{{ t('intelligence.audit.contextCheckpoints') }}</h3>
          <div
            v-if="checkpointsForPackage(selectedContextPackage).length"
            class="context-explain-drawer-list"
          >
            <div
              v-for="checkpoint in checkpointsForPackage(selectedContextPackage)"
              :key="`drawer-checkpoint-${checkpoint.id}`"
              class="context-explain-drawer-item"
            >
              <span>{{ checkpoint.type }} · {{ checkpoint.reason }}</span>
              <span>{{ checkpoint.contextScope }}</span>
              <span v-if="checkpoint.metadataKeys.length" class="context-explain-citation">
                {{ t('intelligence.audit.contextMetadataKeys') }}:
                {{ checkpoint.metadataKeys.join(', ') }}
              </span>
            </div>
          </div>
          <p v-else class="context-explain-drawer-empty">
            {{ t('intelligence.audit.contextCheckpointsEmpty') }}
          </p>
        </div>
      </div>
    </TxDrawer>
  </div>
</template>

<style lang="scss" scoped>
.audit-logs {
  .logs-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;

    .header-left {
      .logs-count {
        font-size: 14px;
        color: var(--tx-text-color-secondary);
      }
    }

    .header-actions {
      display: flex;
      gap: 8px;
    }
  }

  .loading,
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 60px 20px;
    color: var(--tx-text-color-secondary);

    i {
      font-size: 32px;
    }
  }

  .logs-list {
    display: flex;
    flex-direction: column;
    gap: 8px;

    .log-item {
      background: var(--tx-fill-color-lighter);
      border: 1px solid var(--tx-border-color-lighter);
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;

      &:hover {
        border-color: var(--tx-border-color);
      }

      &.selected {
        border-color: var(--tx-color-primary);
        background: var(--tx-fill-color-light);
      }

      .log-main {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;

        .log-status {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;

          &.success {
            background: rgba(var(--tx-color-success-rgb), 0.1);
            color: var(--tx-color-success);
          }

          &.error {
            background: rgba(var(--tx-color-danger-rgb), 0.1);
            color: var(--tx-color-danger);
          }
        }

        .log-info {
          flex: 1;
          min-width: 0;

          .log-capability {
            font-size: 14px;
            font-weight: 500;
            color: var(--tx-text-color-primary);
          }

          .log-meta {
            display: flex;
            gap: 12px;
            font-size: 12px;
            color: var(--tx-text-color-secondary);
            margin-top: 4px;

            .provider {
              color: var(--tx-color-primary);
            }
          }
        }

        .log-stats {
          display: flex;
          gap: 16px;
          font-size: 12px;
          color: var(--tx-text-color-secondary);

          span {
            display: flex;
            align-items: center;
            gap: 4px;
          }

          .cost {
            color: var(--tx-color-warning);
            font-weight: 500;
          }
        }
      }

      .log-detail {
        padding: 12px 16px;
        border-top: 1px solid var(--tx-border-color-lighter);
        background: var(--tx-fill-color);
        font-size: 13px;

        .detail-row {
          display: flex;
          gap: 8px;
          padding: 4px 0;

          .label {
            color: var(--tx-text-color-secondary);
            min-width: 100px;
          }

          code {
            font-family: monospace;
            background: var(--tx-fill-color-dark);
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 12px;
          }

          &.error {
            color: var(--tx-color-danger);
          }
        }

        .context-package-summary {
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid var(--tx-border-color-lighter);
        }

        .context-package-title {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
          font-size: 12px;
          font-weight: 600;
          color: var(--tx-text-color-primary);
        }

        .context-package-count {
          min-width: 20px;
          height: 20px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          background: var(--tx-fill-color-dark);
          color: var(--tx-text-color-secondary);
          font-size: 11px;
        }

        .context-package-state {
          display: flex;
          align-items: center;
          gap: 6px;
          color: var(--tx-text-color-secondary);
          font-size: 12px;

          &.error {
            color: var(--tx-color-danger);
          }
        }

        .context-package-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .context-package-item {
          padding: 8px 10px;
          border: 1px solid var(--tx-border-color-lighter);
          border-radius: 6px;
          background: var(--tx-fill-color-lighter);
        }

        .context-package-line {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px 12px;
          color: var(--tx-text-color-primary);
          font-size: 12px;

          &.secondary {
            margin-top: 4px;
            color: var(--tx-text-color-secondary);
          }

          &.warning {
            margin-top: 4px;
            color: var(--tx-color-warning);
          }
        }

        .context-explain-button {
          margin-left: auto;
        }

        .context-scope {
          color: var(--tx-color-primary);
          font-weight: 600;
        }

        .context-explain-summary {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid var(--tx-border-color-lighter);
        }

        .context-explain-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .context-explain-item {
          display: flex;
          flex-direction: column;
          gap: 2px;
          color: var(--tx-text-color-secondary);
          font-size: 12px;
          line-height: 1.5;
          overflow-wrap: anywhere;

          &.warning {
            color: var(--tx-color-warning);
          }
        }

        .context-explain-citation {
          color: var(--tx-text-color-placeholder);
          font-size: 11px;
        }

        .context-checkpoint-summary {
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid var(--tx-border-color-lighter);
        }

        .context-checkpoint-title {
          margin-bottom: 6px;
          color: var(--tx-text-color-secondary);
          font-size: 11px;
          font-weight: 600;
        }

        .context-checkpoint-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .context-checkpoint-item {
          display: flex;
          flex-wrap: wrap;
          gap: 6px 10px;
          color: var(--tx-text-color-secondary);
          font-size: 12px;
        }
      }
    }

    .load-more {
      display: flex;
      justify-content: center;
      padding: 16px;
    }
  }

  .context-explain-drawer {
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: 16px;
  }

  .context-explain-drawer-section {
    display: flex;
    flex-direction: column;
    gap: 8px;

    h3 {
      margin: 0;
      color: var(--tx-text-color-primary);
      font-size: 14px;
      font-weight: 600;
    }
  }

  .context-explain-drawer-grid {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: 6px 12px;
    color: var(--tx-text-color-secondary);
    font-size: 12px;

    strong {
      min-width: 0;
      color: var(--tx-text-color-primary);
      font-weight: 600;
      overflow-wrap: anywhere;
    }
  }

  .context-explain-drawer-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .context-explain-drawer-item {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 8px 10px;
    border: 1px solid var(--tx-border-color-lighter);
    border-radius: 6px;
    color: var(--tx-text-color-secondary);
    font-size: 12px;
    line-height: 1.45;
    overflow-wrap: anywhere;

    &.warning {
      color: var(--tx-color-warning);
    }
  }

  .context-explain-drawer-warning,
  .context-explain-drawer-empty {
    margin: 0;
    color: var(--tx-text-color-secondary);
    font-size: 12px;
  }

  .context-explain-drawer-warning {
    color: var(--tx-color-warning);
  }
}
</style>
