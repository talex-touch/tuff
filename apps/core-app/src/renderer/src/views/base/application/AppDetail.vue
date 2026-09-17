<script lang="ts" name="AppDetail" setup>
import type { ITuffIcon } from '@talex-touch/utils'
import type {
  AppIndexDiagnoseResult,
  AppIndexManagedEntry,
  AppIndexUsageResult
} from '@talex-touch/utils/transport/events/types'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxDrawer } from '@talex-touch/tuffex/drawer'
import { TxEmptyState } from '@talex-touch/tuffex/empty-state'
import { TxScroll } from '@talex-touch/tuffex/scroll'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import { toTfileUrl } from '@talex-touch/utils/network'
import { TxModal } from '@talex-touch/tuffex/modal'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PluginIcon from '~/components/plugin/PluginIcon.vue'
import SettingChip from '~/components/settings/SettingChip.vue'
import FlatInput from '~/components/base/input/FlatInput.vue'
import FlatKeyInput from '~/components/base/input/FlatKeyInput.vue'
import TuffBlockLine from '~/components/tuff/TuffBlockLine.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { resolveAppIndexEntryDiagnosticSummary } from '../settings/app-index-manager-display'

/**
 * One application, in full.
 *
 * The launch-zone list used to print every entry's metadata grid and diagnostic JSON inline,
 * which is a page of text per application. Here it belongs to the selection, and the diagnostic
 * is fetched by the page when an entry is picked — hence `diagnosing`, which is a real wait on
 * a probe rather than a render state.
 */
const props = defineProps<{
  entry: AppIndexManagedEntry | null
  diagnostic: AppIndexDiagnoseResult | null
  usage?: AppIndexUsageResult | null
  usageLoading?: boolean
  shortcut?: string | null
  aliases?: string[]
  /** Maps a catalog item id to its display name, for outbound transition targets. */
  resolveItemName?: (itemId: string) => string | undefined
  diagnosing?: boolean
  busy?: boolean
}>()
const emit = defineEmits<{
  (e: 'launch', entry: AppIndexManagedEntry): void
  (e: 'diagnose', entry: AppIndexManagedEntry): void
  (e: 'rescan', entry: AppIndexManagedEntry): void
  (e: 'set-enabled', entry: AppIndexManagedEntry, enabled: boolean): void
  (e: 'remove', entry: AppIndexManagedEntry): void
  (e: 'copy-diagnostic', entry: AppIndexManagedEntry): void
  (e: 'update-aliases', entry: AppIndexManagedEntry, aliases: string[]): void
  (e: 'update-shortcut', entry: AppIndexManagedEntry, accelerator: string): void
}>()

const { t, locale } = useI18n()

// Same `tfile://` normalization the list applies: the index stores a bare cache path, which
// `TxIcon` cannot fetch and renders as an empty 0x0 glyph.
const icon = computed<ITuffIcon | null>(() => {
  const value = props.entry?.icon?.trim()
  return value ? { type: 'url', value: toTfileUrl(value), colorful: true } : null
})

const title = computed(
  () => props.entry?.displayName || props.entry?.name || props.entry?.path || ''
)

const diagnosticOpen = ref(false)

const diagnosticSummary = computed(() =>
  props.entry ? resolveAppIndexEntryDiagnosticSummary(props.diagnostic ?? undefined, t) : null
)

/**
 * `system` names a launch identity the OS owns (UWP, protocol handlers): re-pointing a path here
 * repairs nothing, so it reads as information rather than as something gone wrong.
 */
function chipTone(tone: string): 'neutral' | 'info' | 'success' | 'warning' {
  switch (tone) {
    case 'success':
      return 'success'
    case 'warning':
      return 'warning'
    case 'system':
      return 'info'
    default:
      return 'neutral'
  }
}

/**
 * Opening is what asks for the probe: the page fetches once per path, so re-opening a drawer for
 * an entry already diagnosed shows the stored verdict without a second run.
 */
function openDiagnostic(): void {
  if (!props.entry) return
  diagnosticOpen.value = true
  emit('diagnose', props.entry)
}

function optional(value: string | undefined): string {
  return value?.trim() || '-'
}

