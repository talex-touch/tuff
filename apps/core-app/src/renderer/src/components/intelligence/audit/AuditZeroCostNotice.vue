<script setup lang="ts">
import type {
  PricingStatus,
  UsageInsights
} from '@talex-touch/utils/transport/sdk/domains/intelligence'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatInteger } from './audit-format'
import { useAuditLabels } from './useAuditLabels'

/**
 * The models whose calls add nothing to the estimated cost, and why (parent PRD D13 / R-B5).
 *
 * Shown wherever a cost is estimated — the cost figure, the model breakdown, the cost limit — so
 * a reader can never take a cost, or a cost limit, for complete when part of the traffic is
 * outside it.
 *
 * - `inline`: one line under the headline figures, always drawn (it says so when every call was
 *   priced) so the row never appears or disappears under the reader. The list behind it opens
 *   in place.
 * - `list`: the full list, for the breakdown and the limits drawer. Drawn only when there is
 *   something to list.
 */
defineOptions({ name: 'AuditZeroCostNotice' })

type ZeroCostModel = UsageInsights['zeroCostModels'][number]

const props = withDefaults(
  defineProps<{
    models: readonly ZeroCostModel[]
    variant?: 'inline' | 'list'
  }>(),
  { variant: 'list' }
)

const { t, locale } = useI18n()
const labels = useAuditLabels()
const expanded = ref(false)

/** How many rows the list shows before folding the rest behind "N more". */
const LIST_LIMIT = 8

const REASON_KEYS: Record<PricingStatus, string> = {
  priced: 'intelligenceAudit.pricing.priced',
  free: 'intelligenceAudit.zeroCost.reasons.free',
  local: 'intelligenceAudit.zeroCost.reasons.local',
  credits: 'intelligenceAudit.zeroCost.reasons.credits',
  unpriced: 'intelligenceAudit.zeroCost.reasons.unpriced'
}

const rows = computed(() =>
  props.models.map((model) => ({
    key: JSON.stringify([model.providerId, model.model]),
    model: model.model,
    channel: labels.channel(model.providerId).name,
    status: model.status,
    reason: t(REASON_KEYS[model.status]),
    calls: t(
      'intelligenceAudit.zeroCost.callCount',
      { count: formatInteger(model.requestCount, locale.value) },
      model.requestCount
    )
  }))
)

const callCount = computed(() =>
  props.models.reduce((sum, model) => sum + Math.max(0, model.requestCount), 0)
)

/** Two counts in one sentence, each worded on its own so neither borrows the other's plural. */
const title = computed(() =>
  t('intelligenceAudit.zeroCost.title', {
    models: t(
      'intelligenceAudit.zeroCost.modelCount',
      { count: formatInteger(props.models.length, locale.value) },
      props.models.length
    ),
    calls: t(
      'intelligenceAudit.zeroCost.callCount',
      { count: formatInteger(callCount.value, locale.value) },
      callCount.value
    )
  })
)

/** The inline line names the models in reading order; the list below it has the rest. */
const inlineSummary = computed(() =>
  rows.value
    .map((row) => t('intelligenceAudit.zeroCost.item', { model: row.model, reason: row.reason }))
    .join(t('intelligenceAudit.zeroCost.separator'))
)

const visibleRows = computed(() =>
  props.variant === 'inline' || expanded.value || rows.value.length <= LIST_LIMIT
    ? rows.value
    : rows.value.slice(0, LIST_LIMIT)
)
const hiddenCount = computed(() => rows.value.length - visibleRows.value.length)

const listId = `audit-zero-cost-${Math.random().toString(36).slice(2, 10)}`
</script>

