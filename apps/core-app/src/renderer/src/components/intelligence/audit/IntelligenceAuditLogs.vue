<script lang="ts" setup>
import type { IntelligenceAuditLogEntry } from '@talex-touch/utils/renderer'
import { TxButton } from '@talex-touch/tuffex'
import { useIntelligenceStats } from '@talex-touch/utils/renderer'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  callerId?: string
}>()

const { t } = useI18n()
const { getAuditLogs, exportToCSV, exportToJSON, downloadAsFile, isLoading } =
  useIntelligenceStats()

const logs = ref<IntelligenceAuditLogEntry[]>([])
const selectedLog = ref<IntelligenceAuditLogEntry | null>(null)
const limit = ref(50)
const hasMore = ref(true)

async function loadLogs(append = false) {
  try {
    const newLogs = await getAuditLogs({
      caller: props.callerId,
      limit: limit.value,
      offset: append ? logs.value.length : 0
    })

    if (append) {
      logs.value.push(...newLogs)
    } else {
      logs.value = newLogs
    }

    hasMore.value = newLogs.length === limit.value
  } catch (error) {
    console.error('Failed to load logs:', error)
  }
}

onMounted(() => loadLogs())

function handleExportCSV() {
  const csv = exportToCSV(logs.value)
  const filename = `intelligence-audit-${new Date().toISOString().split('T')[0]}.csv`
  downloadAsFile(csv, filename, 'text/csv')
}

function handleExportJSON() {
  const json = exportToJSON(logs.value)
  const filename = `intelligence-audit-${new Date().toISOString().split('T')[0]}.json`
  downloadAsFile(json, filename, 'application/json')
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString()
}

function formatLatency(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
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

    <div v-if="isLoading && logs.length === 0" class="loading">
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
        @click="selectedLog = selectedLog?.traceId === log.traceId ? null : log"
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
        </div>
      </div>

      <div v-if="hasMore" class="load-more">
        <TxButton variant="flat" :loading="isLoading" @click="loadLogs(true)">
          <i class="i-carbon-add" />
          {{ t('common.loadMore') }}
        </TxButton>
      </div>
    </div>
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
        color: var(--el-text-color-secondary);
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
    color: var(--el-text-color-secondary);

    i {
      font-size: 32px;
    }
  }

  .logs-list {
    display: flex;
    flex-direction: column;
    gap: 8px;

    .log-item {
      background: var(--el-fill-color-lighter);
      border: 1px solid var(--el-border-color-lighter);
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;

      &:hover {
        border-color: var(--el-border-color);
      }

      &.selected {
        border-color: var(--el-color-primary);
        background: var(--el-fill-color-light);
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
            background: rgba(var(--el-color-success-rgb), 0.1);
            color: var(--el-color-success);
          }

          &.error {
            background: rgba(var(--el-color-danger-rgb), 0.1);
            color: var(--el-color-danger);
          }
        }

        .log-info {
          flex: 1;
          min-width: 0;

          .log-capability {
            font-size: 14px;
            font-weight: 500;
            color: var(--el-text-color-primary);
          }

          .log-meta {
            display: flex;
            gap: 12px;
            font-size: 12px;
            color: var(--el-text-color-secondary);
            margin-top: 4px;

            .provider {
              color: var(--el-color-primary);
            }
          }
        }

        .log-stats {
          display: flex;
          gap: 16px;
          font-size: 12px;
          color: var(--el-text-color-secondary);

          span {
            display: flex;
            align-items: center;
            gap: 4px;
          }

          .cost {
            color: var(--el-color-warning);
            font-weight: 500;
          }
        }
      }

      .log-detail {
        padding: 12px 16px;
        border-top: 1px solid var(--el-border-color-lighter);
        background: var(--el-fill-color);
        font-size: 13px;

        .detail-row {
          display: flex;
          gap: 8px;
          padding: 4px 0;

          .label {
            color: var(--el-text-color-secondary);
            min-width: 100px;
          }

          code {
            font-family: monospace;
            background: var(--el-fill-color-dark);
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 12px;
          }

          &.error {
            color: var(--el-color-danger);
          }
        }
      }
    }

    .load-more {
      display: flex;
      justify-content: center;
      padding: 16px;
    }
  }
}
</style>
