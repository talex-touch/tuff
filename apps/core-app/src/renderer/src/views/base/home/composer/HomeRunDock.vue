<script lang="ts" name="HomeRunDock" setup>
import type { MikoState } from '@talex-touch/tuffex/miko'
import type { RunStep } from './run-status'
import { TxAiContextMeter, TxAiRunStatus } from '@talex-touch/intelligence-uikit'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * The combined live telemetry dock sitting immediately above the composer:
 * - `TxAiRunStatus` (`variant="line"`): breathing Miko mark, rolling elapsed clock, and current step
 * - `TxAiContextMeter` (`variant="bar"`): 2px context-window bar with rolling TxTextMorph percent
 *
 * Both primitives are owned by `@talex-touch/intelligence-uikit`; this adapter supplies CoreApp's
 * localized labels, step-to-Miko state mapping, and dock positioning above the composer box.
 */
const props = defineProps<{
  streaming: boolean
  startedAt?: number
  step: RunStep
  verb?: string
  contextShare: number | null
  contextWindowText: string
}>()

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
  <div class="HomePage-RunDock">
    <TxAiRunStatus
      v-if="streaming"
      variant="line"
      :started-at="startedAt"
      :miko-state="mikoState"
      :line-label="stepLabel"
      :tone="step.kind === 'tool' ? 'tool' : 'default'"
    />
    <TxAiContextMeter
      v-if="contextShare !== null || streaming"
      class="HomePage-ContextMeter"
      variant="bar"
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
 * The status line and the context meter, as one block above the composer. Its bottom edge is the
 * meter's track, and the margin cancels the group's gap except for 4px, so the track rides above the
 * box rather than over its border: the border, which turns blue on focus, stays whole, and the 3px
 * focus ring around it stays clear of the track. It paints over the beam wrapper (`z-index: 2`) so
 * the beam's bloom never dims it.
 */
.HomePage-RunDock {
  position: relative;
  z-index: 3;
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: var(--home-chat-lane-width);
  min-width: 0;
  margin-bottom: calc(-1 * var(--home-group-gap) + 4px);
  pointer-events: none;
}

.HomePage-ContextMeter {
  padding-inline: 24px;
  box-sizing: border-box;
}
</style>
