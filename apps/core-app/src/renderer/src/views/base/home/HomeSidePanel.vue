<script lang="ts" name="HomeSidePanel" setup>
import type {
  WorkspaceContextProjection,
  WorkspacePendingRun
} from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import type {
  ConversationMessage,
  ConversationTurnMeta
} from '~/modules/conversation/useHomeConversation'
import type {
  ActivityGatewayApproval,
  ActivityTurn
} from '~/modules/conversation/workspace-activity'
import type { HomeModelLimits } from '~/modules/conversation/workspace-panel'
import { TxTabItem, TxTabs } from '@talex-touch/tuffex/tabs'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { buildPreviewIndex } from '~/modules/conversation/preview-index'
import { useConversationReview } from '~/modules/conversation/useConversationReview'
import HomePreviewActivity from './preview/HomePreviewActivity.vue'
import HomePreviewArtifacts from './preview/HomePreviewArtifacts.vue'
import HomePreviewContext from './preview/HomePreviewContext.vue'
import HomePreviewEmpty from './preview/HomePreviewEmpty.vue'
import HomePreviewReview from './preview/HomePreviewReview.vue'
import HomePreviewSources from './preview/HomePreviewSources.vue'
import HomePreviewWidgets from './preview/HomePreviewWidgets.vue'

/**
 * The right panel behind the top bar's `panel-right` toggle: a preview of what
 * the conversation produced, so nothing has to be found by scrolling back, plus
 * the workspace's context and file changes as Main reports them.
 *
 * It runs the full height of the page beside the conversation, and its tab row
 * is the header that sits level with the top bar.
 *
 * Scope is the whole conversation, not the last turn — "I don't want to scroll
 * back" is the entire point, and a per-turn index would not answer it.
 *
 * Every row is derived from a part that exists on a message or a fact Main
 * reported. A tab with nothing to derive says so; it does not fill itself with
 * plausible-looking rows.
 */
const props = defineProps<{
  messages: ConversationMessage[]
  /** The thread on screen; file reviews are read for it while the panel is open. */
  conversationId: string | null
  context?: WorkspaceContextProjection
  turn?: ConversationTurnMeta
  limits?: HomeModelLimits
  activityTurns: ActivityTurn[]
  gateway: ActivityGatewayApproval[]
  pendingRun?: WorkspacePendingRun
  loading: boolean
}>()

const emit = defineEmits<{ (event: 'locate', messageIndex: number): void }>()

const { t } = useI18n()

/**
 * The panel is only mounted while open (`v-if` on the slot), so this recompute
 * costs nothing while it is closed — which is most of the time, including the
 * whole of a streaming turn if the reader never opened it.
 */
const index = computed(() => buildPreviewIndex(props.messages))

/** Stable identity: the count lives in the `name` slot, never in the tab value. */
const active = ref('outputs')

const counts = computed(() => ({
  outputs: index.value.artifacts.length + index.value.widgets.length,
  sources: index.value.sources.length,
  work: index.value.toolCalls.length
}))

/** Main is holding a tool request or an agent run for the user — marked on the work log tab. */
const waiting = computed(() => props.gateway.length > 0 || Boolean(props.pendingRun))

/** Host file-change records: read only while the panel is mounted, i.e. open. */
const review = useConversationReview(() => props.conversationId)

function locate(messageIndex: number): void {
  emit('locate', messageIndex)
}
</script>

<template>
  <aside class="HomeSidePanel" :aria-label="t('home.panel.title')">
    <TxTabs
      v-model="active"
      class="HomeSidePanel-Tabs"
      placement="top"
      borderless
      content-scrollable
      indicator-variant="pill"
      :content-padding="0"
      :animation="{ size: false, content: true }"
    >
      <!--
        `size: false` on purpose: the slot around this panel animates its own
        width open and closed, and a second size animation inside would fight it
        for the same frames. The panel is full-height regardless.
      -->
      <!-- Files and widgets share one tab: both are things the conversation made, and as two tabs
           each sat empty for most conversations. They stay in groups of their own inside it. -->
      <TxTabItem name="outputs">
        <template #name>
          {{ t('home.preview.artifacts') }}
          <span v-if="counts.outputs" class="HomeSidePanel-Count">{{ counts.outputs }}</span>
        </template>
        <HomePreviewEmpty
          v-if="!counts.outputs"
          icon="i-ri-file-text-line"
          :text="t('home.preview.outputsEmpty')"
        />
        <div v-else class="HomeSidePanel-Outputs">
          <HomePreviewArtifacts v-if="index.artifacts.length" :items="index.artifacts" />
          <HomePreviewWidgets v-if="index.widgets.length" :items="index.widgets" @locate="locate" />
        </div>
      </TxTabItem>

      <TxTabItem name="sources">
        <template #name>
          {{ t('home.preview.sources') }}
          <span v-if="counts.sources" class="HomeSidePanel-Count">{{ counts.sources }}</span>
        </template>
        <HomePreviewSources :items="index.sources" />
      </TxTabItem>

      <!-- The work log is the activity timeline: every call, grouped under the reply that made it,
           below whatever Main is waiting on. A flat list of the same calls beside it said the same
           thing twice. -->
      <TxTabItem name="work">
        <template #name>
          {{ t('home.preview.toolCalls') }}
          <span v-if="counts.work" class="HomeSidePanel-Count">{{ counts.work }}</span>
          <span
            v-if="waiting"
            class="HomeSidePanel-Waiting"
            role="img"
            :aria-label="t('home.workspace.activity.waiting')"
            :title="t('home.workspace.activity.waiting')"
          />
        </template>
        <HomePreviewActivity
          :turns="activityTurns"
          :gateway="gateway"
          :run="pendingRun"
          :loading="loading"
          @locate="locate"
        />
      </TxTabItem>

      <TxTabItem name="context">
        <template #name>{{ t('home.workspace.panel.context') }}</template>
        <HomePreviewContext :context="context" :turn="turn" :limits="limits" :loading="loading" />
      </TxTabItem>

      <TxTabItem name="review">
        <template #name>
          {{ t('home.workspace.panel.review') }}
          <span v-if="review.records.value.length" class="HomeSidePanel-Count">
            {{ review.records.value.length }}
          </span>
        </template>
        <HomePreviewReview
          :records="review.records.value"
          :loading="review.loading.value"
          :load-error="review.loadError.value"
          :detail="review.detail.value"
          :detail-loading="review.detailLoading.value"
          :rolling-back="review.rollingBack.value"
          :last-rollback="review.lastRollback.value"
          @open="review.open"
          @close="review.close"
          @rollback="review.rollback"
          @reload="review.reload"
        />
      </TxTabItem>
    </TxTabs>
  </aside>
