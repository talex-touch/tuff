<script setup lang="ts">
import type { AllocationSegment } from '@talex-touch/tuffex/allocation-bar'
import type { DataTableColumn, DataTableSortState } from '@talex-touch/tuffex/data-table'
import type { FilterChipItem, FilterChipValue } from '@talex-touch/tuffex/filter-chips'
import type { ITuffIcon } from '@talex-touch/utils'
import type {
  BreakdownRow,
  ModelBreakdownRow,
  ModelPricing,
  UsageInsights
} from '@talex-touch/utils/transport/sdk/domains/intelligence'
import { TxAllocationBar } from '@talex-touch/tuffex/allocation-bar'
import { TxCard } from '@talex-touch/tuffex/card'
import { TxDataTable } from '@talex-touch/tuffex/data-table'
import { TxFilterChips } from '@talex-touch/tuffex/filter-chips'
import { TxIcon } from '@talex-touch/tuffex/icon'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  formatCompact,
  formatInteger,
  formatPricePerMillion,
  formatTokenLimit,
  formatUsd
} from './audit-format'
import { zeroCostModelsWithUsage } from './audit-zero-cost'
import AuditZeroCostNotice from './AuditZeroCostNotice.vue'
import { useAuditLabels } from './useAuditLabels'

/**
 * Where the usage went: by channel, model, capability or caller (parent PRD R-D4).
 *
 * All four come back in one read, so switching dimension draws, it does not fetch. A share bar
 * gives the top five by Token and folds the rest into 其他; the sortable table under it has every
 * row. Detail rows exist only for calls made while audit was on and still inside retention, so
 * when they cover less than the window's total the card says how much.
 */
defineOptions({ name: 'AuditBreakdownCard' })

type Dimension = 'channel' | 'model' | 'capability' | 'caller'

const props = defineProps<{
  insights?: UsageInsights | null
  loading?: boolean
}>()

const { t, locale } = useI18n()
const labels = useAuditLabels()

const dimension = ref<Dimension>('channel')
const activeSegment = ref<string | undefined>(undefined)
/** Biggest first by Token, like the bar above the table. */
const sort = ref<DataTableSortState | null>({ key: 'totalTokens', order: 'desc' })

const dimensionItems = computed<FilterChipItem[]>(() => [
  { value: 'channel', label: t('intelligenceAudit.breakdown.channel') },
  { value: 'model', label: t('intelligenceAudit.breakdown.model') },
  { value: 'capability', label: t('intelligenceAudit.breakdown.capability') },
  { value: 'caller', label: t('intelligenceAudit.breakdown.caller') }
])

function setDimension(value: FilterChipValue): void {
  if (value === 'channel' || value === 'model' || value === 'capability' || value === 'caller') {
    dimension.value = value
    activeSegment.value = undefined
  }
}

/**
 * Numeric columns open on their largest values: a reader sorting "failures" wants the worst
 * first, and the table's own cycle starts ascending.
 */
function setSort(next: DataTableSortState | null): void {
  if (next && next.key !== sort.value?.key) {
    sort.value = { key: next.key, order: next.key === 'name' ? 'asc' : 'desc' }
    return
  }
  sort.value = next
}

interface BreakdownView {
  /** Unique within the dimension: the row's identity for the table and the share bar. */
  rowKey: string
  name: string
  /** A second line: the raw id of a deleted channel, the channel of a model. */
  detail: string
  /** Channel rows: the channel's mark; `null` draws the placeholder glyph. */
  icon?: ITuffIcon | null
  deleted: boolean
  requestCount: number
  totalTokens: number
  estimatedCostUsd: number
  failureCount: number
  pricing?: ModelPricing
}

function baseView(
  row: BreakdownRow
): Omit<BreakdownView, 'rowKey' | 'name' | 'detail' | 'deleted'> {
  return {
    requestCount: row.requestCount,
    totalTokens: row.totalTokens,
    estimatedCostUsd: row.estimatedCostUsd,
    failureCount: row.failureCount
  }
}

