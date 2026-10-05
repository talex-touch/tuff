<script lang="ts" name="IntelligenceAuditPage" setup>
import type { FilterChipItem, FilterChipValue } from '@talex-touch/tuffex/filter-chips'
import type {
  UsageLimits,
  UsageLimitsStatus,
  UsageRange
} from '@talex-touch/utils/transport/sdk/domains/intelligence'
import type { AuditExportFormat } from '~/components/intelligence/audit/audit-export'
import type { AuditRecordWindow } from '~/components/intelligence/audit/useAuditRecords'
import type { InsightsMenuItem } from '~/components/settings/insights/types'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxCard } from '@talex-touch/tuffex/card'
import { TxEmptyState } from '@talex-touch/tuffex/empty-state'
import { TxFilterChips } from '@talex-touch/tuffex/filter-chips'
import { computed, provide, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { formatInteger, formatResetTime } from '~/components/intelligence/audit/audit-format'
import { zeroCostModelsWithUsage } from '~/components/intelligence/audit/audit-zero-cost'
import AuditBreakdownCard from '~/components/intelligence/audit/AuditBreakdownCard.vue'
import AuditHeadline from '~/components/intelligence/audit/AuditHeadline.vue'
import AuditLimitsCard from '~/components/intelligence/audit/AuditLimitsCard.vue'
import AuditLimitsDrawer from '~/components/intelligence/audit/AuditLimitsDrawer.vue'
import AuditRecordsDrawer from '~/components/intelligence/audit/AuditRecordsDrawer.vue'
import AuditSettingsDrawer from '~/components/intelligence/audit/AuditSettingsDrawer.vue'
import AuditTrendCard from '~/components/intelligence/audit/AuditTrendCard.vue'
import { AUDIT_RANGES, useAuditInsights } from '~/components/intelligence/audit/useAuditInsights'
import { useAuditLabels } from '~/components/intelligence/audit/useAuditLabels'
import { AUDIT_RECORDS_KEY, useAuditRecords } from '~/components/intelligence/audit/useAuditRecords'
import InsightsHeader from '~/components/settings/insights/InsightsHeader.vue'
import InsightsMenu from '~/components/settings/insights/InsightsMenu.vue'
import InsightsNotice from '~/components/settings/insights/InsightsNotice.vue'
import SettingsPage from '~/components/settings/SettingsPage.vue'

import { useIntelligenceManager } from '~/modules/hooks/useIntelligenceManager'

/**
 * 设置 › 智能 › 审计, as an insights page (parent PRD D3 / R-D1–R-D8): how much AI was used, where
 * it went, what failed and how far the limits are — with the call records, the settings and the
 * limit editor in drawers rather than down a long page.
 *
 * Numbers come from one read (`useAuditInsights`); the records list is the page's
 * (`useAuditRecords`), handed to its drawer, so the ⋯ menu's export reads the drawer's filters.
 */
const { t, locale } = useI18n()

const {
  range,
  insights,
  pending,
  refreshing,
  loadFailed,
  showSkeleton,
  showLoadingShell,
  load,
  setRange
} = useAuditInsights()
const records = useAuditRecords()
provide(AUDIT_RECORDS_KEY, records)
const { exporting } = records
const labels = useAuditLabels()
const { globalConfig, updateGlobalConfig, saveSettings } = useIntelligenceManager()

const recordsOpen = ref(false)
const settingsOpen = ref(false)
const limitsOpen = ref(false)
const enablingAudit = ref(false)

const RANGE_LABEL_KEYS: Record<UsageRange, string> = {
  today: 'intelligenceAudit.range.today',
  '7d': 'intelligenceAudit.range.last7Days',
  '30d': 'intelligenceAudit.range.last30Days'
}

const rangeItems = computed<FilterChipItem[]>(() =>
  AUDIT_RANGES.map((value) => ({ value, label: t(RANGE_LABEL_KEYS[value]) }))
)

function onRangeChange(value: FilterChipValue): void {
  const next = AUDIT_RANGES.find((candidate) => candidate === value)
  if (next) setRange(next)
}

/**
 * Whether call records are being kept, as the user set it. The renderer's own copy of the setting,
 * so the notice is there with the page's first frame and follows the switch the moment it flips
 * — the main process reads the same setting from the same store.
 */
const auditEnabled = computed(() => Boolean(globalConfig.value.enableAudit))

const hasCalls = computed(() => (insights.value?.totals.requestCount ?? 0) > 0)

/** The records drawer and the export cover the window the page shows. */
const recordWindow = computed<AuditRecordWindow | null>(() => {
  const value = insights.value
  if (!value) return null
  return {
    range: value.window.range,
    startMs: value.window.startMs,
    endMs: value.window.endMs,
    timezone: value.timezone
  }
})

/* ─── limits notices ─── */

type LimitItem = UsageLimitsStatus['items'][number]

const LIMIT_LABEL_KEYS: Record<keyof UsageLimits, string> = {
  requestsPerDay: 'intelligenceAudit.limits.items.requestsPerDay',
  requestsPerMonth: 'intelligenceAudit.limits.items.requestsPerMonth',
  tokensPerDay: 'intelligenceAudit.limits.items.tokensPerDay',
  tokensPerMonth: 'intelligenceAudit.limits.items.tokensPerMonth',
  costUsdPerDay: 'intelligenceAudit.limits.items.costUsdPerDay',
  costUsdPerMonth: 'intelligenceAudit.limits.items.costUsdPerMonth'
}

const limitItems = computed<LimitItem[]>(() => insights.value?.limits.items ?? [])
const reachedLimits = computed(() => limitItems.value.filter((item) => item.state === 'reached'))
const warnLimits = computed(() => limitItems.value.filter((item) => item.state === 'warn'))

function limitNames(items: readonly LimitItem[]): string {
  return items
    .map((item) => t(LIMIT_LABEL_KEYS[item.key]))
    .join(t('intelligenceAudit.notices.separator'))
}

/**
 * Calls stay refused until the last of the reached limits resets, so that is the time the notice
 * gives: the earliest one would promise a recovery that does not happen.
 */
const reachedNotice = computed(() => {
  const items = reachedLimits.value
  if (items.length === 0) return ''
  const resetsAt = Math.max(...items.map((item) => item.resetsAt))
  return t('intelligenceAudit.notices.limitReached', {
    limits: limitNames(items),
    time: formatResetTime(resetsAt, locale.value)
  })
})

const warnNotice = computed(() => {
  const items = warnLimits.value
  if (items.length === 0) return ''
  const highest = Math.max(...items.map((item) => item.ratio))
  return t('intelligenceAudit.notices.limitWarn', {
    limits: limitNames(items),
    // Floored so 79.6 % never prints as an 80 % the main process has not reached.
    percent: new Intl.NumberFormat(locale.value, {
      style: 'percent',
      maximumFractionDigits: 0
    }).format(Math.floor(highest * 100 + 1e-9) / 100)
  })
})

/* ─── actions ─── */

async function enableAudit(): Promise<void> {
  if (enablingAudit.value) return
  enablingAudit.value = true
  updateGlobalConfig({ enableAudit: true })
  try {
    await saveSettings()
  } catch {
    toast.error(t('intelligenceAudit.settings.saveFailed'))
  } finally {
    enablingAudit.value = false
  }
  void load()
}

const exportLabels = {
  channel: (id: string) => labels.channel(id).name,
  capability: (id: string) => labels.capability(id),
  caller: (caller: string, operation?: string | null) => labels.caller(caller, operation).label
}

async function exportRecords(format: AuditExportFormat): Promise<void> {
  const exportWindow = recordWindow.value
  if (!exportWindow) return
  const outcome = await records.exportRecords(format, exportWindow, exportLabels)
  if (outcome.status === 'done') {
    toast.success(
      t(
        'intelligenceAudit.records.exportDone',
        { count: formatInteger(outcome.count, locale.value) },
        outcome.count
      )
    )
  } else if (outcome.status === 'cancelled') {
    toast(t('intelligenceAudit.records.exportCancelled'))
  } else if (outcome.status === 'failed') {
    toast.error(t('intelligenceAudit.records.exportFailed'))
  }
}

const exportProgress = computed(() => {
  const state = exporting.value
  if (!state) return ''
  return state.total > 0
    ? t('intelligenceAudit.notices.exporting', {
        fetched: formatInteger(state.fetched, locale.value),
        total: formatInteger(state.total, locale.value)
      })
    : t('intelligenceAudit.notices.exportStarting')
})

/** Nothing in the window has a record, so there is nothing an export could write. */
const nothingToExport = computed(
  () => !insights.value || insights.value.breakdown.coverage.detailRequests <= 0
)

const menuItems = computed<InsightsMenuItem[]>(() => [
  {
    key: 'settings',
    icon: 'i-ri-settings-3-line',
    label: t('intelligenceAudit.actions.settings'),
    testId: 'audit-menu-settings'
  },
  {
    key: 'export-csv',
    icon: 'i-ri-file-text-line',
    label: t('intelligenceAudit.actions.exportCsv'),
    disabled: Boolean(exporting.value) || nothingToExport.value,
    separatorBefore: true,
    testId: 'audit-menu-export-csv'
  },
  {
    key: 'export-json',
    icon: 'i-ri-braces-line',
    label: t('intelligenceAudit.actions.exportJson'),
    disabled: Boolean(exporting.value) || nothingToExport.value,
    testId: 'audit-menu-export-json'
  }
])

function runMenuItem(key: string): void {
  if (key === 'settings') settingsOpen.value = true
  else if (key === 'export-csv') void exportRecords('csv')
  else if (key === 'export-json') void exportRecords('json')
}
</script>

<template>
  <SettingsPage back-to="/setting/intelligence" :back-label="t('settingsIntelligenceHub.back')">
    <section class="AuditInsights" data-testid="audit-insights-page" :aria-busy="pending">
      <InsightsHeader
        class="AuditInsights-Header"
        actions-class="AuditInsights-HeaderActions"
        :title="t('settingsIntelligenceHub.audit')"
      >
        <template #actions>
          <!-- Never disabled: an empty log still says why it is empty (audit off, retention). -->
          <TxButton data-testid="audit-records-open" @click="recordsOpen = true">
            <span class="i-ri-history-line" aria-hidden="true" />
            <span>{{ t('intelligenceAudit.actions.records') }}</span>
          </TxButton>
          <InsightsMenu
            :items="menuItems"
            :label="t('intelligenceAudit.actions.more')"
            trigger-test-id="audit-more"
            @select="runMenuItem"
          />
        </template>
      </InsightsHeader>

      <InsightsNotice
        v-if="loadFailed"
        tone="error"
        :title="t('intelligenceAudit.notices.loadFailedTitle')"
        :description="
          insights
            ? t('intelligenceAudit.notices.loadFailedStale')
            : t('intelligenceAudit.notices.loadFailed')
        "
        data-testid="audit-error"
      >
        <template #action>
          <TxButton
            variant="flat"
            size="sm"
            :loading="pending"
            data-testid="audit-retry"
            @click="load"
          >
            {{ t('intelligenceAudit.actions.retry') }}
          </TxButton>
        </template>
      </InsightsNotice>

      <InsightsNotice
        v-if="exporting"
        tone="info"
        :title="t('intelligenceAudit.notices.exportingTitle')"
        :description="exportProgress"
        data-testid="audit-export-progress"
      >
        <template #action>
          <TxButton
            variant="flat"
            size="sm"
            data-testid="audit-export-cancel"
            @click="records.cancelExport()"
          >
            {{ t('intelligenceAudit.actions.cancelExport') }}
          </TxButton>
        </template>
      </InsightsNotice>

      <!-- Totals, the trend and the limits still count while it is off; only records stop. -->
      <InsightsNotice
        v-if="!auditEnabled"
        tone="warning"
        :title="t('intelligenceAudit.notices.auditOffTitle')"
        :description="t('intelligenceAudit.notices.auditOff')"
        data-testid="audit-off"
      >
        <template #action>
          <TxButton
            variant="flat"
            size="sm"
            :loading="enablingAudit"
            data-testid="audit-enable"
            @click="enableAudit"
          >
            {{ t('intelligenceAudit.actions.enableAudit') }}
          </TxButton>
        </template>
      </InsightsNotice>

      <InsightsNotice
        v-if="reachedNotice"
        tone="error"
        :title="t('intelligenceAudit.notices.limitReachedTitle')"
        :description="reachedNotice"
        data-testid="audit-limit-reached"
      >
        <template #action>
          <TxButton variant="flat" size="sm" @click="limitsOpen = true">
            {{ t('intelligenceAudit.actions.editLimits') }}
          </TxButton>
        </template>
      </InsightsNotice>
      <InsightsNotice
        v-else-if="warnNotice"
        tone="warning"
        :title="t('intelligenceAudit.notices.limitWarnTitle')"
        :description="warnNotice"
        data-testid="audit-limit-warn"
      >
        <template #action>
          <TxButton variant="flat" size="sm" @click="limitsOpen = true">
            {{ t('intelligenceAudit.actions.editLimits') }}
          </TxButton>
        </template>
      </InsightsNotice>

      <InsightsNotice
        v-if="insights && !insights.pricing.available"
        tone="info"
        :title="t('intelligenceAudit.notices.pricingTitle')"
        :description="t('intelligenceAudit.notices.pricing')"
        data-testid="audit-pricing-unavailable"
      />

      <div class="AuditInsights-Range">
        <TxFilterChips
          :model-value="range"
          :items="rangeItems"
          role="tablist"
          :aria-label="t('intelligenceAudit.range.label')"
          data-testid="audit-range"
          @update:model-value="onRangeChange"
        />
      </div>

      <!--
        The first load only. The skeleton is the loaded cards' own `loading` form, so the two are
        the same containers and cannot drift apart in size; a later load keeps the numbers on
        screen (dimmed) instead of coming back here.
      -->
      <div
        v-if="showLoadingShell"
        class="AuditInsights-Canvas AuditInsights-Loading"
        data-testid="audit-loading"
        role="status"
      >
        <span class="AuditInsights-SrOnly">{{ t('intelligenceAudit.loading') }}</span>
        <template v-if="showSkeleton">
          <AuditHeadline loading />
          <AuditTrendCard loading />
          <AuditBreakdownCard loading />
          <AuditLimitsCard loading />
        </template>
      </div>

      <main
        v-else-if="insights"
        class="AuditInsights-Canvas"
        :class="{ 'is-refreshing': refreshing }"
        data-testid="audit-data"
        :data-range="insights.window.range"
      >
        <AuditHeadline :insights="insights" />

        <template v-if="hasCalls">
          <AuditTrendCard :insights="insights" />
          <AuditBreakdownCard :insights="insights" />
        </template>
        <TxCard v-else class="AuditInsights-Empty" shadow="none" data-testid="audit-empty">
          <TxEmptyState
            variant="no-data"
            :title="t('intelligenceAudit.empty.title')"
            :description="t('intelligenceAudit.empty.description')"
          />
        </TxCard>

        <AuditLimitsCard :limits="insights.limits" @edit="limitsOpen = true" />

        <footer class="AuditInsights-Footnote">
          <p>{{ t('intelligenceAudit.footnote.freshness') }}</p>
          <p>{{ t('intelligenceAudit.footnote.notAudited') }}</p>
        </footer>
      </main>

      <AuditRecordsDrawer
        v-model:visible="recordsOpen"
        :record-window="recordWindow"
        :insights="insights"
        :audit-enabled="auditEnabled"
        @export="exportRecords"
      />
      <AuditSettingsDrawer
        v-model:visible="settingsOpen"
        :audit="insights?.audit ?? null"
        @changed="load"
      />
      <AuditLimitsDrawer
        v-model:visible="limitsOpen"
        :limits="insights?.limits.limits ?? null"
        :zero-cost-models="insights ? zeroCostModelsWithUsage(insights) : []"
        @saved="load"
      />
    </section>
  </SettingsPage>
</template>

<style lang="scss" scoped>
/*
 * A section on a settings page, not a page: `SettingsPage` already provides the scroller, the
 * column and the inset, as it does for the voice page this one is built like.
 */
.AuditInsights {
  width: 100%;
  min-width: 0;
  color: var(--shell-text-primary);
}

/* The range governs everything below it, so it sits above everything below it. */
.AuditInsights-Range {
  max-width: 1440px;
  margin: 0 auto var(--shell-space-4);
}

.AuditInsights-Canvas {
  display: flex;
  min-width: 0;
  max-width: 1440px;
  flex-direction: column;
  margin: 0 auto;
  gap: var(--shell-space-5);
  transition: opacity 0.15s ease;

  /* A refetch keeps the old numbers up, dimmed, rather than blanking the page under the reader. */
  &.is-refreshing {
    opacity: 0.6;
  }
}

@media (prefers-reduced-motion: reduce) {
  .AuditInsights-Canvas {
    transition: none;
  }
}

.AuditInsights-Loading {
  min-height: 640px;
}

.AuditInsights-Empty {
  padding: var(--shell-space-6);
}

.AuditInsights-Footnote {
  display: grid;
  gap: var(--shell-space-1);

  p {
    margin: 0;
    color: var(--shell-text-muted);
    font-size: var(--shell-fs-caption);
    line-height: 1.5;
  }
}

.AuditInsights-SrOnly {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