</template>

<style lang="scss" scoped>
.HomeSidePanel {
  display: flex;
  flex: none;
  flex-direction: column;
  /**
   * Held at full width even while the slot that clips it animates to zero. A
   * fluid width here would make every row re-wrap on each frame of the
   * open/close transition.
   */
  width: var(--home-panel-width, 280px);
  min-width: var(--home-panel-width, 280px);
  min-height: 0;
  // The tab content owns the scroll; the panel itself must not scroll too.
  overflow: hidden;
  // Only a left rule: the panel is part of the main pane, not a floating sheet over it.
  border-left: 1px solid var(--shell-border);
  box-sizing: border-box;
}

.HomeSidePanel-Tabs {
  flex: 1;
  min-height: 0;
  min-width: 0;

  /**
   * The header: as tall as the top bar beside it, so the two read as one strip across the
   * window, and like the top bar it drags the window. No rule under it, as there is none under
   * the top bar. Doubled class: TxTabs' own `--top` rules here carry the same weight.
   */
  &.tx-tabs :deep(.tx-tabs__nav) {
    flex: none;
    height: 52px;
    border-bottom: 0;
    -webkit-app-region: drag;
    // Resting ink matches the top bar's chips.
    --tx-text-color-regular: var(--shell-text-secondary);
    // A flat fill under the active tab, like the model chip's: TxTabs' raised pill is a thumb
    // for a track, and with no track it read as a floating button.
    --tx-surface-raised: var(--shell-surface-2);
    --tx-elevation-1: 0 0 0 0 transparent;
    --tx-border-color-lighter: transparent;
  }

  // Five sections fit in Chinese; longer labels and counts scroll rather than wrap.
  :deep(.tx-tabs__nav-bar),
  :deep(.tx-tabs__nav-inner) {
    min-width: 0;
  }

  &.tx-tabs :deep(.tx-tabs__nav-inner) {
    gap: 2px;
    padding: 0 12px;
  }

  // The top bar's chip radius: the two headers sit level, so their pills should match.
  :deep(.tx-tab-item) {
    flex-shrink: 0;
    margin: 0;
    padding: 7px 10px;
    border-radius: var(--shell-radius-sm);
    white-space: nowrap;
    -webkit-app-region: no-drag;
    --fake-radius: var(--shell-radius-sm);
  }

  :deep(.tx-tab-item__name) {
    font-size: var(--shell-fs-sm);
  }
}

.HomeSidePanel-Count {
  margin-left: 5px;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
  font-variant-numeric: tabular-nums;
}

.HomeSidePanel-Waiting {
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-left: 5px;
  border-radius: 50%;
  background: var(--shell-primary);
  vertical-align: middle;
}

.HomeSidePanel-Outputs {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/**
 * The tab bodies are separate components, so their shared text vocabulary
 * lives here rather than being copied into each of them. Each body is a
 * single-root component, which is what puts this scope id on it.
 */
:deep(.HomePreview-Empty) {
  margin: 0;
  padding: 4px 8px;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-sm);
  line-height: 1.6;
}

:deep(.HomePreview-GroupLabel) {
  margin: 0 0 2px;
  padding: 0 8px;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-caption);
  font-weight: 500;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

:deep(.HomePreview-Name) {
  overflow: hidden;
  color: var(--shell-text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--shell-fs-sm);
}

/**
 * Truncates at the end, not with the `direction: rtl` trick that shows a path's
 * tail — that reorders the neutral `/` characters and renders `/Users/me` as
 * `Users/me/`. The full string is on the row's `title` instead.
 */
:deep(.HomePreview-Detail) {
  overflow: hidden;
  color: var(--shell-text-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--shell-fs-caption);
}

:deep(.HomePreview-IconBtn) {
  display: grid;
  flex: none;
  place-items: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-muted);
  font-size: 14px;
  cursor: pointer;

  &:hover {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }
}

// No rule under the header, so the first row starts close under the tabs.
:deep(.tx-tabs__content-scroll) {
  padding: 4px 12px 16px;
  overscroll-behavior: contain;
  box-sizing: border-box;
}
</style>
