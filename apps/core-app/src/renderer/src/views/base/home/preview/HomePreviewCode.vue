<script lang="ts" name="HomePreviewCode" setup>
import type { CodePreviewTab } from '~/modules/conversation/useCodePreviewTabs'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import HomePreviewEmpty from './HomePreviewEmpty.vue'

/**
 * Rendered markup the conversation's code blocks asked to preview, one tab each.
 *
 * The frame is sandboxed with no `allow-scripts`, the same as the inline view it
 * replaces: it shows the markup and never runs it.
 */
const props = defineProps<{
  tabs: CodePreviewTab[]
  activeId: string | null
}>()

const emit = defineEmits<{
  (event: 'select', id: string): void
  (event: 'close', id: string): void
}>()

const { t } = useI18n()

const active = computed(() => props.tabs.find((tab) => tab.id === props.activeId) ?? null)
</script>

<template>
  <HomePreviewEmpty
    v-if="!tabs.length"
    icon="i-ri-code-s-slash-line"
    :text="t('home.preview.codeEmpty')"
  />
  <div v-else class="HomePreviewCode">
    <div class="HomePreviewCode-Strip">
      <div
        v-for="tab in tabs"
        :key="tab.id"
        class="HomePreviewCode-Chip"
        :class="{ 'is-active': tab.id === activeId }"
      >
        <button
          type="button"
          class="HomePreviewCode-Select"
          :aria-pressed="tab.id === activeId"
          :title="tab.title"
          @click="emit('select', tab.id)"
        >
          {{ tab.title }}
        </button>
        <button
          type="button"
          class="HomePreview-IconBtn"
          :aria-label="t('home.preview.closeCode', { title: tab.title })"
          :title="t('home.preview.closeCode', { title: tab.title })"
          @click="emit('close', tab.id)"
        >
          <span class="i-ri-close-line" />
        </button>
      </div>
    </div>
    <iframe
      v-if="active"
      class="HomePreviewCode-Frame"
      sandbox=""
      :title="t('home.code.frameLabel', { lang: active.lang })"
      :srcdoc="active.srcdoc"
    />
  </div>
</template>

<style lang="scss" scoped>
.HomePreviewCode {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  min-height: 0;
}

.HomePreviewCode-Strip {
  display: flex;
  flex: none;
  gap: 4px;
  overflow-x: auto;
}

.HomePreviewCode-Chip {
  display: flex;
  flex: none;
  align-items: center;
  border-radius: var(--shell-radius-sm);

  &.is-active {
    background: var(--shell-surface-2);
  }
}

.HomePreviewCode-Select {
  max-width: 160px;
  padding: 5px 8px;
  overflow: hidden;
  border: none;
  background: transparent;
  color: var(--shell-text-secondary);
  font: inherit;
  font-size: var(--shell-fs-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;

  &[aria-pressed='true'] {
    color: var(--shell-text-primary);
  }
}

.HomePreviewCode-Frame {
  flex: 1;
  width: 100%;
  min-height: 0;
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-sm);
  background: var(--tx-color-white, #fff);
}
</style>
