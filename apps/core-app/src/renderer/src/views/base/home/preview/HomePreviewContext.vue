<script lang="ts" name="HomePreviewContext" setup>
import type { WorkspaceContextProjection } from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import type { HomeModelLimits } from '~/modules/conversation/workspace-panel'
import type { ConversationTurnMeta } from '~/modules/conversation/useHomeConversation'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import { contextOccupancyTokens } from '@talex-touch/pi-desktop-reuse/context-usage'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * What this conversation's context is made of, each figure next to where it came from (A10).
 *
 * Four sources are kept apart because they answer different questions: the host package Main
 * assembled (its budget and its own estimate), the usage the provider reported for the last
 * request, the model's configured limits, and the compactions and checkpoints Main recorded. None
 * is derived from another — a catalog window is a ceiling, not occupancy, and nothing here turns a
 * character count or a billing total into "context left". A source with nothing to report says
 * unknown.
 */

const props = defineProps<{
  context?: WorkspaceContextProjection
  /** The last settled assistant turn's own metadata, as the provider reported it. */
  turn?: ConversationTurnMeta
  limits?: HomeModelLimits
  /** The thread is still being read from Main. */
  loading: boolean
}>()

const { t, te, locale } = useI18n()

const numberFormat = computed(() => new Intl.NumberFormat(locale.value))
const timeFormat = computed(
  () => new Intl.DateTimeFormat(locale.value, { dateStyle: 'short', timeStyle: 'short' })
)

const tokens = (value: number): string =>
  t('home.workspace.context.tokens', { count: numberFormat.value.format(value) })

/** Reported usage only: absent fields stay absent rather than becoming zeros. */
const usage = computed(() => {
  const turn = props.turn
  if (!turn) return null
  const input = turn.promptTokens
  const output = turn.completionTokens
  const total = turn.totalTokens
  if (input === undefined && output === undefined && total === undefined) return null
  return {
    input,
    output,
    total,
    occupancy: contextOccupancyTokens({
      inputTokens: input ?? 0,
      outputTokens: output ?? 0,
      totalTokens: total ?? 0
    }),
    provider: turn.provider,
    model: turn.model
  }
})

const compactions = computed(() => [...(props.context?.compactions ?? [])].reverse())
const checkpoints = computed(() => props.context?.checkpoints ?? [])

function sourceLabel(source: string): string {
  const key = `home.workspace.context.source.${source}`
  return te(key) ? t(key) : source
}
</script>

