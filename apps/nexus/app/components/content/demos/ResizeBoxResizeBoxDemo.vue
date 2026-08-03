<script setup lang="ts">
import { computed, ref, useId } from 'vue'

type LifecycleState = 'idle' | 'resizing' | 'settled' | 'snapped'

const { locale } = useI18n()

const expanded = ref(false)
const disabled = ref(false)
const clip = ref(true)
const lifecycle = ref<LifecycleState>('idle')
const starts = ref(0)
const ends = ref(0)
const sizeLabelId = useId()

const targetWidth = computed(() => expanded.value ? 'min(420px, 100%)' : 'min(220px, 100%)')
const targetHeight = computed(() => expanded.value ? 244 : 132)

const labels = computed(() => {
  const zh = locale.value.startsWith('zh')
  return {
    size: zh ? '尺寸' : 'Size',
    compact: zh ? '紧凑' : 'Compact',
    expanded: zh ? '展开' : 'Expanded',
    disabled: zh ? '禁用动画' : 'Disable motion',
    clip: zh ? '裁剪溢出' : 'Clip overflow',
    lifecycle: zh ? '生命周期' : 'Lifecycle',
    starts: zh ? '开始' : 'Starts',
    ends: zh ? '结束' : 'Ends',
    status: {
      idle: zh ? '等待' : 'Idle',
      resizing: zh ? '调整中' : 'Resizing',
      settled: zh ? '已完成' : 'Settled',
      snapped: zh ? '即时跳变' : 'Snapped',
    } satisfies Record<LifecycleState, string>,
    panel: zh ? '部署概览' : 'Deployment overview',
    release: zh ? '候选版本' : 'Release candidate',
    checks: zh ? '检查项' : 'Checks',
    ready: zh ? '已就绪' : 'Ready',
    queued: zh ? '等待发布' : 'Queued',
    overflow: zh ? '紧凑尺寸下的溢出内容' : 'Overflow content beyond the compact target',
  }
})

function setExpanded(value: boolean) {
  if (expanded.value === value)
    return
  expanded.value = value
  if (disabled.value)
    lifecycle.value = 'snapped'
}

function onResizeStart() {
  starts.value += 1
  lifecycle.value = 'resizing'
}

function onResizeEnd() {
  ends.value += 1
  lifecycle.value = 'settled'
}
</script>

<template>
  <div class="resize-box-demo">
    <div class="resize-box-demo__controls">
      <div class="resize-box-demo__control-group">
        <span :id="sizeLabelId" class="resize-box-demo__label">{{ labels.size }}</span>
        <div
          class="resize-box-demo__segments"
          role="group"
          :aria-labelledby="sizeLabelId"
        >
          <TxButton
            class="resize-box-demo__segment-button"
            size="small"
            :variant="expanded ? 'ghost' : 'primary'"
            :aria-pressed="!expanded"
            @click="setExpanded(false)"
          >
            {{ labels.compact }}
          </TxButton>
          <TxButton
            class="resize-box-demo__segment-button"
            size="small"
            :variant="expanded ? 'primary' : 'ghost'"
            :aria-pressed="expanded"
            @click="setExpanded(true)"
          >
            {{ labels.expanded }}
          </TxButton>
        </div>
      </div>

      <label class="resize-box-demo__switch">
        <span>{{ labels.disabled }}</span>
        <TxSwitch v-model="disabled" :aria-label="labels.disabled" />
      </label>

      <label class="resize-box-demo__switch">
        <span>{{ labels.clip }}</span>
        <TxSwitch v-model="clip" :aria-label="labels.clip" />
      </label>
    </div>

    <div class="resize-box-demo__status" role="status" aria-live="polite" aria-atomic="true">
      <span class="resize-box-demo__status-dot" :data-state="lifecycle" aria-hidden="true" />
      <strong>{{ labels.lifecycle }}: {{ labels.status[lifecycle] }}</strong>
      <span>{{ labels.starts }} {{ starts }}</span>
      <span>{{ labels.ends }} {{ ends }}</span>
      <code>{{ targetWidth }} x {{ targetHeight }}px</code>
    </div>

    <div class="resize-box-demo__stage">
      <TxResizeBox
        as="section"
        class="resize-box-demo__preview"
        :width="targetWidth"
        :height="targetHeight"
        :duration="360"
        easing="cubic-bezier(0.22, 1, 0.36, 1)"
        :disabled="disabled"
        :clip="clip"
        @resize-start="onResizeStart"
        @resize-end="onResizeEnd"
      >
        <div class="resize-box-demo__content">
          <span class="resize-box-demo__eyebrow">RC.04</span>
          <strong class="resize-box-demo__title">{{ labels.panel }}</strong>
          <div class="resize-box-demo__metric">
            <span>{{ labels.release }}</span>
            <b>1.0.0-beta.4</b>
          </div>
          <div class="resize-box-demo__metric">
            <span>{{ labels.checks }}</span>
            <b class="resize-box-demo__ready">{{ labels.ready }}</b>
          </div>
          <div class="resize-box-demo__overflow-marker">
            {{ labels.overflow }} · {{ labels.queued }}
          </div>
        </div>
      </TxResizeBox>
    </div>
  </div>
