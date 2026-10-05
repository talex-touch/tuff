<script setup lang="ts">
import type {
  IntelligenceAuditLogEntry,
  ModelPricing
} from '@talex-touch/utils/transport/sdk/domains/intelligence'
import type {
  ContextCheckpointSafeSummary,
  ContextPackageLogExplainItem,
  ContextPackageLogSafeSummary
} from './context-package-log-summary'
import { TxSpinner } from '@talex-touch/tuffex/spinner'
import { TxStatusBadge } from '@talex-touch/tuffex/status-badge'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  formatInteger,
  formatLatency,
  formatPricePerMillion,
  formatUsd,
  toLocalIsoString
} from './audit-format'
import { getContextExplainReasonI18nKey } from './context-package-log-summary'
import { useAuditLabels } from './useAuditLabels'

/**
 * One call record, opened below the records table: what the ledger kept about the call, and the
 * context packages and checkpoints its trace left (parent PRD R-D6). Metadata only — the audit
 * log never holds prompt or response text, so there is none to show.
 */
defineOptions({ name: 'AuditRecordDetail' })

const props = defineProps<{
  record: IntelligenceAuditLogEntry
  /** The model's pricing as the breakdown resolved it; `null` when the window has no such row. */
  pricing?: ModelPricing | null
  packages?: ContextPackageLogSafeSummary[]
  packagesLoading?: boolean
  packagesFailed?: boolean
  checkpointsFor: (summary: ContextPackageLogSafeSummary) => ContextCheckpointSafeSummary[]
  checkpointsLoading?: Readonly<Record<string, boolean>>
  checkpointsFailed?: Readonly<Record<string, boolean>>
}>()

const { t, locale } = useI18n()
const labels = useAuditLabels()

const PRICING_LABEL_KEYS: Record<ModelPricing['status'], string> = {
  priced: 'intelligenceAudit.pricing.priced',
  free: 'intelligenceAudit.pricing.free',
  local: 'intelligenceAudit.pricing.local',
  credits: 'intelligenceAudit.pricing.credits',
  unpriced: 'intelligenceAudit.pricing.unpriced'
}

const operation = computed(() => {
  const value = props.record.metadata?.operation
  return typeof value === 'string' ? value : null
})

const channel = computed(() => labels.channel(props.record.provider))
const caller = computed(() => labels.caller(props.record.caller ?? '', operation.value))

const pricingText = computed(() => {
  const pricing = props.pricing
  if (!pricing) return '—'
  const status = t(PRICING_LABEL_KEYS[pricing.status])
  if (pricing.status !== 'priced') return status
  return t('intelligenceAudit.records.detail.priceValue', {
    input: formatPricePerMillion(pricing.inputPerMTokens, locale.value),
    output: formatPricePerMillion(pricing.outputPerMTokens, locale.value)
  })
})

const metadataEntries = computed(() =>
  Object.entries(props.record.metadata ?? {}).map(([key, value]) => ({
    key,
    value: typeof value === 'string' ? value : JSON.stringify(value)
  }))
)

function formatSourceTypes(summary: ContextPackageLogSafeSummary): string {
  if (summary.sourceTypes.length === 0) return t('intelligence.audit.contextNoSources')
  return summary.sourceTypes.map((source) => `${source.sourceType} x${source.count}`).join(', ')
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
  if (!citation) return ''
  return [
    citation.title,
    citation.documentId,
    citation.chunkId,
    citation.sourceType,
    citation.sourceUri
  ]
    .filter(Boolean)
    .join(' · ')
}
</script>