const rows = computed<BreakdownView[]>(() => {
  const breakdown = props.insights?.breakdown
  if (!breakdown) return []
  switch (dimension.value) {
    case 'channel':
      return breakdown.channel.map((row) => {
        const channel = labels.channel(row.key)
        return {
          ...baseView(row),
          rowKey: row.key,
          name: channel.name,
          detail: channel.deleted ? row.key : '',
          icon: channel.icon,
          deleted: channel.deleted
        }
      })
    case 'model':
      return breakdown.model.map((row: ModelBreakdownRow) => {
        const channel = labels.channel(row.providerId)
        return {
          ...baseView(row),
          rowKey: row.key,
          name: row.model,
          detail: channel.name,
          deleted: false,
          pricing: row.pricing
        }
      })
    case 'capability':
      return breakdown.capability.map((row) => ({
        ...baseView(row),
        rowKey: row.key,
        name: labels.capability(row.key),
        detail: labels.capability(row.key) === row.key ? '' : row.key,
        deleted: false
      }))
    default:
      return breakdown.caller.map((row) => {
        const caller = labels.caller(row.key, row.operation)
        return {
          ...baseView(row),
          // `''` rows are split again by operation, so the caller alone is not unique.
          rowKey: JSON.stringify([row.key, row.operation ?? null]),
          name: caller.label,
          // A row without a caller says so — the records drawer's filter uses the same words.
          // Otherwise the older Home rows read as a second copy of the `core.home.*` row.
          detail:
            row.key === ''
              ? t('intelligenceAudit.records.callerNone')
              : caller.kind === 'plugin' || caller.kind === 'core'
                ? row.key
                : '',
          deleted: false
        }
      })
  }
})

/** Share by Token; a window of failures only (no tokens anywhere) falls back to requests. */
const shareByTokens = computed(() => rows.value.some((row) => row.totalTokens > 0))

/**
 * Five slot colours checked for adjacent colour-vision separation as a run (blue, orange, teal,
 * purple, pink), then neutral grey for the folded rest. A slot follows the rank in this view —
 * the same order the table opens in — and the table repeats it as a dot beside each name.
 */
const SEGMENT_COLORS = [
  'var(--tx-chart-categorical-1, #4290f0)',
  'var(--tx-chart-categorical-6, #d37536)',
  'var(--tx-chart-categorical-5, #50c3b6)',
  'var(--tx-chart-categorical-4, #8d58ee)',
  'var(--tx-chart-categorical-3, #e8649d)'
]
const OTHER_COLOR = 'var(--tx-chart-semantic-disabled, #cbcbcb)'
const OTHER_KEY = '__audit-breakdown-other__'
const TOP_COUNT = 5

const ranked = computed(() =>
  [...rows.value]
    .map((row) => ({ row, share: shareByTokens.value ? row.totalTokens : row.requestCount }))
    .filter((entry) => entry.share > 0)
    .sort((left, right) => right.share - left.share)
)

/** A rank's colour: its slot in the top five, or the grey of 其他 for the rows folded into it. */
const colorByKey = computed(() => {
  const colors = new Map<string, string>()
  ranked.value.forEach((entry, index) => {
    colors.set(entry.row.rowKey, SEGMENT_COLORS[index] ?? OTHER_COLOR)
  })
  return colors
})

/** The rows 其他 stands for: ranked past the top five, each with a share of its own. */
const otherKeys = computed(() => ranked.value.slice(TOP_COUNT).map((entry) => entry.row.rowKey))

const segments = computed<AllocationSegment[]>(() => {
  const total = ranked.value.reduce((sum, entry) => sum + entry.share, 0)
  if (total <= 0) return []
  const top = ranked.value.slice(0, TOP_COUNT).map((entry, index) => ({
    key: entry.row.rowKey,
    label: entry.row.name,
    percent: (entry.share / total) * 100,
    color: SEGMENT_COLORS[index] ?? OTHER_COLOR
  }))
  const rest = ranked.value.slice(TOP_COUNT).reduce((sum, entry) => sum + entry.share, 0)
  if (rest > 0) {
    top.push({
      key: OTHER_KEY,
      label: t('intelligenceAudit.breakdown.other'),
      percent: (rest / total) * 100,
      color: OTHER_COLOR
    })
  }
  return top
})

