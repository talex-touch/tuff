<script lang="ts" name="HomeSidePanel" setup>
import type { ConversationMessage } from '~/modules/conversation/useHomeConversation'
import { TxTabItem, TxTabs } from '@talex-touch/tuffex/tabs'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { buildPreviewIndex } from '~/modules/conversation/preview-index'
import HomePreviewArtifacts from './preview/HomePreviewArtifacts.vue'
import HomePreviewSources from './preview/HomePreviewSources.vue'
import HomePreviewToolCalls from './preview/HomePreviewToolCalls.vue'
import HomePreviewWidgets from './preview/HomePreviewWidgets.vue'

/**
 * The right panel behind the top bar's `panel-right` toggle: a preview of what
 * the conversation produced, so nothing has to be found by scrolling back.
 *
 * Scope is the whole conversation, not the last turn — "I don't want to scroll
 * back" is the entire point, and a per-turn index would not answer it.
 *
 * Every row is derived from a part that exists on a message. A tab with nothing
 * to derive says so; it does not fill itself with plausible-looking rows.
 */
const props = defineProps<{ messages: ConversationMessage[] }>()

const emit = defineEmits<{ (event: 'locate', messageIndex: number): void }>()

const { t } = useI18n()

/**
 * The panel is only mounted while open (`v-if` on the slot), so this recompute
 * costs nothing while it is closed — which is most of the time, including the
 * whole of a streaming turn if the reader never opened it.
 */
const index = computed(() => buildPreviewIndex(props.messages))

/** Stable identity: the count lives in the `name` slot, never in the tab value. */
const active = ref('artifacts')

const counts = computed(() => ({
  artifacts: index.value.artifacts.length,
  widgets: index.value.widgets.length,
  toolCalls: index.value.toolCalls.length,
  sources: index.value.sources.length
}))

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
      content-scrollable
      indicator-variant="line"
      :content-padding="0"
      :animation="{ size: false, content: true }"
    >
      <!--
        `size: false` on purpose: the slot around this panel animates its own
        width open and closed, and a second size animation inside would fight it
        for the same frames. The panel is full-height regardless.
      -->
      <TxTabItem name="artifacts">
        <template #name>
          {{ t('home.preview.artifacts') }}
          <span v-if="counts.artifacts" class="HomeSidePanel-Count">{{ counts.artifacts }}</span>
        </template>
        <HomePreviewArtifacts :items="index.artifacts" />
      </TxTabItem>

      <TxTabItem name="widgets">
        <template #name>
          {{ t('home.preview.widgets') }}
          <span v-if="counts.widgets" class="HomeSidePanel-Count">{{ counts.widgets }}</span>
        </template>
        <HomePreviewWidgets :items="index.widgets" @locate="locate" />
      </TxTabItem>

      <TxTabItem name="toolCalls">
        <template #name>
          {{ t('home.preview.toolCalls') }}
          <span v-if="counts.toolCalls" class="HomeSidePanel-Count">{{ counts.toolCalls }}</span>
        </template>
        <HomePreviewToolCalls :items="index.toolCalls" @locate="locate" />
      </TxTabItem>

      <TxTabItem name="sources">
        <template #name>
          {{ t('home.preview.sources') }}
          <span v-if="counts.sources" class="HomeSidePanel-Count">{{ counts.sources }}</span>
        </template>
        <HomePreviewSources :items="index.sources" />
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
}

.HomeSidePanel-Count {
  margin-left: 5px;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
  font-variant-numeric: tabular-nums;
}

/**
 * The four tab bodies are separate components, so their shared text vocabulary
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

:deep(.tx-tabs__content-scroll) {
  padding: 12px 12px 16px;
  overscroll-behavior: contain;
  box-sizing: border-box;
}
</style>