<template>
  <div class="AuditRecordDetail" data-testid="audit-record-detail">
    <dl class="AuditRecordDetail-Grid">
      <div>
        <dt>{{ t('intelligenceAudit.records.detail.time') }}</dt>
        <dd>{{ toLocalIsoString(record.timestamp) }}</dd>
      </div>
      <div>
        <dt>{{ t('intelligenceAudit.records.detail.status') }}</dt>
        <dd>
          <TxStatusBadge
            size="sm"
            :status="record.success ? 'success' : 'danger'"
            :text="
              record.success
                ? t('intelligenceAudit.records.success')
                : t('intelligenceAudit.records.failure')
            "
          />
        </dd>
      </div>
      <div v-if="!record.success">
        <dt>{{ t('intelligenceAudit.records.detail.errorCode') }}</dt>
        <dd>
          <code data-testid="audit-record-error">{{ record.error || '—' }}</code>
        </dd>
      </div>
      <div>
        <dt>{{ t('intelligenceAudit.records.detail.capability') }}</dt>
        <dd>
          {{ labels.capability(record.capabilityId) }}
          <code v-if="labels.capability(record.capabilityId) !== record.capabilityId">
            {{ record.capabilityId }}
          </code>
        </dd>
      </div>
      <div>
        <dt>{{ t('intelligenceAudit.records.detail.channel') }}</dt>
        <dd>
          {{ channel.name }}
          <code v-if="channel.deleted || channel.legacyType">{{ record.provider }}</code>
        </dd>
      </div>
      <div>
        <dt>{{ t('intelligenceAudit.records.detail.model') }}</dt>
        <dd>
          <code>{{ record.model }}</code>
        </dd>
      </div>
      <div>
        <dt>{{ t('intelligenceAudit.records.detail.caller') }}</dt>
        <dd>
          {{ caller.label }}
          <code v-if="record.caller && caller.kind !== 'unknown'">{{ record.caller }}</code>
        </dd>
      </div>
      <div>
        <dt>{{ t('intelligenceAudit.records.detail.tokens') }}</dt>
        <dd>
          {{
            t('intelligenceAudit.records.detail.tokensValue', {
              input: formatInteger(record.usage.promptTokens, locale),
              output: formatInteger(record.usage.completionTokens, locale),
              total: formatInteger(record.usage.totalTokens, locale)
            })
          }}
        </dd>
      </div>
      <div>
        <dt>{{ t('intelligenceAudit.records.detail.latency') }}</dt>
        <dd>{{ formatLatency(record.latency, locale) }}</dd>
      </div>
      <div>
        <dt>{{ t('intelligenceAudit.records.detail.cost') }}</dt>
        <dd>{{ formatUsd(record.estimatedCost ?? 0, locale) }}</dd>
      </div>
      <div>
        <dt>{{ t('intelligenceAudit.records.detail.pricing') }}</dt>
        <dd data-testid="audit-record-pricing">{{ pricingText }}</dd>
      </div>
      <div class="is-wide">
        <dt>{{ t('intelligenceAudit.records.detail.trace') }}</dt>
        <dd>
          <code data-testid="audit-record-trace">{{ record.traceId }}</code>
        </dd>
      </div>
      <div v-if="record.promptHash" class="is-wide">
        <dt>{{ t('intelligenceAudit.records.detail.promptHash') }}</dt>
        <dd>
          <code>{{ record.promptHash }}</code>
        </dd>
      </div>
      <div class="is-wide">
        <dt>{{ t('intelligenceAudit.records.detail.metadata') }}</dt>
        <dd>
          <span v-if="metadataEntries.length === 0">{{
            t('intelligenceAudit.records.detail.noMetadata')
          }}</span>
          <span v-else class="AuditRecordDetail-Meta" data-testid="audit-record-metadata">
            <code v-for="entry in metadataEntries" :key="entry.key"
              >{{ entry.key }}={{ entry.value }}</code
            >
          </span>
        </dd>
      </div>
    </dl>

    <section class="AuditRecordDetail-Context" data-testid="audit-record-context">
      <h4>
        {{ t('intelligence.audit.contextPackage') }}
        <span v-if="packages?.length" class="AuditRecordDetail-Count">{{ packages.length }}</span>
      </h4>
      <p v-if="packagesLoading" class="AuditRecordDetail-State">
        <TxSpinner :size="14" />
        {{ t('intelligenceAudit.records.detail.contextLoading') }}
      </p>
      <p v-else-if="packagesFailed" class="AuditRecordDetail-State is-error">
        {{ t('intelligence.audit.contextLoadFailed') }}
      </p>
      <p v-else-if="!packages?.length" class="AuditRecordDetail-State">
        {{ t('intelligence.audit.contextPackageEmpty') }}
      </p>
      <ul v-else class="AuditRecordDetail-Packages">
        <li v-for="summary in packages" :key="summary.id" class="AuditRecordDetail-Package">
          <p class="AuditRecordDetail-Line">
            <strong>{{ summary.scope }}</strong>
            <span>
              {{ summary.tokenEstimate }} / {{ summary.tokenBudget }}
              {{ t('intelligence.audit.contextTokens') }}
            </span>
            <span>{{ summary.itemCount }} {{ t('intelligence.audit.contextItems') }}</span>
          </p>
          <p class="AuditRecordDetail-Line is-secondary">
            <span
              >{{ t('intelligence.audit.contextSources') }}: {{ formatSourceTypes(summary) }}</span
            >
            <span v-if="summary.retrievalItemCount">
              {{ t('intelligence.audit.contextRetrieval') }}: {{ summary.retrievalItemCount }}
            </span>
            <span v-if="summary.citationCount">
              {{ t('intelligence.audit.contextCitations') }}: {{ summary.citationCount }}
            </span>
            <span v-if="summary.retrievalStatus">
              {{ t('intelligence.audit.contextRetrievalStatus') }}: {{ summary.retrievalStatus }}
            </span>
          </p>
          <p v-if="summary.degradedReason" class="AuditRecordDetail-Line is-warning">
            {{ t('intelligence.audit.contextDegradedReason') }}: {{ summary.degradedReason }}
          </p>
          <p v-if="summary.excludedCount" class="AuditRecordDetail-Line is-warning">
            <span>{{ t('intelligence.audit.contextExcluded') }}: {{ summary.excludedCount }}</span>
            <span v-if="summary.policyBlockedCount">
              {{ t('intelligence.audit.contextPolicyBlocked') }}: {{ summary.policyBlockedCount }}
            </span>
            <span v-if="summary.tombstoneCount">
              {{ t('intelligence.audit.contextTombstoned') }}: {{ summary.tombstoneCount }}
            </span>
            <span v-if="summary.prunedCount">
              {{ t('intelligence.audit.contextPruned') }}: {{ summary.prunedCount }}
            </span>
          </p>
          <p v-if="summary.tombstoneCount" class="AuditRecordDetail-Line is-warning">
            {{ t('intelligence.audit.contextTombstoneNotice', { count: summary.tombstoneCount }) }}
          </p>

          <div v-if="summary.includedItems.length" class="AuditRecordDetail-Group">
            <h5>{{ t('intelligence.audit.contextIncludedSources') }}</h5>
            <p
              v-for="item in summary.includedItems"
              :key="`included-${item.sourceType}-${item.sourceId}-${item.reason}`"
              class="AuditRecordDetail-Item"
            >
              <span>{{ formatExplainItem(item) }}</span>
              <span v-if="formatCitation(item)" class="AuditRecordDetail-Citation">
                {{ t('intelligence.audit.contextCitation') }}: {{ formatCitation(item) }}
              </span>
            </p>
          </div>
          <div v-if="summary.excludedItems.length" class="AuditRecordDetail-Group">
            <h5>{{ t('intelligence.audit.contextExcludedSources') }}</h5>
            <p
              v-for="item in summary.excludedItems"
              :key="`excluded-${item.sourceType}-${item.sourceId}-${item.reason}`"
              class="AuditRecordDetail-Item is-warning"
            >
              {{ formatExplainItem(item) }}
            </p>
          </div>

          <div class="AuditRecordDetail-Group">
            <h5>{{ t('intelligence.audit.contextCheckpoints') }}</h5>
            <p v-if="checkpointsLoading?.[summary.sessionId]" class="AuditRecordDetail-State">
              <TxSpinner :size="14" />
              {{ t('intelligenceAudit.records.detail.contextLoading') }}
            </p>
            <p
              v-else-if="checkpointsFailed?.[summary.sessionId]"
              class="AuditRecordDetail-State is-error"
            >
              {{ t('intelligence.audit.contextLoadFailed') }}
            </p>
            <p v-else-if="!checkpointsFor(summary).length" class="AuditRecordDetail-State">
              {{ t('intelligence.audit.contextCheckpointsEmpty') }}
            </p>
            <template v-else>
              <p
                v-for="checkpoint in checkpointsFor(summary)"
                :key="checkpoint.id"
                class="AuditRecordDetail-Item"
              >
                <span
                  >{{ checkpoint.type }} · {{ checkpoint.reason }} ·
                  {{ checkpoint.contextScope }}</span
                >
                <span v-if="checkpoint.metadataKeys.length" class="AuditRecordDetail-Citation">
                  {{ t('intelligence.audit.contextMetadataKeys') }}:
                  {{ checkpoint.metadataKeys.join(', ') }}
                </span>
              </p>
            </template>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped lang="scss">