const percentFormatter = computed(() => {
  const formatter = new Intl.NumberFormat(locale.value, {
    style: 'percent',
    maximumFractionDigits: 1
  })
  return (percent: number) =>
    percent > 0 && percent < 0.1 ? `< ${formatter.format(0.001)}` : formatter.format(percent / 100)
})

/**
 * The share bar is a radio group, so one segment is always picked — the largest until the reader
 * picks another. The table tints the same row (every folded row, for 其他), so the two never
 * disagree about which is meant.
 */
const highlightedKeys = computed(() => {
  const key = activeSegment.value ?? segments.value[0]?.key
  if (!key) return []
  return key === OTHER_KEY ? otherKeys.value : [key]
})

/**
 * Column widths. The model dimension adds two columns, so its figures are set tighter: the card's
 * body is under 700 px wide and the model name still needs room.
 */
const WIDTHS = {
  wide: { requestCount: 88, totalTokens: 96, estimatedCostUsd: 104, failureCount: 72 },
  model: { requestCount: 64, totalTokens: 72, estimatedCostUsd: 88, failureCount: 56 }
}

const columns = computed<DataTableColumn<BreakdownView>[]>(() => {
  const widths = dimension.value === 'model' ? WIDTHS.model : WIDTHS.wide
  const base: DataTableColumn<BreakdownView>[] = [
    {
      key: 'name',
      title: t(`intelligenceAudit.breakdown.${dimension.value}`),
      auto: true,
      sortable: true
    },
    {
      key: 'requestCount',
      title: t('intelligenceAudit.breakdown.columns.requests'),
      align: 'right',
      nowrap: true,
      sortable: true,
      width: widths.requestCount
    },
    {
      key: 'totalTokens',
      title: t('intelligenceAudit.breakdown.columns.tokens'),
      align: 'right',
      nowrap: true,
      sortable: true,
      width: widths.totalTokens
    },
    {
      key: 'estimatedCostUsd',
      title: t('intelligenceAudit.breakdown.columns.cost'),
      align: 'right',
      nowrap: true,
      sortable: true,
      width: widths.estimatedCostUsd
    },
    {
      key: 'failureCount',
      title: t('intelligenceAudit.breakdown.columns.failures'),
      align: 'right',
      nowrap: true,
      sortable: true,
      width: widths.failureCount
    }
  ]
  if (dimension.value !== 'model') return base
  return [
    ...base,
    {
      key: 'price',
      title: t('intelligenceAudit.breakdown.columns.price'),
      align: 'right',
      nowrap: true,
      width: 136
    },
    {
      key: 'limits',
      title: t('intelligenceAudit.breakdown.columns.limits'),
      align: 'right',
      nowrap: true,
      width: 108
    }
  ]
})

interface SkeletonRow {
  key: string
}

/** The skeleton's placeholder rows: five, about what a channel breakdown holds. */
const SKELETON_ROWS: SkeletonRow[] = Array.from({ length: 5 }, (_, index) => ({
  key: `skeleton-${index}`
}))

/**
 * The loaded table's columns for the skeleton — same titles, widths and sort buttons, so the same
 * header height. The skeleton table is `inert`, so those buttons cannot be reached.
 */
const skeletonColumns = computed<DataTableColumn<SkeletonRow>[]>(() =>
  columns.value.map(({ key, title, align, nowrap, width, auto, sortable }) => ({
    key,
    title,
    align,
    nowrap,
    width,
    auto,
    sortable
  }))
)

/** The price cell's tooltip: which number is input and which output, and per how many tokens. */
function priceTitle(pricing: ModelPricing): string {
  return t('intelligenceAudit.records.detail.priceValue', {
    input: formatPricePerMillion(pricing.inputPerMTokens, locale.value),
    output: formatPricePerMillion(pricing.outputPerMTokens, locale.value)
  })
}

