<script lang="ts" name="HomePreviewWidgets" setup>
import type { PreviewWidget } from '~/modules/conversation/preview-index'
import { useI18n } from 'vue-i18n'

/**
 * Charts and forms the conversation produced.
 *
 * Clicking one scrolls the transcript to it rather than drawing a second copy
 * here: this column is too narrow for a usable chart, and a copy would carry
 * its own filter/view/draft state — two widgets showing different things while
 * claiming to be the same one.
 */
defineProps<{ items: PreviewWidget[] }>()

defineEmits<{ (event: 'locate', messageIndex: number): void }>()

const { t } = useI18n()

/**
 * Keyed by kind rather than a chart/else ternary: a third kind arrived once
 * already, and the ternary would have quietly labelled it a form.
 */
const KIND_ICON: Record<PreviewWidget['kind'], string> = {
  chart: 'i-ri-line-chart-line',
  form: 'i-ri-survey-line',
  sandbox: 'i-ri-sparkling-2-line'
}

const KIND_LABEL: Record<PreviewWidget['kind'], string> = {
  chart: 'home.preview.chart',
  form: 'home.preview.form',
  sandbox: 'home.preview.sandboxWidget'
}
</script>

<template>
  <div class="HomePreviewWidgets">
    <p v-if="!items.length" class="HomePreview-Empty">{{ t('home.preview.widgetsEmpty') }}</p>

    <button
      v-for="item in items"
      :key="item.id"
      class="HomePreviewWidgets-Row"
      type="button"
      :title="t('home.preview.locate')"
      @click="$emit('locate', item.messageIndex)"
    >
      <span class="HomePreviewWidgets-Icon" :class="KIND_ICON[item.kind]" />
      <span class="HomePreviewWidgets-Text">
        <span class="HomePreview-Name">{{ item.title || t('home.preview.untitled') }}</span>
        <span class="HomePreview-Detail">{{ t(KIND_LABEL[item.kind]) }}</span>
      </span>
      <span class="i-ri-corner-up-left-line HomePreviewWidgets-Jump" aria-hidden="true" />
    </button>
  </div>
</template>

<style lang="scss" scoped>
.HomePreviewWidgets {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.HomePreviewWidgets-Row {
  display: flex;
  gap: 8px;
  align-items: center;
  min-width: 0;
  padding: 6px 8px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: inherit;
  font-family: inherit;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--shell-surface-2);

    .HomePreviewWidgets-Jump {
      opacity: 1;
    }
  }
}

.HomePreviewWidgets-Icon {
  flex: none;
  color: var(--shell-text-muted);
  font-size: 15px;
}

.HomePreviewWidgets-Text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.HomePreviewWidgets-Jump {
  flex: none;
  color: var(--shell-text-muted);
  font-size: 13px;
  opacity: 0;
  transition: opacity 0.15s ease;
}
</style>
