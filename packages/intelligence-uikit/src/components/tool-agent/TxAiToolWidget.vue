<script setup lang="ts">
import { computed, ref, toRef } from 'vue'
import type { TxAiWidgetSandbox } from '../../types'

defineOptions({ name: 'TxAiToolWidget' })
const props = withDefaults(defineProps<{
  source: string
  title?: string
  fallback?: string
  sandbox: TxAiWidgetSandbox
  labels?: Record<string, string>
  blockedLabel?: (directive: string) => string
}>(), { labels: () => ({}) })
const widgetLabels = computed(() => ({ generated: 'AI generated', sandboxed: 'Sandboxed', loading: 'Loading widget…', failed: 'Unable to render widget', timedOut: 'Widget timed out', ...props.labels }))
const frameRef = ref<HTMLIFrameElement | null>(null)
const { status, failure, height, srcdoc } = props.sandbox(toRef(props, 'source'), frameRef)
const frameStyle = computed(() => ({ height: `${height.value}px` }))
const failureReason = computed(() => {
  const value = failure.value
  if (!value) return ''
  if (value.reason === 'timedOut') return widgetLabels.value.timedOut
  if (value.reason === 'blocked') return props.blockedLabel?.(value.directive) ?? `Blocked by sandbox policy: ${value.directive}`
  return value.message
})
</script>

<template>
  <div class="tx-ai-tool-widget">
    <!--
      Outside the frame on purpose. A widget can draw anything inside itself,
      including a convincing app dialog, so the one mark that says "a model
      wrote this" has to live where the widget cannot paint over it.
    -->
    <div class="tx-ai-tool-widget-Bar">
      <span class="i-ri-sparkling-2-line tx-ai-tool-widget-BarIcon" />
      <span class="tx-ai-tool-widget-BarText">{{ props.title || widgetLabels.generated }}</span>
      <span class="tx-ai-tool-widget-BarNote">{{ widgetLabels.sandboxed }}</span>
    </div>

    <p v-if="status === 'loading'" class="tx-ai-tool-widget-Status">
      {{ widgetLabels.loading }}
    </p>

    <div v-if="status === 'failed'" class="tx-ai-tool-widget-Failed" role="alert">
      <p class="tx-ai-tool-widget-FailedTitle">{{ widgetLabels.failed }}</p>
      <p v-if="failureReason" class="tx-ai-tool-widget-FailedReason">{{ failureReason }}</p>
      <!-- The tool still produced something; showing it beats showing nothing. -->
      <pre v-if="props.fallback" class="tx-ai-tool-widget-Fallback">{{ props.fallback }}</pre>
    </div>

    <iframe
      v-show="status === 'ready'"
      ref="frameRef"
      class="tx-ai-tool-widget-Frame"
      :style="frameStyle"
      :title="props.title || widgetLabels.generated"
      sandbox="allow-scripts"
      :srcdoc="srcdoc"
    />
  </div>
</template>

<style lang="scss" scoped>
.tx-ai-tool-widget {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.tx-ai-tool-widget-Bar {
  display: flex;
  gap: 6px;
  align-items: center;
  min-width: 0;
}

.tx-ai-tool-widget-BarIcon {
  flex: none;
  color: var(--shell-primary, var(--tx-color-primary));
  font-size: 14px;
}

.tx-ai-tool-widget-BarText {
  overflow: hidden;
  color: var(--shell-text-secondary, var(--tx-text-color-regular));
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--shell-fs-caption, 12px);
}

.tx-ai-tool-widget-BarNote {
  flex: none;
  margin-left: auto;
  padding: 1px 7px;
  border: 1px solid var(--shell-border, var(--tx-border-color-light));
  border-radius: var(--shell-radius-full, 999px);
  color: var(--shell-text-muted, var(--tx-text-color-secondary));
  font-size: var(--shell-fs-caption, 12px);
}

.tx-ai-tool-widget-Frame {
  width: 100%;
  border: none;
  border-radius: var(--shell-radius-md, 8px);
  background: transparent;
  // The frame reports its own height; past the host's ceiling it scrolls itself.
  overflow: auto;
}

.tx-ai-tool-widget-Status {
  margin: 0;
  color: var(--shell-text-muted, var(--tx-text-color-secondary));
  font-size: var(--shell-fs-sm, 13px);
}

.tx-ai-tool-widget-Failed {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--shell-danger-border, var(--tx-color-danger-light-5));
  border-radius: var(--shell-radius-md, 8px);
  background: var(--shell-danger-soft, var(--tx-color-danger-light-9));
}

.tx-ai-tool-widget-FailedTitle {
  margin: 0;
  color: var(--shell-danger, var(--tx-color-danger));
  font-size: var(--shell-fs-sm, 13px);
  font-weight: 500;
}

.tx-ai-tool-widget-FailedReason {
  margin: 0;
  color: var(--shell-text-secondary, var(--tx-text-color-regular));
  font-size: var(--shell-fs-caption, 12px);
  word-break: break-word;
}

.tx-ai-tool-widget-Fallback {
  margin: 6px 0 0;
  max-height: 160px;
  overflow: auto;
  color: var(--shell-text-muted, var(--tx-text-color-secondary));
  font-size: var(--shell-fs-caption, 12px);
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