const detailRows = computed(() => {
  const entry = props.entry
  if (!entry) return []
  return [
    { key: 'displayName', value: optional(entry.displayName) },
    {
      key: 'source',
      value:
        entry.source === 'manual'
          ? t('settings.settingFileIndex.appIndexManagerOriginManual')
          : t('settings.settingFileIndex.appIndexManagerOriginScanned')
    },
    { key: 'bundleId', value: optional(entry.bundleId) },
    { key: 'identityKind', value: optional(entry.identityKind) },
    { key: 'launchKind', value: entry.launchKind },
    { key: 'launchTarget', value: optional(entry.launchTarget) },
    { key: 'launchArgs', value: optional(entry.launchArgs) },
    { key: 'workingDirectory', value: optional(entry.workingDirectory) },
    { key: 'displayPath', value: optional(entry.displayPath) }
  ]
})

/** Whether there is anything worth drawing: a never-launched app has no story to tell. */
const hasUsage = computed(() => (props.usage?.executeCount ?? 0) > 0)

/**
 * Hour buckets scaled against the busiest hour rather than the total.
 *
 * Against the total, a flat distribution over 24 hours gives every bar ~4% height and the chart
 * reads as empty. Relative to the peak, the shape is visible whatever the absolute volume.
 */
const hourBars = computed(() => {
  const distribution = props.usage?.hourDistribution ?? []
  const peak = Math.max(1, ...distribution)
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: distribution[hour] ?? 0,
    ratio: (distribution[hour] ?? 0) / peak
  }))
})

const entryPointRows = computed(() =>
  (props.usage?.entryPoints ?? []).map((row) => ({
    ...row,
    label: t(`appDetail.entryPoint.${row.entryPoint}`)
  }))
)

const lastExecutedLabel = computed(() => {
  const timestamp = props.usage?.lastExecutedAt
  if (!timestamp) return '-'
  // The application's locale, not the runtime's: the two disagree whenever the user picked a
  // language other than the one the OS is set to.
  return new Date(timestamp).toLocaleString(locale.value)
})

/**
 * Trend bars scaled against the busiest day, same reasoning as the hour chart: against the total,
 * a flat 30-day series gives every bar ~3% height and reads as empty.
 *
 * Labels are built from the UTC calendar date rather than through `toLocaleDateString`, which
 * renders the local-time rendition of that instant. `usage_trend_daily` buckets by
 * `floor(epochMs / 86400000)` — a UTC day — so in any negative-offset zone the start of a bucket
 * is still the previous evening locally, and every bar would be labelled a day early.
 */
const trendBars = computed(() => {
  const points = props.usage?.trend ?? []
  const peak = Math.max(1, ...points.map((point) => point.count))
  return points.map((point) => {
    const date = new Date(point.timestamp)
    return {
      day: point.day,
      count: point.count,
      ratio: point.count / peak,
      label: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
    }
  })
})

const weekdayBars = computed(() => {
  const distribution = props.usage?.weekdayDistribution ?? []
  const peak = Math.max(1, ...distribution)
  // Sunday-first, matching how the aggregator buckets `getDay()`.
  return Array.from({ length: 7 }, (_, index) => ({
    index,
    count: distribution[index] ?? 0,
    ratio: (distribution[index] ?? 0) / peak,
    label: t(`appDetail.weekday.${index}`)
  }))
})

/**
 * Outbound transitions carry a catalog item id; the panel shows a name.
 *
 * Resolved against the entries the page already holds, so no extra round trip. An id with no
 * matching entry falls back to the raw value rather than being dropped — it is still a real
 * transition, just to something no longer in the index.
 */
const outboundRows = computed(() =>
  (props.usage?.transitionsOut ?? []).map((row) => ({
    ...row,
    label: props.resolveItemName?.(row.toItemId) || row.toItemId
  }))
)

const aliasDraft = ref('')

/**
 * Keyword editing lives in a dialog rather than inline.
 *
 * The invoke group is read as "how do I summon this": a shortcut, and the words that reach it.
 * Editing is the rarer half - an entry gets its aliases once and is then left alone - so the
 * section states them and the dialog changes them, instead of a permanent input row that is
 * empty every time the panel is opened.
 */
const aliasDialogOpen = ref(false)

function openAliasDialog(): void {
  aliasDraft.value = ''
  aliasDialogOpen.value = true
}

/**
 * Adds the typed alias.
 *
 * Case-insensitive duplicate check: `keyword_mappings` lookups are case-folded, so two rows
 * differing only in case are the same alias with one wasted row.
 */