function limitsTitle(pricing: ModelPricing): string {
  return t('intelligenceAudit.breakdown.limitsValue', {
    context: formatTokenLimit(pricing.contextTokens, locale.value),
    output: formatTokenLimit(pricing.outputLimitTokens, locale.value)
  })
}

const PRICING_LABEL_KEYS: Record<ModelPricing['status'], string> = {
  priced: 'intelligenceAudit.pricing.priced',
  free: 'intelligenceAudit.pricing.free',
  local: 'intelligenceAudit.pricing.local',
  credits: 'intelligenceAudit.pricing.credits',
  unpriced: 'intelligenceAudit.pricing.unpriced'
}

function pricingLabel(pricing: ModelPricing): string {
  return t(PRICING_LABEL_KEYS[pricing.status])
}

/**
 * Coverage of the window's calls by detail rows. Under 100 % the share bar and the table describe
 * part of the traffic only, and the card says so — and why that can happen.
 */
const coverage = computed(() => {
  const value = props.insights?.breakdown.coverage
  if (!value || value.totalRequests <= 0) return null
  const ratio = Math.min(1, Math.max(0, value.detailRequests / value.totalRequests))
  if (ratio >= 1) return null
  return {
    percent: new Intl.NumberFormat(locale.value, {
      style: 'percent',
      maximumFractionDigits: 1
    }).format(Math.floor(ratio * 1000) / 1000),
    detail: formatInteger(value.detailRequests, locale.value),
    total: formatInteger(value.totalRequests, locale.value)
  }
})

const zeroCostModels = computed(() =>
  props.insights ? zeroCostModelsWithUsage(props.insights) : []
)
</script>

