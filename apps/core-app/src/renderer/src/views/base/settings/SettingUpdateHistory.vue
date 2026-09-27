<script setup lang="ts" name="SettingUpdateHistory">
import type {
  UpdateHistoryEntry,
  UpdateHistoryOutcome,
  UpdateLifecyclePhase
} from '@talex-touch/utils'
import { TxButton } from '@talex-touch/tuffex/button'
import { computed, onMounted, ref, shallowRef, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import TuffStatusBadge from '~/components/tuff/TuffStatusBadge.vue'
import { useUpdateRuntime } from '~/modules/hooks/useUpdateRuntime'
import { formatUpdateVersionLabel } from './update-status-display'

const HISTORY_LIMIT = 20
const COLLAPSED_ROWS = 5
/** The phases that end an update; reaching one adds a row. */
const FINISHED_PHASES: ReadonlySet<UpdateLifecyclePhase> = new Set([
  'healthy',
  'recovered',
  'failed'
])

/** Updated and failed use the badge's own tone icons; a rollback reads as "undone", not as a warning. */
const OUTCOME_BADGES: Record<
  UpdateHistoryOutcome,
  { labelKey: string; status: 'success' | 'warning' | 'danger'; icon?: string }
> = {
  updated: {
    labelKey: 'settings.settingUpdate.history.outcome.updated',
    status: 'success'
  },
  'rolled-back': {
    labelKey: 'settings.settingUpdate.history.outcome.rolledBack',
    status: 'warning',
    icon: 'i-carbon-undo'
  },
  failed: {
    labelKey: 'settings.settingUpdate.history.outcome.failed',
    status: 'danger'
  }
}

const { t, locale } = useI18n()
const { lifecycleSnapshot, getUpdateHistory } = useUpdateRuntime()

const entries = shallowRef<UpdateHistoryEntry[]>([])
const expanded = ref(false)
const listId = useId()
let loadSequence = 0

const visibleEntries = computed(() =>
  expanded.value ? entries.value : entries.value.slice(0, COLLAPSED_ROWS)
)
const canExpand = computed(() => entries.value.length > COLLAPSED_ROWS)

const dateFormats = computed(() => {
  const time = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' } as const
  return {
    thisYear: new Intl.DateTimeFormat(locale.value, time),
    otherYear: new Intl.DateTimeFormat(locale.value, { ...time, year: 'numeric' })
  }
})

function formatFinishedAt(timestamp: number): string {
  const date = new Date(timestamp)
  const format =
    date.getFullYear() === new Date().getFullYear()
      ? dateFormats.value.thisYear
      : dateFormats.value.otherYear
  return format.format(date)
}

async function loadHistory(): Promise<void> {
  const sequence = ++loadSequence
  const next = await getUpdateHistory(HISTORY_LIMIT)
  if (sequence === loadSequence) entries.value = next
}

onMounted(() => {
  void loadHistory()
})

// An attempt that finishes while the page is open (usually a failed download) adds its row now
// rather than on the next visit.
watch(
  () => lifecycleSnapshot.value,
  (next, previous) => {
    if (!next || !previous || !FINISHED_PHASES.has(next.phase)) return
    if (next.attemptId === previous.attemptId && FINISHED_PHASES.has(previous.phase)) return
    void loadHistory()
  }
)
</script>

<template>
  <!-- No skeleton: the card may well stay empty, and one that appears only to vanish jumps more. -->
  <TuffGroupBlock
    v-if="entries.length > 0"
    class="update-history"
    :name="t('settings.settingUpdate.history.title')"
    :collapsible="false"
  >
    <div :id="listId">
      <TuffBlockSlot
        v-for="entry in visibleEntries"
        :key="entry.attemptId"
        :title="formatUpdateVersionLabel(entry.toVersion)"
        :description="formatFinishedAt(entry.finishedAt)"
      >
        <TuffStatusBadge
          :text="t(OUTCOME_BADGES[entry.outcome].labelKey)"
          :status="OUTCOME_BADGES[entry.outcome].status"
          :icon="OUTCOME_BADGES[entry.outcome].icon"
          :title="entry.outcome === 'failed' ? entry.error?.message : undefined"
        />
      </TuffBlockSlot>
    </div>

    <!--
      A row of its own, so it carries the rows' fill and puts the button on their trailing edge;
      a bare strip left the card looking cut off. The empty label keeps an empty heading out.
    -->
    <TuffBlockSlot v-if="canExpand">
      <template #label />
      <TxButton
        variant="flat"
        size="sm"
        :aria-expanded="expanded"
        :aria-controls="listId"
        @click="expanded = !expanded"
      >
        {{
          expanded
            ? t('settings.settingUpdate.history.showLess')
            : t('settings.settingUpdate.history.showMore')
        }}
      </TxButton>
    </TuffBlockSlot>
  </TuffGroupBlock>
</template>
