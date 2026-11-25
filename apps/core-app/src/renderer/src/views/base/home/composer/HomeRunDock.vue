<script lang="ts" name="HomeRunDock" setup>
import type { MikoState } from '@talex-touch/tuffex/miko'
import type { RunStep } from './run-status'
import { TxAiContextMeter, TxAiRunStatus } from '@talex-touch/intelligence-uikit'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * The compact single-line live telemetry rail sitting cleanly underneath the composer:
 * - Left: `TxAiRunStatus` (`variant="line"`): elapsed clock and current step (hides its inline
 *   16px Miko mark when the roaming `HomePet` is already representing live state)
 * - Right: `TxAiContextMeter` (`variant="pill"`): circular ring meter with `%` and window ceiling
 */
const props = withDefaults(
  defineProps<{
    streaming: boolean
    startedAt?: number
    step: RunStep
    verb?: string
    contextShare: number | null
    contextWindowText: string
    hideMiko?: boolean
  }>(),
  { hideMiko: false }
)

const { t } = useI18n()

const stepLabel = computed(() => {
  const step = props.step
  switch (step.kind) {
    case 'tool':
      return step.summary?.trim() || t('home.runStatus.tool', { name: step.name })
    case 'thinking':
      return step.title || props.verb || t('home.runStatus.thinking')
    case 'writing':
      return t('home.runStatus.writing')
    default:
      return props.verb || t('home.runStatus.waiting')
  }
})

const mikoState = computed<MikoState>(() => {
  switch (props.step.kind) {
    case 'tool':
      return 'running'
    case 'thinking':
      return 'thinking'
    case 'writing':
      return 'working'
    default:
      return 'thinking'
  }
})

const meterPercent = computed(() => props.contextShare ?? 0)
</script>

<template>
  <div class="HomePage-RunDock" :class="{ 'is-streaming': streaming }">
    <TxAiRunStatus
      v-if="streaming"
      class="HomePage-RunStatus"
      variant="line"
      :started-at="startedAt"
      :miko-state="mikoState"
      :hide-miko="hideMiko"
      :line-label="stepLabel"
      :tone="step.kind === 'tool' ? 'tool' : 'default'"
    />
    <TxAiContextMeter
      v-if="contextShare !== null || (streaming && Boolean(contextWindowText))"
      class="HomePage-ContextMeter"
      variant="pill"
      :percent="meterPercent"
      :window-text="contextWindowText"
      :label="t('home.contextMeter.label')"
      :value-text="
        t('home.contextMeter.value', { percent: meterPercent, window: contextWindowText })
      "
    />
  </div>
</template>

<style lang="scss" scoped>
/**
 * Single-line telemetry rail tucked underneath the composer so it never collides with the
 * stacked steer/queue back-card or the roaming Miko pet perched above the composer deck.
 */
.HomePage-RunDock {
  position: relative;
  z-index: 2;
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: flex-end;
  width: var(--home-chat-lane-width);
  min-width: 0;
  min-height: 22px;
  padding: 0 12px;
  box-sizing: border-box;
  pointer-events: none;
}

.HomePage-RunStatus {
  flex: 1 1 auto;
  min-width: 0;
  padding: 0;
}

.HomePage-ContextMeter {
  flex: none;
  height: 22px;
  margin-left: auto;
  padding: 0 8px;
  background: color-mix(in srgb, var(--shell-surface) 78%, transparent);
  backdrop-filter: blur(12px);
  pointer-events: auto;
}
</style>
