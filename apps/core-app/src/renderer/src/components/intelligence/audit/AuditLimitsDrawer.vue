<script setup lang="ts">
import type {
  UsageInsights,
  UsageLimits
} from '@talex-touch/utils/transport/sdk/domains/intelligence'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxDrawer } from '@talex-touch/tuffex/drawer'
import { TxNumberInput } from '@talex-touch/tuffex/number-input'
import { useIntelligenceSdk } from '@talex-touch/utils/renderer'
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import InsightsNotice from '~/components/settings/insights/InsightsNotice.vue'
import AuditZeroCostNotice from './AuditZeroCostNotice.vue'

/**
 * Editing the global usage limits (parent PRD R-C1 / R-C2 / R-D5): requests, Token and estimated
 * cost, per local day and per local month. An empty field is no limit; saving replaces all six.
 */
defineOptions({ name: 'AuditLimitsDrawer' })

const props = defineProps<{
  /** The limits in force, when the page already has them; otherwise read on open. */
  limits?: UsageLimits | null
  zeroCostModels?: UsageInsights['zeroCostModels']
}>()

const visible = defineModel<boolean>('visible', { default: false })

const emit = defineEmits<{
  saved: [limits: UsageLimits]
}>()

const { t } = useI18n()
const sdk = useIntelligenceSdk()

type LimitKey = keyof UsageLimits

const EMPTY_LIMITS: UsageLimits = {
  requestsPerDay: null,
  requestsPerMonth: null,
  tokensPerDay: null,
  tokensPerMonth: null,
  costUsdPerDay: null,
  costUsdPerMonth: null
}

const draft = reactive<UsageLimits>({ ...EMPTY_LIMITS })
const saving = ref(false)
const reading = ref(false)
const error = ref('')

const ROWS = [
  {
    metric: 'requests',
    labelKey: 'intelligenceAudit.limits.requests',
    day: 'requestsPerDay',
    month: 'requestsPerMonth'
  },
  {
    metric: 'tokens',
    labelKey: 'intelligenceAudit.limits.tokens',
    day: 'tokensPerDay',
    month: 'tokensPerMonth'
  },
  {
    metric: 'cost',
    labelKey: 'intelligenceAudit.limits.cost',
    day: 'costUsdPerDay',
    month: 'costUsdPerMonth'
  }
] as const satisfies ReadonlyArray<{
  metric: 'requests' | 'tokens' | 'cost'
  labelKey: string
  day: LimitKey
  month: LimitKey
}>

const FIELD_KEYS: Record<LimitKey, string> = {
  requestsPerDay: 'intelligenceAudit.limits.items.requestsPerDay',
  requestsPerMonth: 'intelligenceAudit.limits.items.requestsPerMonth',
  tokensPerDay: 'intelligenceAudit.limits.items.tokensPerDay',
  tokensPerMonth: 'intelligenceAudit.limits.items.tokensPerMonth',
  costUsdPerDay: 'intelligenceAudit.limits.items.costUsdPerDay',
  costUsdPerMonth: 'intelligenceAudit.limits.items.costUsdPerMonth'
}

function isCost(key: LimitKey): boolean {
  return key === 'costUsdPerDay' || key === 'costUsdPerMonth'
}

function fill(limits: UsageLimits): void {
  for (const key of Object.keys(EMPTY_LIMITS) as LimitKey[]) draft[key] = limits[key] ?? null
}

/** Every open starts from what is in force, never from an abandoned edit. */
watch(visible, async (open) => {
  if (!open) return
  error.value = ''
  if (props.limits) {
    fill(props.limits)
    return
  }
  fill(EMPTY_LIMITS)
  reading.value = true
  try {
    fill(await sdk.getUsageLimits())
  } catch {
    error.value = t('intelligenceAudit.limits.readFailed')
  } finally {
    reading.value = false
  }
})

/**
 * The same rule the main process enforces (`INVALID_REQUEST`): counts are whole numbers above
 * zero, costs are above zero; empty is no limit. Checked here first so the message can name the
 * field, which the host's generic failure cannot.
 */
function validate(): string {
  for (const key of Object.keys(EMPTY_LIMITS) as LimitKey[]) {
    const value = draft[key]
    if (value === null) continue
    const field = t(FIELD_KEYS[key])
    if (isCost(key)) {
      if (!Number.isFinite(value) || value <= 0) {
        return t('intelligenceAudit.limits.invalidCost', { field })
      }
    } else if (!Number.isInteger(value) || value <= 0) {
      return t('intelligenceAudit.limits.invalidCount', { field })
    }
  }
  return ''
}

const hasZeroCostModels = computed(() => (props.zeroCostModels?.length ?? 0) > 0)