function addAlias(): void {
  const value = aliasDraft.value.trim()
  // `busy` is this entry's own update in flight. The draft list is composed from `props.aliases`,
  // which still holds the pre-update array until the first save returns, so a second submit would
  // send an array without the alias the first one just added — and the parent replaces the whole
  // list, so that earlier alias would be discarded rather than merged.
  if (!value || !props.entry || props.busy) return
  const current = props.aliases ?? []
  if (current.some((alias) => alias.toLowerCase() === value.toLowerCase())) {
    aliasDraft.value = ''
    return
  }
  emit('update-aliases', props.entry, [...current, value])
  aliasDraft.value = ''
}

function removeAlias(alias: string): void {
  if (!props.entry) return
  emit(
    'update-aliases',
    props.entry,
    (props.aliases ?? []).filter((item) => item !== alias)
  )
}
</script>

<template>
  <TxEmptyState
    v-if="!entry"
    class="AppDetail-Empty"
    variant="no-selection"
    size="large"
    :title="t('appDetail.emptyTitle')"
    :description="t('appDetail.emptyDescription')"
    role="status"
    aria-live="polite"
  />

  <div v-else :key="entry.path" class="AppDetail">
    <header class="AppDetail-Head">
      <div class="AppDetail-HeadIcon">
        <PluginIcon v-if="icon" :icon="icon" :alt="title" :size="40" />
        <div v-else class="AppDetail-HeadIconPlaceholder">
          <i class="i-ri-apps-2-line" />
        </div>
      </div>
      <div class="AppDetail-HeadCopy">
        <h2>{{ title }}</h2>
      </div>

      <div class="AppDetail-Launch">
        <TxButton
          variant="flat"
          type="primary"
          class="AppDetail-LaunchMain"
          :disabled="busy"
          @click="emit('launch', entry)"
        >
          {{ t('appConfigure.launchBtn') }}
        </TxButton>
      </div>
    </header>

    <TxScroll class="AppDetail-Body">
      <div class="AppDetail-BodyInner">
        <TuffGroupBlock
          :name="t('appConfigure.action')"
          default-icon="i-ri-auction-line"
          memory-name="app-detail-actions"
        >
          <!--
            Row copy is its own, not the launch-zone manager's: `TuffBlockSlot` rows are a fixed
            56px, so a borrowed paragraph wraps out of its row and over the next one.
          -->
          <TuffBlockSlot
            :title="t('appDetail.recallTitle')"
            :description="
              entry.enabled ? t('appDetail.recallEnabledDesc') : t('appDetail.recallDisabledDesc')
            "
            default-icon="i-carbon-view"
            active-icon="i-carbon-view"
          >
            <TxButton
              variant="flat"
              size="sm"
              :disabled="busy"
              @click="emit('set-enabled', entry, !entry.enabled)"
            >
              {{
                entry.enabled
                  ? t('settings.settingFileIndex.appIndexManagerDisable')
                  : t('settings.settingFileIndex.appIndexManagerEnable')
              }}
            </TxButton>
          </TuffBlockSlot>

          <TuffBlockSlot
            :title="t('appDetail.maintenanceTitle')"
            :description="t('appDetail.maintenanceDesc')"
            default-icon="i-carbon-renew"
            active-icon="i-carbon-renew"
          >
            <div class="AppDetail-InlineActions">
              <TxButton variant="flat" size="sm" :disabled="busy" @click="emit('rescan', entry)">
                {{ t('settings.settingFileIndex.appIndexManagerRescan') }}
              </TxButton>
              <TxButton
                variant="flat"
                size="sm"
                :loading="diagnosing"
                :disabled="busy"
                @click="openDiagnostic"
              >
                {{ t('settings.settingFileIndex.appIndexManagerDiagnose') }}
              </TxButton>
            </div>
          </TuffBlockSlot>

          <TuffBlockSlot
            v-if="entry.removable !== false"
            :title="t('appDetail.removeTitle')"
            :description="t('appDetail.removeDesc')"
            default-icon="i-carbon-trash-can"
            active-icon="i-carbon-trash-can"
          >
            <TxButton
              variant="flat"
              size="sm"
              type="danger"
              :disabled="busy"
              @click="emit('remove', entry)"
            >
              {{ t('common.remove') }}
            </TxButton>
          </TuffBlockSlot>
        </TuffGroupBlock>

        <TuffGroupBlock
          :name="t('appDetail.usageTitle')"
          default-icon="i-carbon-chart-line"
          memory-name="app-detail-usage"
        >
          <TxSkeleton v-if="usageLoading" :rows="3" />

          <!--
            An app with no recorded launch gets a sentence, not an empty chart: zero bars and a
            "0" read as a broken panel rather than as "you have not opened this from Tuff".
          -->
          <TuffBlockLine
            v-else-if="!hasUsage"
            class="AppDetail-UsageEmpty"
            :title="t('appDetail.usageEmptyTitle')"
            :description="t('appDetail.usageEmptyDesc')"
          />

          <template v-else>
            <TuffBlockLine
              :title="t('appDetail.usageLaunchCount')"
              :description="String(usage?.executeCount ?? 0)"
            />
            <TuffBlockLine
              :title="t('appDetail.usageLastLaunched')"
              :description="lastExecutedLabel"
            />

            <!--
              A chart is not a `TuffBlockSlot`: those rows are a fixed 56px built for one control
              on the right, and a 24-column graph placed in one overflows its row. The group's
              default slot is free content, which is what this needs.
            -->
            <section class="AppDetail-UsageSection">
              <h4 class="AppDetail-UsageHeading">{{ t('appDetail.usageHourTitle') }}</h4>
              <p class="AppDetail-UsageHint">{{ t('appDetail.usageHourDesc') }}</p>
              <div class="AppDetail-Hours" role="img" :aria-label="t('appDetail.usageHourTitle')">
                <div v-for="bar in hourBars" :key="bar.hour" class="AppDetail-HourBar">
                  <div
                    class="AppDetail-HourFill"
                    :style="{ height: `${Math.round(bar.ratio * 100)}%` }"
                    :title="t('appDetail.usageHourTooltip', { hour: bar.hour, count: bar.count })"
                  />
                </div>
              </div>
              <div class="AppDetail-HourAxis" aria-hidden="true">
                <span>0</span><span>6</span><span>12</span><span>18</span><span>23</span>
              </div>
            </section>

            <section class="AppDetail-UsageSection">
              <h4 class="AppDetail-UsageHeading">{{ t('appDetail.usageTrendTitle') }}</h4>
              <p class="AppDetail-UsageHint">{{ t('appDetail.usageTrendDesc') }}</p>
              <div class="AppDetail-Trend" role="img" :aria-label="t('appDetail.usageTrendTitle')">
                <div v-for="bar in trendBars" :key="bar.day" class="AppDetail-TrendBar">
                  <div
                    class="AppDetail-TrendFill"
                    :style="{ height: `${Math.round(bar.ratio * 100)}%` }"
                    :title="`${bar.label} · ${bar.count}`"
                  />
                </div>
              </div>
            </section>

            <section class="AppDetail-UsageSection">
              <h4 class="AppDetail-UsageHeading">{{ t('appDetail.usageWeekdayTitle') }}</h4>
              <p class="AppDetail-UsageHint">{{ t('appDetail.usageWeekdayDesc') }}</p>
              <div class="AppDetail-Weekdays">
                <div v-for="bar in weekdayBars" :key="bar.index" class="AppDetail-Weekday">
                  <div class="AppDetail-WeekdayTrack">
                    <div
                      class="AppDetail-WeekdayFill"
                      :style="{ height: `${Math.round(bar.ratio * 100)}%` }"
                      :title="`${bar.label} · ${bar.count}`"
                    />
                  </div>
                  <span class="AppDetail-WeekdayLabel">{{ bar.label }}</span>
                </div>
              </div>
            </section>

            <TuffBlockLine
              v-for="row in entryPointRows"
              :key="row.entryPoint"
              :title="row.label"
              :description="String(row.count)"
            />

            <section v-if="usage?.transitionsIn?.length" class="AppDetail-UsageSection">
              <h4 class="AppDetail-UsageHeading">{{ t('appDetail.usageTransitionTitle') }}</h4>
              <p class="AppDetail-UsageHint">{{ t('appDetail.usageTransitionDesc') }}</p>
              <ul class="AppDetail-Transitions">
                <li v-for="item in usage.transitionsIn" :key="item.fromApp">
                  <span class="AppDetail-TransitionName">{{
                    item.fromAppName || item.fromApp
                  }}</span>
                  <span class="AppDetail-TransitionCount">{{ item.count }}</span>
                </li>
              </ul>
            </section>

            <section v-if="outboundRows.length" class="AppDetail-UsageSection">
              <h4 class="AppDetail-UsageHeading">{{ t('appDetail.usageOutboundTitle') }}</h4>
              <p class="AppDetail-UsageHint">{{ t('appDetail.usageOutboundDesc') }}</p>
              <ul class="AppDetail-Transitions">
                <li v-for="item in outboundRows" :key="item.toItemId">
                  <span class="AppDetail-TransitionName">{{ item.label }}</span>
                  <span class="AppDetail-TransitionCount">{{ item.count }}</span>
                </li>
              </ul>
            </section>
          </template>
        </TuffGroupBlock>

        <!--
          Keywords and a shortcut are the same question asked two ways: how this application gets
          summoned. Splitting them into separate groups made the panel read as a list of unrelated
          settings.
        -->
        <TuffGroupBlock
          :name="t('appDetail.invokeTitle')"
          default-icon="i-carbon-tag"
          memory-name="app-detail-invoke"
        >
          <TuffBlockSlot
            :title="t('appDetail.shortcutTitle')"
            default-icon="i-carbon-keyboard"
            active-icon="i-carbon-keyboard"
          >
            <FlatKeyInput
              :model-value="shortcut ?? ''"
              clearable
              @update:model-value="
                (value) => entry && emit('update-shortcut', entry, String(value))
              "
            />
          </TuffBlockSlot>

          <TuffBlockSlot
            :title="t('appDetail.aliasTitle')"
            default-icon="i-carbon-tag"
            active-icon="i-carbon-tag"
          >
            <div class="AppDetail-AliasSummary">
              <span v-if="aliases?.length" class="AppDetail-AliasCount">
                {{ t('appDetail.aliasCount', { count: aliases.length }) }}
              </span>
              <span v-else class="AppDetail-AliasEmpty">{{ t('appDetail.aliasNone') }}</span>
              <TxButton variant="flat" size="sm" :disabled="busy" @click="openAliasDialog">
                {{ t('appDetail.aliasManage') }}
              </TxButton>
            </div>
          </TuffBlockSlot>
        </TuffGroupBlock>

        <TuffGroupBlock
          :name="t('appConfigure.stats')"
          default-icon="i-ri-dashboard-horizontal-line"
          memory-name="app-detail-stats"
        >
          <TuffBlockLine
            v-for="row in detailRows"
            :key="row.key"
            :title="t(`appDetail.field.${row.key}`)"
            :description="row.value"
          />
        </TuffGroupBlock>
      </div>
    </TxScroll>

    <!--
      Diagnostics are a verdict plus a wall of JSON — useful when chasing why an entry does not
      come back, noise the rest of the time. A drawer keeps the page to the things that describe
      the application itself.
    -->
    <TxDrawer
      v-model:visible="diagnosticOpen"
      :title="t('settings.settingFileIndex.appIndexManagerDiagnose')"
      size="560px"
    >
      <div class="AppDetail-DiagnosticPanel">
        <!--
          The probe runs on open, so a slow index shows what is being waited on rather than the
          "not checked" verdict it has not reached yet.
        -->
        <div v-if="diagnosing && !diagnostic" class="AppDetail-DiagnosticLoading">
          <TxSkeleton :width="120" :height="13" :radius="4" />
          <TxSkeleton width="70%" :height="11" :radius="4" />
        </div>

        <template v-else-if="diagnosticSummary">
          <div class="AppDetail-DiagnosticSummary">
            <SettingChip :tone="chipTone(diagnosticSummary.tone)">
              {{ diagnosticSummary.label }}
            </SettingChip>
            <span>{{ diagnosticSummary.detail }}</span>
          </div>

          <div v-if="diagnostic" class="AppDetail-DiagnosticActions">
            <TxButton variant="flat" size="sm" @click="emit('copy-diagnostic', entry)">
              {{ t('settings.settingFileIndex.appIndexManagerCopyJson') }}
            </TxButton>
          </div>
          <pre v-if="diagnostic" class="AppDetail-DiagnosticJson">{{
            JSON.stringify(diagnostic, null, 2)
          }}</pre>
        </template>
      </div>
    </TxDrawer>

    <!--
      Keyword management. Edits apply as they are made rather than on a confirm: `update-aliases`
      is what the page persists against, and buffering a draft list here would mean the chips the
      dialog shows and the aliases the index answers to could disagree until it is closed.
    -->
    <TxModal v-model="aliasDialogOpen" :title="t('appDetail.aliasTitle')" width="480px">
      <div class="AppDetail-AliasDialog">
        <p class="AppDetail-AliasDialogHint">{{ t('appDetail.aliasDesc') }}</p>

        <div v-if="aliases?.length" class="AppDetail-Aliases">
          <span v-for="alias in aliases" :key="alias" class="AppDetail-Alias">
            {{ alias }}
            <button
              type="button"
              class="AppDetail-AliasRemove"
              :disabled="busy"
              :aria-label="t('appDetail.aliasRemove', { alias })"
              @click="removeAlias(alias)"
            >
              <i class="i-carbon-close" aria-hidden="true" />
            </button>
          </span>
        </div>
        <p v-else class="AppDetail-AliasDialogEmpty">{{ t('appDetail.aliasNone') }}</p>

        <div class="AppDetail-AliasEditor">
          <FlatInput
            v-model="aliasDraft"
            class="AppDetail-AliasInput"
            :placeholder="t('appDetail.aliasPlaceholder')"
            @keydown.enter.prevent="addAlias"
          />
          <TxButton
            variant="flat"
            size="sm"
            :disabled="busy || !aliasDraft.trim()"
            @click="addAlias"
          >
            {{ t('appDetail.aliasAdd') }}
          </TxButton>
        </div>
      </div>

      <template #footer>
        <div class="AppDetail-AliasDialogActions">
          <TxButton variant="flat" @click.stop="aliasDialogOpen = false">
            {{ t('appDetail.aliasDone') }}
          </TxButton>
        </div>
      </template>
    </TxModal>
  </div>
