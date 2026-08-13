<script lang="ts" name="ToolWidgetCard" setup>
import { computed, ref, toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useWidgetSandbox } from '~/modules/widget-sandbox/use-widget-sandbox'

/**
 * Renders a widget the model wrote itself.
 *
 * Unlike `ToolChartCard` and `ToolFormCard`, which map a validated spec onto
 * fixed components, this runs model-authored code. It is safe because of where
 * it runs, not because of what was checked: a sandboxed frame with an opaque
 * origin, its own `connect-src 'none'` policy, and no path back into the app.
 */
const props = defineProps<{
  source: string
  title?: string
  /** The tool's plain output, shown when the widget cannot come up. */
  fallback?: string
}>()

const { t } = useI18n()

const frameRef = ref<HTMLIFrameElement | null>(null)
const { status, error, height, srcdoc } = useWidgetSandbox(toRef(props, 'source'), frameRef)

const frameStyle = computed(() => ({ height: `${height.value}px` }))
</script>

<template>
  <div class="ToolWidgetCard">
    <!--
      Outside the frame on purpose. A widget can draw anything inside itself,
      including a convincing app dialog, so the one mark that says "a model
      wrote this" has to live where the widget cannot paint over it.
    -->
    <div class="ToolWidgetCard-Bar">
      <span class="i-ri-sparkling-2-line ToolWidgetCard-BarIcon" />
      <span class="ToolWidgetCard-BarText">{{ props.title || t('home.widget.generated') }}</span>
      <span class="ToolWidgetCard-BarNote">{{ t('home.widget.sandboxed') }}</span>
    </div>

    <p v-if="status === 'loading'" class="ToolWidgetCard-Status">
      {{ t('home.widget.loading') }}
    </p>

    <div v-if="status === 'failed'" class="ToolWidgetCard-Failed" role="alert">
      <p class="ToolWidgetCard-FailedTitle">{{ t('home.widget.failed') }}</p>
      <p class="ToolWidgetCard-FailedReason">{{ error }}</p>
      <!-- The tool still produced something; showing it beats showing nothing. -->
      <pre v-if="props.fallback" class="ToolWidgetCard-Fallback">{{ props.fallback }}</pre>
    </div>

    <iframe
      v-show="status === 'ready'"
      ref="frameRef"
      class="ToolWidgetCard-Frame"
      :style="frameStyle"
      :title="props.title || t('home.widget.generated')"
      sandbox="allow-scripts"
      :srcdoc="srcdoc"
    />
  </div>
</template>

<style lang="scss" scoped>
.ToolWidgetCard {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.ToolWidgetCard-Bar {
  display: flex;
  gap: 6px;
  align-items: center;
  min-width: 0;
}

.ToolWidgetCard-BarIcon {
  flex: none;
  color: var(--shell-primary);
  font-size: 14px;
}

.ToolWidgetCard-BarText {
  overflow: hidden;
  color: var(--shell-text-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--shell-fs-caption);
}

.ToolWidgetCard-BarNote {
  flex: none;
  margin-left: auto;
  padding: 1px 7px;
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-full);
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
}

.ToolWidgetCard-Frame {
  width: 100%;
  border: none;
  border-radius: var(--shell-radius-md);
  background: transparent;
  // The frame reports its own height; past the host's ceiling it scrolls itself.
  overflow: auto;
}

.ToolWidgetCard-Status {
  margin: 0;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-sm);
}

.ToolWidgetCard-Failed {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--shell-danger-border);
  border-radius: var(--shell-radius-md);
  background: var(--shell-danger-soft);
}

.ToolWidgetCard-FailedTitle {
  margin: 0;
  color: var(--shell-danger);
  font-size: var(--shell-fs-sm);
  font-weight: 500;
}

.ToolWidgetCard-FailedReason {
  margin: 0;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-caption);
  word-break: break-word;
}

.ToolWidgetCard-Fallback {
  margin: 6px 0 0;
  max-height: 160px;
  overflow: auto;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
