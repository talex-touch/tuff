<script setup lang="ts">
import type { UsageInsights } from '@talex-touch/utils/transport/sdk/domains/intelligence'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import InsightsHeroMetric from '~/components/settings/insights/InsightsHeroMetric.vue'
import InsightsMetricCard from '~/components/settings/insights/InsightsMetricCard.vue'
import {
  formatCompact,
  formatInteger,
  formatResetTime,
  formatSuccessRate,
  formatUsd,
  latencyParts
} from './audit-format'
import { otherTokens } from './audit-trend'
import { zeroCostModelsWithUsage } from './audit-zero-cost'
import AuditZeroCostNotice from './AuditZeroCostNotice.vue'

/**
 * The figures the page leads with: Token as the answer, then requests, success rate, latency and
 * the estimated cost as its working (parent PRD D11).
 *
 * `loading` draws the same containers with placeholder bars, so the skeleton and the loaded
 * headline cannot drift apart in size.
 */
defineOptions({ name: 'AuditHeadline' })

const props = defineProps<{
  insights?: UsageInsights | null
  loading?: boolean
}>()

const { t, locale } = useI18n()

const zeroCostModels = computed(() =>
  props.insights ? zeroCostModelsWithUsage(props.insights) : []
)
/**
 * Input, output and — only when a provider reported tokens on neither side — the remainder, in
 * the trend chart's colours and order, so the split here and the bars below read as one key.
 */
const tokenSplit = computed(() => {
  const totals = props.insights?.totals
  if (!totals) return []
  const parts = [
    {
      key: 'input',
      label: t('intelligenceAudit.metrics.input'),
      value: totals.promptTokens,
      color: 'var(--tx-chart-categorical-1, #4290f0)'
    },
    {
      key: 'output',
      label: t('intelligenceAudit.metrics.output'),
      value: totals.completionTokens,
      color: 'var(--tx-chart-categorical-6, #d37536)'
    }
  ]
  const other = otherTokens(totals)
  if (other > 0) {
    parts.push({
      key: 'other',
      label: t('intelligenceAudit.metrics.otherTokens'),
      value: other,
      color: 'var(--tx-chart-categorical-4, #8d58ee)'
    })
  }
  return parts.map((part) => ({ ...part, display: formatCompact(part.value, locale.value) }))
})

/**
 * Where the estimate comes from. It rides the cost figure's label as a hover note: a figure that
 * is an estimate has to say so where it is read, not in a footnote.
 */
const costNote = computed(() => {
  const pricing = props.insights?.pricing
  if (!pricing?.available || pricing.fetchedAt === null) {
    return t('intelligenceAudit.metrics.costNoteNoCatalog')
  }
  return t('intelligenceAudit.metrics.costNote', {
    time: formatResetTime(pricing.fetchedAt, locale.value)
  })
})

const supportMetrics = computed(() => {
  const totals = props.insights?.totals
  if (!totals) return []
  const latency = latencyParts(totals.avgLatencyMs, locale.value)
  return [
    {
      key: 'requests',
      value: formatCompact(totals.requestCount, locale.value),
      unit: '',
      label: t('intelligenceAudit.metrics.requests', {
        success: formatInteger(totals.successCount, locale.value),
        failure: formatInteger(totals.failureCount, locale.value)
      }),
      note: undefined
    },
    {
      key: 'success-rate',
      value: formatSuccessRate(totals.successCount, totals.requestCount, locale.value) ?? '—',
      unit: '',
      label: t('intelligenceAudit.metrics.successRate'),
      note: undefined
    },
    {
      key: 'latency',
      value: latency.value,
      unit: latency.unit,
      label: t('intelligenceAudit.metrics.latency'),
      note: undefined
    },
    {
      key: 'cost',
      value: formatUsd(totals.estimatedCostUsd, locale.value),
      unit: '',
      label: t('intelligenceAudit.metrics.cost'),
      note: costNote.value
    }
  ]
})
</script>

