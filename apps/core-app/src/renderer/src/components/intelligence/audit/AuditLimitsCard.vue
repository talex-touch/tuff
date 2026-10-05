<script setup lang="ts">
import type { UsageLimitsStatus } from '@talex-touch/utils/transport/sdk/domains/intelligence'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxCard } from '@talex-touch/tuffex/card'
import { TxProgressBar } from '@talex-touch/tuffex/progress-bar'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatCompact, formatInteger, formatResetTime, formatUsd } from './audit-format'
import { USAGE_LIMIT_LABEL_KEYS } from './audit-labels'

/**
 * How far the configured global limits are from their tops (parent PRD R-C6 / R-D5).
 *
 * One row per configured limit; nothing configured is one line and a button. A row reaching 80 %
 * turns amber, a row at its top reads 已暂停 with the local time it resets — the same moment the
 * main process stops refusing calls.
 */
defineOptions({ name: 'AuditLimitsCard' })

const props = defineProps<{
  limits?: UsageLimitsStatus | null
  loading?: boolean
}>()

const emit = defineEmits<{
  /** The reader wants the editor; the drawer is the page's. */
  edit: []
}>()

const { t, locale } = useI18n()

type LimitItem = UsageLimitsStatus['items'][number]

function formatAmount(item: LimitItem, value: number): string {
  if (item.metric === 'cost') return formatUsd(value, locale.value)
  if (item.metric === 'tokens') return formatCompact(value, locale.value)
  return formatInteger(value, locale.value)
}

const percentFormatter = computed(
  () => new Intl.NumberFormat(locale.value, { style: 'percent', maximumFractionDigits: 0 })
)

const rows = computed(() =>
  (props.limits?.items ?? []).map((item) => {
    const time = formatResetTime(item.resetsAt, locale.value)
    // Floored so 79.6 % never prints as the 80 % that would contradict the row's own colour; the
    // epsilon keeps 0.29 × 100 = 28.999… from flooring to 28.
    const percent = percentFormatter.value.format(
      Math.floor(Math.max(0, item.ratio) * 100 + 1e-9) / 100
    )
    return {
      key: item.key,
      state: item.state,
      label: t(USAGE_LIMIT_LABEL_KEYS[item.key]),
      usage: t('intelligenceAudit.limits.usage', {
        used: formatAmount(item, item.used),
        max: formatAmount(item, item.max)
      }),
      percentage: Math.min(100, Math.max(0, item.ratio * 100)),
      status:
        item.state === 'reached'
          ? ('error' as const)
          : item.state === 'warn'
            ? ('warning' as const)
            : ('' as const),
      foot:
        item.state === 'reached'
          ? t('intelligenceAudit.limits.reached', { time })
          : item.state === 'warn'
            ? t('intelligenceAudit.limits.warn', { percent, time })
            : t('intelligenceAudit.limits.resets', { percent, time })
    }
  })
)
</script>

<template>
  <TxCard
    class="AuditLimitsCard"
    shadow="none"
    data-testid="audit-limits"
    :aria-hidden="loading ? 'true' : undefined"
  >
    <header class="AuditLimitsCard-Header">
      <div>
        <h3>{{ t('intelligenceAudit.limits.title') }}</h3>
        <p>{{ t('intelligenceAudit.limits.description') }}</p>
      </div>
      <TxButton size="sm" :disabled="loading" data-testid="audit-limits-edit" @click="emit('edit')">
        {{ rows.length ? t('intelligenceAudit.limits.edit') : t('intelligenceAudit.limits.set') }}
      </TxButton>
    </header>

    <div v-if="loading || !limits" class="AuditLimitsCard-Skeleton">
      <TxSkeleton width="40%" :height="12" :radius="4" />
    </div>

    <p v-else-if="rows.length === 0" class="AuditLimitsCard-None" data-testid="audit-limits-none">
      {{ t('intelligenceAudit.limits.none') }}
    </p>

    <ul v-else class="AuditLimitsCard-List">
      <li
        v-for="row in rows"
        :key="row.key"
        class="AuditLimitsCard-Row"
        :class="`is-${row.state}`"
        :data-key="row.key"
        :data-state="row.state"
      >
        <div class="AuditLimitsCard-RowHead">
          <span class="AuditLimitsCard-Label">{{ row.label }}</span>
          <span class="AuditLimitsCard-Usage">{{ row.usage }}</span>
        </div>
        <TxProgressBar
          :percentage="row.percentage"
          :status="row.status"
          height="6px"
          :aria-label="`${row.label} ${row.usage}`"
        />
        <p class="AuditLimitsCard-Foot">
          <span
            v-if="row.state !== 'ok'"
            :class="row.state === 'reached' ? 'i-ri-pause-circle-line' : 'i-ri-error-warning-line'"
            aria-hidden="true"
          />
          {{ row.foot }}
        </p>
      </li>
    </ul>
  </TxCard>
</template>

<style scoped lang="scss">
.AuditLimitsCard {
  padding: var(--shell-space-5) var(--shell-space-6);
}

.AuditLimitsCard-Header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--shell-space-3);

  h3 {
    margin: 0;
    font-size: var(--shell-fs-lg);
    line-height: 1.3;
  }

  p {
    max-width: 64ch;
    margin: var(--shell-space-1) 0 0;
    color: var(--shell-text-secondary);
    font-size: var(--shell-fs-body);
    line-height: 1.5;
  }
}

.AuditLimitsCard-Skeleton {
  display: flex;
  align-items: center;
  height: calc(var(--shell-fs-body) * 1.5);
  margin-top: var(--shell-space-4);
}

.AuditLimitsCard-None {
  margin: var(--shell-space-4) 0 0;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-body);
  line-height: 1.5;
}

.AuditLimitsCard-List {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--shell-space-4) var(--shell-space-6);
  margin: var(--shell-space-4) 0 0;
  padding: 0;
  list-style: none;
}

.AuditLimitsCard-Row {
  display: grid;
  gap: var(--shell-space-2);
  min-width: 0;
}

.AuditLimitsCard-RowHead {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--shell-space-3);
  font-size: var(--shell-fs-body);
}

.AuditLimitsCard-Label {
  color: var(--shell-text-primary);
  font-weight: 600;
}

.AuditLimitsCard-Usage {
  color: var(--shell-text-secondary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.AuditLimitsCard-Foot {
  display: flex;
  align-items: center;
  gap: var(--shell-space-1);
  margin: 0;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);

  > span {
    display: inline-flex;
    width: 12px;
    height: 12px;
    flex: none;
  }
}

/* The ink says the state with the words; colour is only the second carrier. */
.AuditLimitsCard-Row.is-warn .AuditLimitsCard-Foot {
  color: var(--shell-warning);
}

.AuditLimitsCard-Row.is-reached .AuditLimitsCard-Foot {
  color: var(--shell-danger);
  font-weight: 600;
}

@media (max-width: 900px) {
  .AuditLimitsCard {
    padding: var(--shell-space-5);
  }
}

@media (max-width: 680px) {
  .AuditLimitsCard-List {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