</template>

<style scoped>
.resize-box-demo {
  display: grid;
  width: 100%;
  min-width: 0;
  gap: 14px;
}

.resize-box-demo__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 12px 20px;
  padding-bottom: 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--tx-border-color, #d1d5db) 72%, transparent);
}

.resize-box-demo__control-group {
  display: grid;
  gap: 6px;
}

.resize-box-demo__label,
.resize-box-demo__switch > span {
  color: var(--tx-text-color-secondary, #6b7280);
  font-size: 12px;
}

.resize-box-demo__segments {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.resize-box-demo__segment-button {
  min-height: 36px;
}

.resize-box-demo__switch {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  gap: 8px;
}

.resize-box-demo__status {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
  color: var(--tx-text-color-secondary, #6b7280);
  font-size: 12px;
}

.resize-box-demo__status strong {
  color: var(--tx-text-color-primary, #111827);
}

.resize-box-demo__status code {
  max-width: 100%;
  overflow-wrap: anywhere;
}

.resize-box-demo__status-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 8px;
  border-radius: 50%;
  background: var(--tx-text-color-secondary, #6b7280);
}

.resize-box-demo__status-dot[data-state="resizing"] {
  background: var(--tx-color-primary, #2563eb);
}

.resize-box-demo__status-dot[data-state="settled"] {
  background: var(--tx-color-success, #16a34a);
}

.resize-box-demo__status-dot[data-state="snapped"] {
  background: var(--tx-color-warning, #d97706);
}

.resize-box-demo__stage {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: 292px;
  overflow: hidden;
  padding: 18px;
  border: 1px solid color-mix(in srgb, var(--tx-border-color, #d1d5db) 76%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--tx-bg-color-page, #f8fafc) 94%, var(--tx-color-primary, #2563eb) 6%);
}

.resize-box-demo__preview {
  border: 1px solid color-mix(in srgb, var(--tx-color-primary, #2563eb) 48%, var(--tx-border-color, #d1d5db));
  border-radius: 8px;
  background: var(--tx-bg-color-overlay, #ffffff);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--tx-text-color-primary, #111827) 10%, transparent);
}

.resize-box-demo__content {
  box-sizing: border-box;
  display: grid;
  width: 360px;
  max-width: calc(100vw - 72px);
  min-height: 214px;
  gap: 10px;
  padding: 18px;
}

.resize-box-demo__eyebrow {
  color: var(--tx-color-primary, #2563eb);
  font-size: 11px;
  font-weight: 700;
}

.resize-box-demo__title {
  color: var(--tx-text-color-primary, #111827);
  font-size: 16px;
}

.resize-box-demo__metric {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  color: var(--tx-text-color-secondary, #6b7280);
  font-size: 12px;
}

.resize-box-demo__metric b {
  color: var(--tx-text-color-primary, #111827);
  white-space: nowrap;
}

.resize-box-demo__metric .resize-box-demo__ready {
  color: var(--tx-color-success, #16a34a);
}

.resize-box-demo__overflow-marker {
  width: max-content;
  max-width: 340px;
  margin-top: 8px;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--tx-color-warning, #d97706) 34%, transparent);
  color: var(--tx-text-color-secondary, #6b7280);
  background: color-mix(in srgb, var(--tx-color-warning, #d97706) 10%, transparent);
  font-size: 12px;
  white-space: nowrap;
}

@media (max-width: 520px) {
  .resize-box-demo__controls {
    align-items: stretch;
  }

  .resize-box-demo__control-group,
  .resize-box-demo__switch {
    width: 100%;
  }

  .resize-box-demo__switch {
    justify-content: space-between;
  }

  .resize-box-demo__segment-button {
    min-height: 44px;
  }

  .resize-box-demo__stage {
    min-height: 276px;
    padding: 12px;
  }

  .resize-box-demo__content {
    max-width: calc(100vw - 56px);
    padding: 14px;
  }
}
</style>