</template>

<style lang="scss" scoped>
.AppDetail-Empty {
  width: 100%;
  height: 100%;
  justify-content: center;
  -webkit-app-region: drag;
}

.AppDetail {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.AppDetail-Head {
  display: flex;
  flex-shrink: 0;
  gap: 1rem;
  align-items: flex-start;
  padding: 1rem;
  border-bottom: 1px solid var(--tx-border-color);
  box-sizing: border-box;
  // The head sits in the window's hidden title-bar strip; its controls opt back out below.
  -webkit-app-region: drag;
}

.AppDetail-HeadIcon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;

  :deep(.tuff-icon) {
    font-size: 40px;
  }
}

.AppDetail-HeadIconPlaceholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border-radius: 8px;
  background: var(--tx-fill-color-lighter);
  color: var(--tx-text-color-placeholder);
}

.AppDetail-HeadCopy {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  flex-direction: column;
  gap: 4px;

  h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }
}

.AppDetail-Launch {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  -webkit-app-region: no-drag;
}

.AppDetail-DiagnosticPanel {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 0;
}

.AppDetail-Body {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
}

.AppDetail-BodyInner {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 1rem;
}

.AppDetail-InlineActions {
  display: flex;
  gap: 0.5rem;
}

.AppDetail-DiagnosticLoading {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
}