<template>
  <div
    v-if="variant === 'inline'"
    class="AuditZeroCost is-inline"
    :class="{ 'is-expanded': expanded, 'is-clear': rows.length === 0 }"
    data-testid="audit-zero-cost-inline"
  >
    <p class="AuditZeroCost-Line">
      <span class="AuditZeroCost-Icon i-ri-information-line" aria-hidden="true" />
      <template v-if="rows.length === 0">
        <span>{{ t('intelligenceAudit.zeroCost.allPriced') }}</span>
      </template>
      <template v-else>
        <strong>{{ title }}</strong>
        <span class="AuditZeroCost-Summary">{{ inlineSummary }}</span>
        <button
          type="button"
          class="AuditZeroCost-Toggle"
          :aria-expanded="expanded"
          :aria-controls="listId"
          data-testid="audit-zero-cost-toggle"
          @click="expanded = !expanded"
        >
          {{
            expanded ? t('intelligenceAudit.zeroCost.hide') : t('intelligenceAudit.zeroCost.show')
          }}
        </button>
      </template>
    </p>
    <div v-if="rows.length > 0 && expanded" :id="listId" class="AuditZeroCost-Panel">
      <p class="AuditZeroCost-Desc">{{ t('intelligenceAudit.zeroCost.description') }}</p>
      <ul class="AuditZeroCost-List" :aria-label="t('intelligenceAudit.zeroCost.listLabel')">
        <li v-for="row in visibleRows" :key="row.key" :data-status="row.status">
          <span class="AuditZeroCost-Model">{{ row.model }}</span>
          <span class="AuditZeroCost-Channel">{{ row.channel }}</span>
          <span class="AuditZeroCost-Reason">{{ row.reason }}</span>
          <span class="AuditZeroCost-Calls">{{ row.calls }}</span>
        </li>
      </ul>
    </div>
  </div>

  <section
    v-else-if="rows.length > 0"
    class="AuditZeroCost is-list"
    :aria-label="t('intelligenceAudit.zeroCost.listLabel')"
    data-testid="audit-zero-cost-list"
  >
    <p class="AuditZeroCost-Line">
      <span class="AuditZeroCost-Icon i-ri-information-line" aria-hidden="true" />
      <strong>{{ title }}</strong>
    </p>
    <p class="AuditZeroCost-Desc">{{ t('intelligenceAudit.zeroCost.description') }}</p>
    <ul :id="listId" class="AuditZeroCost-List">
      <li v-for="row in visibleRows" :key="row.key" :data-status="row.status">
        <span class="AuditZeroCost-Model">{{ row.model }}</span>
        <span class="AuditZeroCost-Channel">{{ row.channel }}</span>
        <span class="AuditZeroCost-Reason">{{ row.reason }}</span>
        <span class="AuditZeroCost-Calls">{{ row.calls }}</span>
      </li>
    </ul>
    <button
      v-if="hiddenCount > 0"
      type="button"
      class="AuditZeroCost-Toggle"
      :aria-controls="listId"
      :aria-expanded="false"
      @click="expanded = true"
    >
      {{ t('intelligenceAudit.zeroCost.more', { count: formatInteger(hiddenCount, locale) }) }}
    </button>
  </section>
</template>

<style scoped lang="scss">
/*
 * A fact, not a warning: these calls are not wrong, they are just outside the estimate. So it
 * wears the neutral info ramp the insights notices use for facts, not the warning amber.
 */
.AuditZeroCost {
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-caption);
  line-height: 1.5;
}

.AuditZeroCost-Line {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--shell-space-2);
  margin: 0;
}

/*
 * The inline variant is one line, always: it sits between the figures and the chart, and a line
 * that wrapped to two on a long model list would push the chart down under the reader. The full
 * list opens below it instead.
 */
.AuditZeroCost.is-inline .AuditZeroCost-Line {
  white-space: nowrap;

  > strong {
    flex: none;
    color: var(--shell-text-primary);
    font-weight: 600;
  }
}

.AuditZeroCost-Summary {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
}

.AuditZeroCost-Icon {
  display: inline-flex;
  width: 14px;
  height: 14px;
  flex: none;
  color: var(--shell-info);
}

.AuditZeroCost.is-clear .AuditZeroCost-Icon {
  color: var(--shell-text-muted);
}

.AuditZeroCost-Toggle {
  flex: none;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--shell-primary);
  font: inherit;
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }

  &:focus-visible {
    border-radius: var(--shell-radius-sm);
    outline: 2px solid var(--shell-primary-border);
    outline-offset: 2px;
  }
}

.AuditZeroCost-Panel {
  margin-top: var(--shell-space-2);
  padding: var(--shell-space-3) var(--shell-space-4);
  border: 1px solid var(--shell-info-border);
  border-radius: var(--shell-radius-md);
  background: var(--shell-info-soft);
}

.AuditZeroCost.is-list {
  display: grid;
  gap: var(--shell-space-2);
  padding: var(--shell-space-3) var(--shell-space-4);
  border: 1px solid var(--shell-info-border);
  border-radius: var(--shell-radius-md);
  background: var(--shell-info-soft);

  .AuditZeroCost-Line > strong {
    color: var(--shell-text-primary);
    font-weight: 600;
  }
}

.AuditZeroCost-Desc {
  margin: 0;
  color: var(--shell-text-secondary);
}

.AuditZeroCost-List {
  display: grid;
  gap: var(--shell-space-1);
  margin: var(--shell-space-2) 0 0;
  padding: 0;
  list-style: none;

  li {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) auto auto;
    align-items: baseline;
    gap: var(--shell-space-3);
  }
}

.AuditZeroCost.is-list .AuditZeroCost-List {
  margin-top: 0;
}

.AuditZeroCost-Model {
  overflow: hidden;
  color: var(--shell-text-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.AuditZeroCost-Channel {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.AuditZeroCost-Reason {
  padding: 0 var(--shell-space-2);
  border-radius: 999px;
  background: var(--shell-surface-2);
  color: var(--shell-text-regular);
  white-space: nowrap;
}

.AuditZeroCost-Calls {
  color: var(--shell-text-muted);
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}

@media (max-width: 680px) {
  .AuditZeroCost-List li {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .AuditZeroCost-Channel {
    display: none;
  }
}
</style>