<template>
  <TxCard
    class="AuditBreakdownCard"
    shadow="none"
    data-testid="audit-breakdown"
    :data-dimension="dimension"
    :aria-hidden="loading ? 'true' : undefined"
  >
    <header class="AuditBreakdownCard-Header">
      <h3>{{ t('intelligenceAudit.breakdown.title') }}</h3>
      <TxFilterChips
        :model-value="dimension"
        :items="dimensionItems"
        role="tablist"
        :aria-label="t('intelligenceAudit.breakdown.dimensionLabel')"
        :disabled="loading"
        data-testid="audit-breakdown-dimension"
        @update:model-value="setDimension"
      />
    </header>

    <template v-if="loading || !insights">
      <!--
        The loaded card's own parts at their loaded sizes, so nothing below it moves when the
        numbers arrive: the share label, the bar and its legend, then the table itself — the same
        header and row height — holding five placeholder rows.
      -->
      <div class="AuditBreakdownCard-Share AuditBreakdownCard-ShareSkeleton">
        <p class="AuditBreakdownCard-ShareLabel">
          <TxSkeleton
            class="AuditBreakdownCard-InlineSkeleton"
            :width="72"
            :height="10"
            :radius="4"
          />
        </p>
        <TxSkeleton width="100%" :height="36" :radius="18" />
        <!-- 20.5 px: the loaded legend's chip, 11 px text in 2 px of padding. -->
        <div class="AuditBreakdownCard-ChipSkeletons">
          <TxSkeleton v-for="index in 4" :key="index" :width="88" :height="20.5" :radius="10" />
        </div>
      </div>
      <TxDataTable
        class="AuditBreakdownCard-Table"
        :columns="skeletonColumns"
        :data="SKELETON_ROWS"
        row-key="key"
        :hover="false"
        inert
        data-testid="audit-breakdown-table-skeleton"
      >
        <template v-for="column in skeletonColumns" :key="column.key" #[`cell-${column.key}`]>
          <TxSkeleton
            class="AuditBreakdownCard-InlineSkeleton"
            :width="column.key === 'name' ? 140 : 36"
            :height="12"
            :radius="4"
          />
        </template>
      </TxDataTable>
    </template>

    <template v-else>
      <p
        v-if="rows.length === 0"
        class="AuditBreakdownCard-Empty"
        data-testid="audit-breakdown-empty"
      >
        {{ t('intelligenceAudit.breakdown.empty') }}
      </p>

      <template v-else>
        <div class="AuditBreakdownCard-Share">
          <p class="AuditBreakdownCard-ShareLabel">
            {{
              shareByTokens
                ? t('intelligenceAudit.breakdown.shareByTokens')
                : t('intelligenceAudit.breakdown.shareByRequests')
            }}
          </p>
          <TxAllocationBar
            v-if="segments.length"
            v-model="activeSegment"
            :segments="segments"
            :aria-label="
              shareByTokens
                ? t('intelligenceAudit.breakdown.shareByTokens')
                : t('intelligenceAudit.breakdown.shareByRequests')
            "
            :percent-formatter="percentFormatter"
            data-testid="audit-breakdown-share"
          />
        </div>

        <TxDataTable
          class="AuditBreakdownCard-Table"
          :columns="columns"
          :data="rows"
          row-key="rowKey"
          :sort="sort"
          sort-cycle="bi"
          :selected-keys="highlightedKeys"
          highlight-selected
          data-testid="audit-breakdown-table"
          @update:sort="setSort"
        >
          <template #cell-name="{ row }">
            <span class="AuditBreakdownCard-Name" :data-row-key="row.rowKey">
              <span
                v-if="colorByKey.get(row.rowKey)"
                class="AuditBreakdownCard-Dot"
                :style="{ background: colorByKey.get(row.rowKey) }"
                aria-hidden="true"
              />
              <span v-else class="AuditBreakdownCard-Dot is-empty" aria-hidden="true" />
              <template v-if="dimension === 'channel'">
                <TxIcon
                  v-if="row.icon"
                  class="AuditBreakdownCard-Icon"
                  :icon="row.icon"
                  :size="14"
                />
                <span
                  v-else
                  class="AuditBreakdownCard-Icon i-ri-question-line"
                  aria-hidden="true"
                />
              </template>
              <span class="AuditBreakdownCard-NameText">
                <span class="AuditBreakdownCard-Primary" :title="row.name">{{ row.name }}</span>
                <span v-if="row.detail" class="AuditBreakdownCard-Detail" :title="row.detail">
                  {{ row.detail }}
                </span>
              </span>
              <span v-if="row.deleted" class="AuditBreakdownCard-Badge">
                {{ t('intelligenceAudit.breakdown.deleted') }}
              </span>
            </span>
          </template>
          <template #cell-requestCount="{ row }">
            {{ formatInteger(row.requestCount, locale) }}
          </template>
          <template #cell-totalTokens="{ row }">
            <span :title="formatInteger(row.totalTokens, locale)">
              {{ formatCompact(row.totalTokens, locale) }}
            </span>
          </template>
          <template #cell-estimatedCostUsd="{ row }">
            {{ formatUsd(row.estimatedCostUsd, locale) }}
          </template>
          <template #cell-failureCount="{ row }">
            <span :class="{ 'AuditBreakdownCard-Failures': row.failureCount > 0 }">
              {{ formatInteger(row.failureCount, locale) }}
            </span>
          </template>
          <template #cell-price="{ row }">
            <template v-if="row.pricing">
              <span
                v-if="row.pricing.status === 'priced'"
                class="AuditBreakdownCard-Price"
                :title="priceTitle(row.pricing)"
              >
                {{ formatPricePerMillion(row.pricing.inputPerMTokens, locale) }}
                /
                {{ formatPricePerMillion(row.pricing.outputPerMTokens, locale) }}
              </span>
              <span v-else class="AuditBreakdownCard-Badge" :data-status="row.pricing.status">
                {{ pricingLabel(row.pricing) }}
              </span>
            </template>
          </template>
          <template #cell-limits="{ row }">
            <span v-if="row.pricing" :title="limitsTitle(row.pricing)">
              {{ formatTokenLimit(row.pricing.contextTokens, locale) }}
              /
              {{ formatTokenLimit(row.pricing.outputLimitTokens, locale) }}
            </span>
          </template>
        </TxDataTable>

        <AuditZeroCostNotice
          v-if="dimension === 'model' && zeroCostModels.length"
          class="AuditBreakdownCard-ZeroCost"
          :models="zeroCostModels"
        />
      </template>

      <p v-if="coverage" class="AuditBreakdownCard-Coverage" data-testid="audit-breakdown-coverage">
        {{ t('intelligenceAudit.breakdown.coverage', coverage) }}
      </p>
    </template>
  </TxCard>