.AuditRecordDetail {
  display: grid;
  gap: var(--shell-space-4);
  font-size: var(--shell-fs-body);
}

.AuditRecordDetail-Grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--shell-space-3) var(--shell-space-5);
  margin: 0;

  > div {
    display: grid;
    min-width: 0;
    gap: 2px;
  }

  > div.is-wide {
    grid-column: 1 / -1;
  }

  dt {
    color: var(--shell-text-muted);
    font-size: var(--shell-fs-caption);
  }

  dd {
    display: flex;
    min-width: 0;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--shell-space-2);
    margin: 0;
    color: var(--shell-text-primary);
    overflow-wrap: anywhere;
  }

  code {
    padding: 1px var(--shell-space-1);
    border-radius: var(--shell-radius-sm);
    background: var(--shell-surface-2);
    color: var(--shell-text-regular);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: var(--shell-fs-caption);
  }
}

.AuditRecordDetail-Meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--shell-space-1);
}

.AuditRecordDetail-Context {
  display: grid;
  gap: var(--shell-space-2);
  padding-top: var(--shell-space-4);
  border-top: 1px solid var(--shell-border);

  h4 {
    display: flex;
    align-items: center;
    gap: var(--shell-space-2);
    margin: 0;
    font-size: var(--shell-fs-body);
  }
}