.AppDetail-DiagnosticSummary {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  padding: 12px;
  color: var(--tx-text-color-secondary);
  font-size: 0.8rem;
}

.AppDetail-DiagnosticActions {
  display: flex;
  justify-content: flex-end;
  padding: 0 12px 12px;
}

.AppDetail-DiagnosticJson {
  margin: 0 12px 12px;
  padding: 10px;
  border-radius: 8px;
  background: var(--tx-fill-color-light);
  color: var(--tx-text-color-secondary);
  font-size: 0.7rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
}

.AppDetail-UsageSection {
  padding: 12px 16px;
}

.AppDetail-UsageHeading {
  margin: 0;
  color: var(--tx-text-color-primary);
  font-size: 0.8rem;
  font-weight: 500;
}

.AppDetail-UsageHint {
  margin: 2px 0 10px;
  color: var(--tx-text-color-secondary);
  font-size: 0.7rem;
}

/**
 * 24 fixed-width columns rather than a flex distribution: an hour with no launches still owns
 * its slot, so the gaps in the day are part of the shape instead of collapsing the chart.
 */
.AppDetail-Hours {
  display: grid;
  grid-template-columns: repeat(24, 1fr);
  gap: 2px;
  align-items: end;
  width: 100%;
  height: 56px;
}