async function save(): Promise<void> {
  if (saving.value || reading.value) return
  const problem = validate()
  if (problem) {
    error.value = problem
    return
  }
  error.value = ''
  saving.value = true
  try {
    // A plain object: the transport structured-clones the payload, and a reactive proxy cannot be.
    const saved = await sdk.setUsageLimits({ ...draft })
    toast.success(t('intelligenceAudit.limits.saved'))
    emit('saved', saved)
    visible.value = false
  } catch {
    error.value = t('intelligenceAudit.limits.saveFailed')
  } finally {
    saving.value = false
  }
}

function setField(key: LimitKey, value: number | null): void {
  draft[key] = value
  if (error.value) error.value = ''
}
</script>

<template>
  <TxDrawer
    v-model:visible="visible"
    :title="t('intelligenceAudit.limits.drawerTitle')"
    size="560px"
    data-testid="audit-limits-drawer"
  >
    <form id="audit-limits-form" class="AuditLimitsForm" novalidate @submit.prevent="save">
      <p class="AuditLimitsForm-Intro">{{ t('intelligenceAudit.limits.drawerIntro') }}</p>

      <div
        class="AuditLimitsForm-Grid"
        role="group"
        :aria-label="t('intelligenceAudit.limits.drawerTitle')"
      >
        <span aria-hidden="true" />
        <span class="AuditLimitsForm-ColumnHead" aria-hidden="true">
          {{ t('intelligenceAudit.limits.day') }}
        </span>
        <span class="AuditLimitsForm-ColumnHead" aria-hidden="true">
          {{ t('intelligenceAudit.limits.month') }}
        </span>

        <template v-for="row in ROWS" :key="row.metric">
          <span class="AuditLimitsForm-RowHead" :data-metric="row.metric">
            {{ t(row.labelKey) }}
            <small v-if="row.metric === 'cost'">{{
              t('intelligenceAudit.limits.estimated')
            }}</small>
          </span>
          <TxNumberInput
            v-for="key in [row.day, row.month]"
            :key="key"
            class="AuditLimitsForm-Input"
            :model-value="draft[key]"
            :min="isCost(key) ? 0.01 : 1"
            :step="isCost(key) ? 0.5 : row.metric === 'tokens' ? 1000 : 1"
            :precision="isCost(key) ? 2 : 0"
            :placeholder="t('intelligenceAudit.limits.unlimited')"
            :disabled="saving || reading"
            :decrease-label="t('intelligenceAudit.limits.decrease')"
            :increase-label="t('intelligenceAudit.limits.increase')"
            :aria-label="t(FIELD_KEYS[key])"
            :data-testid="`audit-limit-${key}`"
            @update:model-value="setField(key, $event)"
          />
        </template>
      </div>

      <p class="AuditLimitsForm-Note">{{ t('intelligenceAudit.limits.costNote') }}</p>

      <AuditZeroCostNotice v-if="hasZeroCostModels" :models="zeroCostModels ?? []" />

      <InsightsNotice
        v-if="error"
        tone="error"
        :description="error"
        data-testid="audit-limits-error"
      />
    </form>

    <template #footer>
      <div class="AuditLimitsForm-Actions">
        <TxButton :disabled="saving" @click="visible = false">
          {{ t('intelligenceAudit.actions.cancel') }}
        </TxButton>
        <TxButton
          type="primary"
          native-type="submit"
          form="audit-limits-form"
          :loading="saving"
          :disabled="reading"
          data-testid="audit-limits-save"
        >
          {{ t('intelligenceAudit.actions.save') }}
        </TxButton>
      </div>
    </template>
  </TxDrawer>
</template>

<style scoped lang="scss">
.AuditLimitsForm {
  display: grid;
  gap: var(--shell-space-4);
}

.AuditLimitsForm-Intro,
.AuditLimitsForm-Note {
  margin: 0;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-body);
  line-height: 1.6;
}

.AuditLimitsForm-Note {
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
}

/* Metric down the side, day and month across the top: six fields read as one table. */
.AuditLimitsForm-Grid {
  display: grid;
  grid-template-columns: minmax(96px, auto) minmax(0, 1fr) minmax(0, 1fr);
  align-items: center;
  gap: var(--shell-space-3) var(--shell-space-4);
}

.AuditLimitsForm-ColumnHead {
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
}

.AuditLimitsForm-RowHead {
  display: flex;
  flex-direction: column;
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-body);
  font-weight: 600;

  small {
    color: var(--shell-warning);
    font-size: var(--shell-fs-caption);
    font-weight: normal;
  }
}

.AuditLimitsForm-Input {
  width: 100%;
  min-width: 0;
}

.AuditLimitsForm-Actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--shell-space-2);
}
</style>