</template>

<style scoped lang="scss">
.AuditBreakdownCard {
  padding: var(--shell-space-5) var(--shell-space-6);
}

.AuditBreakdownCard-Header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--shell-space-3);

  h3 {
    margin: 0;
    font-size: var(--shell-fs-lg);
    line-height: 1.3;
  }
}

.AuditBreakdownCard-Share {
  display: grid;
  gap: var(--shell-space-2);
  margin-top: var(--shell-space-4);

  /*
   * TuffEx lays the legend out as one row that never wraps: six callers squeezed every chip
   * until its name broke mid-word (「应用内其 / 他」). Whole chips wrap to a second line instead.
   */
  :deep(.tx-bui-allocation-bar__legend) {
    flex-wrap: wrap;
  }

  :deep(.tx-bui-allocation-bar__chip) {
    white-space: nowrap;
  }
}

.AuditBreakdownCard-ShareLabel {
  margin: 0;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
  /* Explicit, so the skeleton's label line is the same height without any text in it. */
  line-height: 1.5;
}

/*
 * A placeholder sitting on a text line rather than replacing it: an inline block keeps the line's
 * strut, so a placeholder row is exactly as tall as a row of text.
 */
.AuditBreakdownCard-InlineSkeleton {
  display: inline-block;
  vertical-align: middle;
}

.AuditBreakdownCard-ChipSkeletons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--shell-space-2);
}

/*
 * The table language the voice log uses: neutral hover, a quiet frame, and a selected row tinted
 * rather than coloured, through the variables `TxDataTable` publishes for exactly this.
 */
.AuditBreakdownCard-Table {
  --tx-data-table-row-hover-bg: color-mix(in srgb, var(--shell-text-primary) 5%, transparent);
  --tx-data-table-row-selected-bg: color-mix(in srgb, var(--shell-text-primary) 8%, transparent);

  margin-top: var(--shell-space-4);
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-md);
  /* Scrolls rather than clips: a column cut off at the card's edge reads as missing data. */
  overflow-x: auto;
  overflow-y: hidden;
  font-variant-numeric: tabular-nums;
}

.AuditBreakdownCard-Name {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--shell-space-2);
}

.AuditBreakdownCard-Dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  flex: none;
  border-radius: 50%;

  &.is-empty {
    background: transparent;
  }
}

.AuditBreakdownCard-Icon {
  display: inline-flex;
  width: 14px;
  height: 14px;
  flex: none;
  color: var(--shell-text-secondary);
}

.AuditBreakdownCard-NameText {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.AuditBreakdownCard-Primary,
.AuditBreakdownCard-Detail {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.AuditBreakdownCard-Primary {
  color: var(--shell-text-primary);
}

.AuditBreakdownCard-Detail {
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
}

/* A state chip: soft fill and the same hue's ink, with the word carrying the meaning. */
.AuditBreakdownCard-Badge {
  flex: none;
  padding: 1px var(--shell-space-2);
  border-radius: 999px;
  background: var(--shell-surface-2);
  color: var(--shell-text-regular);
  font-size: var(--shell-fs-caption);
  white-space: nowrap;

  &[data-status='unpriced'] {
    background: var(--shell-warning-soft);
    color: var(--shell-warning);
  }
}

.AuditBreakdownCard-Failures {
  color: var(--shell-danger);
  font-weight: 600;
}

.AuditBreakdownCard-ZeroCost {
  margin-top: var(--shell-space-4);
}

.AuditBreakdownCard-Empty,
.AuditBreakdownCard-Coverage {
  margin: var(--shell-space-4) 0 0;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-caption);
  line-height: 1.6;
}

.AuditBreakdownCard-Empty {
  font-size: var(--shell-fs-body);
}

@media (max-width: 900px) {
  .AuditBreakdownCard {
    padding: var(--shell-space-5);
  }
}
</style>