.AuditRecordDetail-Count {
  min-width: 18px;
  padding: 0 var(--shell-space-1);
  border-radius: 999px;
  background: var(--shell-surface-2);
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-caption);
  text-align: center;
}

.AuditRecordDetail-State {
  display: flex;
  align-items: center;
  gap: var(--shell-space-2);
  margin: 0;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-caption);

  &.is-error {
    color: var(--shell-danger);
  }
}

.AuditRecordDetail-Packages {
  display: grid;
  gap: var(--shell-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.AuditRecordDetail-Package {
  display: grid;
  gap: var(--shell-space-1);
  padding: var(--shell-space-3);
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-md);
  background: var(--shell-surface);
}

.AuditRecordDetail-Line {
  display: flex;
  flex-wrap: wrap;
  gap: var(--shell-space-1) var(--shell-space-3);
  margin: 0;
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-caption);

  strong {
    color: var(--shell-primary);
  }

  &.is-secondary {
    color: var(--shell-text-secondary);
  }

  &.is-warning {
    color: var(--shell-warning);
  }
}

.AuditRecordDetail-Group {
  display: grid;
  gap: 2px;
  margin-top: var(--shell-space-2);

  h5 {
    margin: 0;
    color: var(--shell-text-secondary);
    font-size: var(--shell-fs-caption);
    font-weight: 600;
  }
}

.AuditRecordDetail-Item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-caption);
  line-height: 1.5;
  overflow-wrap: anywhere;

  &.is-warning {
    color: var(--shell-warning);
  }
}

.AuditRecordDetail-Citation {
  color: var(--shell-text-muted);
}

@media (max-width: 680px) {
  .AuditRecordDetail-Grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