.AppDetail-HourBar {
  display: flex;
  align-items: flex-end;
  height: 100%;
  border-radius: 2px;
  background: var(--tx-fill-color-light);
}

.AppDetail-HourFill {
  width: 100%;
  // A zero-count hour keeps a hairline so the column reads as an empty hour rather than as a
  // rendering gap.
  min-height: 2px;
  border-radius: 2px;
  background: var(--tx-color-primary);
}

.AppDetail-Aliases {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.AppDetail-Alias {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  padding: 2px 4px 2px 8px;
  border-radius: 999px;
  background: var(--tx-fill-color);
  color: var(--tx-text-color-primary);
  font-size: 0.72rem;
}

.AppDetail-AliasRemove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--tx-text-color-secondary);
  font-size: 11px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--tx-fill-color-dark);
    color: var(--tx-text-color-primary);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
}

.AppDetail-AliasEditor {
  display: flex;
  gap: 8px;
  align-items: center;
}

.AppDetail-AliasInput {
  flex: 1 1 auto;
  min-width: 0;
}

/**
 * The empty state is a single row where the populated group is a stack of charts, so it sits
 * tight against the group's edges and reads as a clipped fragment rather than a deliberate
 * "nothing here yet". The extra block padding gives it the breathing room the charts get from
 * having neighbours.
 */