<template>
  <section
    class="AuditHeadline"
    :class="{ 'is-loading': loading }"
    :aria-label="loading ? undefined : t('intelligenceAudit.metrics.label')"
    :aria-hidden="loading ? 'true' : undefined"
    data-testid="audit-headline"
  >
    <div class="AuditHeadline-HeroRow">
      <template v-if="loading || !insights">
        <!--
          The hero's own two lines at their own sizes, each a line box tall, with a bar inside:
          the kit's hero has no slot to draw a placeholder in, so this mirrors its two rows.
        -->
        <div class="AuditHeadline-HeroSkeleton">
          <div class="AuditHeadline-SkeletonLabel">
            <TxSkeleton :width="44" :height="12" :radius="4" />
          </div>
          <div class="AuditHeadline-SkeletonValue">
            <TxSkeleton :width="132" :height="28" :radius="6" />
          </div>
        </div>
        <div class="AuditHeadline-Split">
          <span class="AuditHeadline-SplitItem">
            <TxSkeleton :width="160" :height="12" :radius="4" />
          </span>
        </div>
      </template>
      <template v-else>
        <InsightsHeroMetric
          :label="t('intelligenceAudit.metrics.tokens')"
          :value="formatCompact(insights.totals.totalTokens, locale)"
          data-testid="audit-hero-metric"
          data-metric="tokens"
        />
        <!-- The kit's hero carries one figure; the input / output split is the page's line. -->
        <dl
          class="AuditHeadline-Split"
          :aria-label="t('intelligenceAudit.metrics.splitLabel')"
          data-testid="audit-token-split"
        >
          <div
            v-for="part in tokenSplit"
            :key="part.key"
            class="AuditHeadline-SplitItem"
            :data-part="part.key"
          >
            <dt>
              <span
                class="AuditHeadline-Dot"
                :style="{ background: part.color }"
                aria-hidden="true"
              />
              {{ part.label }}
            </dt>
            <dd>{{ part.display }}</dd>
          </div>
        </dl>
      </template>
    </div>

    <div class="AuditHeadline-SupportGrid">
      <template v-if="loading || !insights">
        <InsightsMetricCard v-for="index in 4" :key="index" class="AuditHeadline-Metric">
          <TxSkeleton :width="96" :height="28" :radius="4" />
          <TxSkeleton :width="72" :height="12" :radius="4" />
        </InsightsMetricCard>
      </template>
      <template v-else>
        <InsightsMetricCard
          v-for="metric in supportMetrics"
          :key="metric.key"
          class="AuditHeadline-Metric"
          value-class="AuditHeadline-MetricValue"
          :value="metric.value"
          :unit="metric.unit"
          :label="metric.label"
          :note="metric.note"
          :note-test-id="metric.key === 'cost' ? 'audit-cost-note' : undefined"
          :data-metric="metric.key"
        />
      </template>
    </div>

    <!--
      Always one line: either the models the estimate leaves out, or that it leaves none out. A
      line that came and went with the data would move the chart under the reader.
    -->
    <div class="AuditHeadline-CostBasis">
      <div v-if="loading || !insights" class="AuditHeadline-SkeletonCaption">
        <TxSkeleton :width="280" :height="11" :radius="4" />
      </div>
      <AuditZeroCostNotice v-else variant="inline" :models="zeroCostModels" />
    </div>
  </section>
</template>

<style scoped lang="scss">
.AuditHeadline {
  display: grid;
  /*
   * One track that may shrink below its content. With the default `auto` track the one-line cost
   * basis below — `nowrap`, and as long as its model list — sized the whole grid, and the
   * headline spilled out of the 760 px column it sits in.
   */
  grid-template-columns: minmax(0, 1fr);
  min-width: 0;
  gap: var(--shell-space-4);
}

.AuditHeadline-HeroRow {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--shell-space-3) var(--shell-space-6);
}

/*
 * The hero's two rows, measured off `InsightsHeroMetric`: a 12px label line and a 30px figure at
 * line-height 1.1, `--shell-space-2` apart. Each placeholder sits in a box one line tall at the
 * real font size, so the block is as tall as the hero it stands in for.
 */
.AuditHeadline-HeroSkeleton {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-2);
}

.AuditHeadline-SkeletonLabel {
  display: flex;
  align-items: center;
  height: 1lh;
  margin: 0;
  font-size: var(--shell-fs-sm);
}

.AuditHeadline-SkeletonValue {
  display: flex;
  align-items: center;
  height: 1lh;
  font-size: var(--shell-fs-display);
  line-height: 1.1;
}

.AuditHeadline-Split {
  display: flex;
  flex-wrap: wrap;
  gap: var(--shell-space-2) var(--shell-space-5);
  margin: 0;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-body);
}

.AuditHeadline-SplitItem {
  display: flex;
  align-items: baseline;
  gap: var(--shell-space-2);
  min-height: 1lh;

  dt {
    display: inline-flex;
    align-items: center;
    gap: var(--shell-space-1);
  }

  dd {
    margin: 0;
    color: var(--shell-text-primary);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
}

/* The series' colour beside the words, never on them: text stays in text ink. */
.AuditHeadline-Dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  flex: none;
  border-radius: 50%;
}

/* Four supporting figures: requests, success rate, latency, estimated cost. */
.AuditHeadline-SupportGrid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--shell-space-4);
}

.AuditHeadline-CostBasis {
  min-width: 0;
  min-height: calc(var(--shell-fs-caption) * 1.5);
  font-size: var(--shell-fs-caption);
  line-height: 1.5;
}

.AuditHeadline-SkeletonCaption {
  display: flex;
  align-items: center;
  height: 1lh;
  margin: 0;
}

@media (max-width: 900px) {
  .AuditHeadline-SupportGrid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 480px) {
  .AuditHeadline-SupportGrid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