<template>
  <div class="HomePreviewContext" :aria-busy="loading || undefined">
    <template v-if="loading">
      <div
        v-for="section in 3"
        :key="section"
        class="HomePreviewContext-Section"
        aria-hidden="true"
      >
        <div class="HomePreviewContext-SkeletonLine is-label">
          <TxSkeleton :height="8" :radius="4" />
        </div>
        <div
          v-for="row in 2"
          :key="row"
          class="HomePreviewContext-SkeletonLine"
          :class="{ 'is-short': row === 2 }"
        >
          <TxSkeleton :height="10" :radius="5" />
        </div>
      </div>
    </template>

    <template v-else>
      <section class="HomePreviewContext-Section">
        <h3 class="HomePreview-GroupLabel">{{ t('home.workspace.context.package') }}</h3>
        <dl v-if="context?.package" class="HomePreviewContext-Rows">
          <div class="HomePreviewContext-Row">
            <dt>{{ t('home.workspace.context.budget') }}</dt>
            <dd>{{ tokens(context.package.tokenBudget) }}</dd>
          </div>
          <div class="HomePreviewContext-Row">
            <dt>{{ t('home.workspace.context.estimate') }}</dt>
            <dd>{{ tokens(context.package.tokenEstimate) }}</dd>
          </div>
          <div v-if="context.package.sourceTypes.length" class="HomePreviewContext-Row">
            <dt>{{ t('home.workspace.context.sources') }}</dt>
            <dd>{{ context.package.sourceTypes.map(sourceLabel).join(' · ') }}</dd>
          </div>
          <div v-if="context.package.preparedAt !== undefined" class="HomePreviewContext-Row">
            <dt>{{ t('home.workspace.context.preparedAt') }}</dt>
            <dd>{{ timeFormat.format(context.package.preparedAt) }}</dd>
          </div>
        </dl>
        <p v-else class="HomePreview-Empty">{{ t('home.workspace.context.packageUnknown') }}</p>
        <p class="HomePreviewContext-Provenance">
          {{
            t(
              context?.package?.sourceTypes.length === 1 &&
                context.package.sourceTypes[0] === 'current_input'
                ? 'home.workspace.context.currentInputPackageSource'
                : 'home.workspace.context.packageSource'
            )
          }}
        </p>
      </section>

      <section class="HomePreviewContext-Section">
        <h3 class="HomePreview-GroupLabel">{{ t('home.workspace.context.usage') }}</h3>
        <dl v-if="usage" class="HomePreviewContext-Rows">
          <div v-if="usage.input !== undefined" class="HomePreviewContext-Row">
            <dt>{{ t('home.workspace.context.input') }}</dt>
            <dd>{{ tokens(usage.input) }}</dd>
          </div>
          <div v-if="usage.output !== undefined" class="HomePreviewContext-Row">
            <dt>{{ t('home.workspace.context.output') }}</dt>
            <dd>{{ tokens(usage.output) }}</dd>
          </div>
          <div class="HomePreviewContext-Row">
            <dt>{{ t('home.workspace.context.occupancy') }}</dt>
            <dd>{{ tokens(usage.occupancy) }}</dd>
          </div>
          <div v-if="usage.model" class="HomePreviewContext-Row">
            <dt>{{ t('home.workspace.context.reportedBy') }}</dt>
            <dd :title="usage.provider">{{ usage.model }}</dd>
          </div>
        </dl>
        <p v-else class="HomePreview-Empty">{{ t('home.workspace.context.usageUnknown') }}</p>
        <p class="HomePreviewContext-Provenance">{{ t('home.workspace.context.usageSource') }}</p>
      </section>

      <section class="HomePreviewContext-Section">
        <h3 class="HomePreview-GroupLabel">{{ t('home.workspace.context.limits') }}</h3>
        <dl class="HomePreviewContext-Rows">
          <div class="HomePreviewContext-Row">
            <dt>{{ t('home.workspace.context.window') }}</dt>
            <dd v-if="limits?.contextWindow">
              {{ tokens(limits.contextWindow.value) }}
              <span class="HomePreviewContext-Source">{{
                sourceLabel(limits.contextWindow.source)
              }}</span>
            </dd>
            <dd v-else class="is-unknown">{{ t('home.workspace.context.unknown') }}</dd>
          </div>
          <div class="HomePreviewContext-Row">
            <dt>{{ t('home.workspace.context.maxOutput') }}</dt>
            <dd v-if="limits?.maxOutputTokens">
              {{ tokens(limits.maxOutputTokens.value) }}
              <span class="HomePreviewContext-Source">{{
                sourceLabel(limits.maxOutputTokens.source)
              }}</span>
              <span v-if="!limits.maxOutputTokens.enforced" class="HomePreviewContext-Source">
                · {{ t('home.workspace.context.outputNotEnforced') }}
              </span>
            </dd>
            <dd v-else class="is-unknown">{{ t('home.workspace.context.unknown') }}</dd>
          </div>
        </dl>
        <p class="HomePreviewContext-Provenance">{{ t('home.workspace.context.limitsSource') }}</p>
      </section>

      <section class="HomePreviewContext-Section">
        <h3 class="HomePreview-GroupLabel">{{ t('home.workspace.context.compactions') }}</h3>
        <ol v-if="compactions.length" class="HomePreviewContext-Events">
          <li
            v-for="event in compactions"
            :key="`${event.turnId}:${event.phase}:${event.at}`"
            class="HomePreviewContext-Event"
          >
            <span
              :class="
                event.phase === 'start'
                  ? 'i-ri-archive-2-line'
                  : event.ok === false
                    ? 'i-ri-error-warning-line is-danger'
                    : 'i-ri-check-line'
              "
              class="HomePreviewContext-EventIcon"
              aria-hidden="true"
            />
            <span class="HomePreviewContext-EventText">
              <span>
                {{
                  event.phase === 'start'
                    ? t('home.workspace.context.compactionStart')
                    : event.ok === false
                      ? t('home.workspace.context.compactionFailed')
                      : t('home.workspace.context.compactionEnd')
                }}
              </span>
              <span class="HomePreview-Detail">
                {{ timeFormat.format(event.at)
                }}<template v-if="event.reason"> · {{ event.reason }}</template>
              </span>
            </span>
          </li>
        </ol>
        <p v-else class="HomePreview-Empty">{{ t('home.workspace.context.compactionsNone') }}</p>
      </section>

      <section class="HomePreviewContext-Section">
        <h3 class="HomePreview-GroupLabel">{{ t('home.workspace.context.checkpoints') }}</h3>
        <ol v-if="checkpoints.length" class="HomePreviewContext-Events">
          <li
            v-for="checkpoint in checkpoints"
            :key="checkpoint.id"
            class="HomePreviewContext-Event"
          >
            <span class="i-ri-bookmark-line HomePreviewContext-EventIcon" aria-hidden="true" />
            <span class="HomePreviewContext-EventText">
              <span
                >{{ checkpoint.type
                }}<template v-if="checkpoint.status"> · {{ checkpoint.status }}</template></span
              >
              <span class="HomePreview-Detail" :title="checkpoint.id">
                <template v-if="checkpoint.createdAt !== undefined"
                  >{{ timeFormat.format(checkpoint.createdAt) }} · </template
                >{{ checkpoint.id }}
              </span>
            </span>
          </li>
        </ol>
        <p v-else class="HomePreview-Empty">{{ t('home.workspace.context.checkpointsNone') }}</p>
      </section>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.HomePreviewContext {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.HomePreviewContext-Section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.HomePreviewContext-Rows {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0 8px;
}

.HomePreviewContext-Row {
  display: flex;
  gap: 12px;
  align-items: baseline;
  justify-content: space-between;
  font-size: var(--shell-fs-sm);

  dt {
    flex: none;
    color: var(--shell-text-muted);
  }

  dd {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    color: var(--shell-text-primary);
    font-variant-numeric: tabular-nums;
    text-align: right;
    text-overflow: ellipsis;
    white-space: nowrap;

    &.is-unknown {
      color: var(--shell-text-muted);
    }
  }
}

.HomePreviewContext-Source {
  margin-left: 4px;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
}

.HomePreviewContext-Provenance {
  margin: 2px 0 0;
  padding: 0 8px;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
  line-height: 1.5;
}

.HomePreviewContext-Events {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.HomePreviewContext-Event {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 4px 8px;
  font-size: var(--shell-fs-sm);
}

.HomePreviewContext-EventIcon {
  flex: none;
  margin-top: 2px;
  color: var(--shell-text-secondary);

  &.is-danger {
    color: var(--shell-danger);
  }
}

.HomePreviewContext-EventText {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  color: var(--shell-text-primary);
}

/* Each bar is centred in the line box of the text it stands for, so nothing moves when it lands. */
.HomePreviewContext-SkeletonLine {
  --tx-skeleton-base-color: var(--shell-surface-2);

  display: flex;
  flex-direction: column;
  justify-content: center;
  width: calc(100% - 16px);
  height: 1lh;
  margin: 0 8px;
  font-size: var(--shell-fs-sm);

  &.is-label {
    width: 38%;
    font-size: var(--shell-fs-caption);
  }

  &.is-short {
    width: 62%;
  }
}
</style>