.AppDetail-UsageEmpty {
  padding-top: 10px;
  padding-bottom: 10px;
}

.AppDetail-AliasSummary {
  display: flex;
  gap: 10px;
  align-items: center;
}

.AppDetail-AliasCount,
.AppDetail-AliasEmpty {
  color: var(--tx-text-color-secondary);
  font-size: 0.75rem;
}

.AppDetail-AliasDialog {
  display: flex;
  flex-direction: column;
}

.AppDetail-AliasDialogHint {
  margin: 0 0 12px;
  color: var(--tx-text-color-secondary);
  font-size: 0.75rem;
  line-height: 1.5;
}

.AppDetail-AliasDialogEmpty {
  margin: 0 0 10px;
  color: var(--tx-text-color-placeholder);
  font-size: 0.75rem;
}

.AppDetail-AliasDialogActions {
  display: flex;
  justify-content: flex-end;
}

/**
 * 30 columns, same peak-relative scaling as the hour chart. Narrower gap than the hour bars:
 * at 30 columns a 2px gap eats a third of the width.
 */
.AppDetail-Trend {
  display: grid;
  grid-template-columns: repeat(30, 1fr);
  gap: 1px;
  align-items: end;
  width: 100%;
  height: 48px;
}

.AppDetail-TrendBar {
  display: flex;
  align-items: flex-end;
  height: 100%;
  border-radius: 1px;
  background: var(--tx-fill-color-light);
}

.AppDetail-TrendFill {
  width: 100%;
  min-height: 2px;
  border-radius: 1px;
  background: var(--tx-color-primary);
}

.AppDetail-Weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
  width: 100%;
}

.AppDetail-Weekday {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
}

.AppDetail-WeekdayTrack {
  display: flex;
  align-items: flex-end;
  width: 100%;
  height: 40px;
  border-radius: 3px;
  background: var(--tx-fill-color-light);
}

.AppDetail-WeekdayFill {
  width: 100%;
  min-height: 2px;
  border-radius: 3px;
  background: var(--tx-color-primary);
}

.AppDetail-WeekdayLabel {
  color: var(--tx-text-color-secondary);
  font-size: 0.65rem;
}

.AppDetail-HourAxis {
  display: flex;
  justify-content: space-between;
  width: 100%;
  margin-top: 4px;
  color: var(--tx-text-color-secondary);
  font-size: 0.65rem;
}

.AppDetail-Transitions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    justify-content: space-between;
    font-size: 0.75rem;
  }
}

.AppDetail-TransitionName {
  overflow: hidden;
  color: var(--tx-text-color-primary);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.AppDetail-TransitionCount {
  flex-shrink: 0;
  color: var(--tx-text-color-secondary);
  font-variant-numeric: tabular-nums;
}
</style>
