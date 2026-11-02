<script lang="ts" name="HomeRunStatus" setup>
import type { RunStep } from './run-status'
import { TxTextMorph } from '@talex-touch/tuffex/text-morph'
import { TxTuffLogoStroke } from '@talex-touch/tuffex/tuff-logo-stroke'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatElapsed } from './run-status'

/**
 * The line between the transcript and the composer while a reply runs: the Tuff mark breathing,
 * how long the turn has been going, and what it is on right now.
 *
 * It states facts the page already holds and decides nothing: `startedAt` is Main's own stamp on
 * the streaming message, so a reload mid-run keeps counting, and `step` is read off its parts
 * (`run-status.ts`). The clock rolls its digits by place value (`TxTextMorph`) rather than
 * swapping the text once a second.
 */
const props = defineProps<{
  startedAt?: number
  step: RunStep
  verb?: string
}>()

const { t } = useI18n()

const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null

function stopClock(): void {
  if (timer !== null) clearInterval(timer)
  timer = null
}

watch(
  () => props.startedAt,
  (startedAt) => {
    stopClock()
    if (startedAt === undefined) return
    now.value = Date.now()
    timer = setInterval(() => {
      now.value = Date.now()
    }, 1000)
  },
  { immediate: true }
)

onBeforeUnmount(stopClock)

const elapsed = computed(() =>
  props.startedAt === undefined ? '' : formatElapsed(now.value - props.startedAt)
)

const label = computed(() => {
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
</script>

<template>
  <div class="HomeRunStatus" role="status" aria-live="off">
    <TxTuffLogoStroke class="HomeRunStatus-Mark" :size="16" mode="breathe" aria-hidden="true" />
    <span v-if="elapsed" class="HomeRunStatus-Time">
      <TxTextMorph :text="elapsed" :duration-ms="420" />
    </span>
    <span class="HomeRunStatus-Divider" aria-hidden="true" />
    <span class="HomeRunStatus-Step" :class="`is-${step.kind}`" :title="label">
      <TxTextMorph :text="label" :duration-ms="320" />
    </span>
  </div>
</template>

<style lang="scss" scoped>
.HomeRunStatus {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  min-width: 0;
  padding: 0 24px;
  box-sizing: border-box;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-sm);
}

.HomeRunStatus-Mark {
  flex: none;
}

.HomeRunStatus-Time {
  flex: none;
  font-family: var(--shell-font-mono, monospace);
  font-size: var(--shell-fs-sm);
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
  white-space: nowrap;
}

.HomeRunStatus-Divider {
  flex: none;
  align-self: stretch;
  width: 1px;
  background: var(--shell-border);
}

/* The label is one line and shrinks into an ellipsis; left-aligned to align with the composer track. */
.HomeRunStatus-Step {
  max-width: min(60ch, 100%);
  min-width: 0;
  overflow: hidden;
  font-size: var(--shell-fs-sm);
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;

  &.is-tool {
    color: var(--shell-primary);
  }
}
</style>
