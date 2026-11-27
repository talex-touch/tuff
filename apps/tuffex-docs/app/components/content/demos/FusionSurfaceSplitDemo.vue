<script setup lang="ts">
import type { FusionSurfaceBud } from '@talex-touch/tuffex/fusion-surface'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const { locale } = useI18n()
const zh = computed(() => locale.value.startsWith('zh'))

const copy = computed(() => zh.value
  ? {
      thread: '会话',
      incoming: '412 号构建通过了',
      outgoing: '正在打 v0.6.0 标签',
      message: '今晚就发布',
      placeholder: '输入消息',
      send: '发送',
      replay: '重播',
    }
  : {
      thread: 'Conversation',
      incoming: 'Build 412 is green',
      outgoing: 'Tagging v0.6.0 now',
      message: 'Ship it tonight',
      placeholder: 'Message',
      send: 'Send',
      replay: 'Replay',
    })

const BUBBLE_WIDTH = 168
const BUBBLE_HEIGHT = 36
// The body's corner radius (16) plus the fillet (12): the furthest right a
// bud's fillet can still land on the straight part of the top edge. The
// thread is inset by the same 28px, so the drop lines up with the bubbles.
const INSET = 28
// A clearly pinched neck, short of the break (about 27px at breakAt 28).
const STRETCH = 22
// The landing row's distance above the composer: its 36px bottom margin plus
// the stage's 8px gap. A drop settles `detach` px above the edge it left.
const LANDING = 44

const draft = ref(true)
const run = ref(0)
const center = ref(0)
const detach = ref(0)
const composerRef = ref<HTMLElement | null>(null)

// A new id per send: the previous drop, if still there, closes on its own
// while the next message grows.
const buds = computed<FusionSurfaceBud[]>(() => draft.value
  ? []
  : [{ id: `message-${run.value}`, center: center.value, width: BUBBLE_WIDTH, height: BUBBLE_HEIGHT, radius: 12, detach: detach.value }])

const timers: ReturnType<typeof setTimeout>[] = []
function later(ms: number, step: () => void): void {
  timers.push(setTimeout(step, ms))
}
function clearTimers(): void {
  timers.splice(0).forEach(clearTimeout)
}

// Grow, stretch a neck, then pull past breakAt: the neck snaps and the drop
// floats on to the landing row while the stub sinks back into the composer.
function send(): void {
  if (!draft.value)
    return
  clearTimers()
  const width = composerRef.value?.offsetWidth ?? 320
  center.value = width - INSET - BUBBLE_WIDTH / 2
  detach.value = 0
  run.value += 1
  draft.value = false
  later(420, () => (detach.value = STRETCH))
  later(940, () => (detach.value = LANDING))
}

function replay(): void {
  clearTimers()
  draft.value = true
  detach.value = 0
  later(650, send)
}

defineExpose({ replayDemo: replay })

// Plays once when the demo scrolls into view, not on mount: the wrapper
// mounts demos before they are visible.
const rootRef = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

onMounted(() => {
  const el = rootRef.value
  if (!el)
    return
  if (typeof IntersectionObserver === 'undefined') {
    later(600, send)
    return
  }
  observer = new IntersectionObserver((entries) => {
    if (!entries.some(entry => entry.isIntersecting))
      return
    observer?.disconnect()
    observer = null
    later(600, send)
  }, { threshold: 0.6 })
  observer.observe(el)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
  clearTimers()
})
</script>

<template>
  <div ref="rootRef" class="fusion-split-demo not-prose">
    <div class="fusion-split-demo__stage">
      <ul class="fusion-split-demo__thread" :aria-label="copy.thread">
        <li class="fusion-split-demo__row">
          <span class="fusion-split-demo__bubble is-in">{{ copy.incoming }}</span>
        </li>
        <li class="fusion-split-demo__row is-out">
          <span class="fusion-split-demo__bubble is-out">{{ copy.outgoing }}</span>
        </li>
      </ul>
      <!-- The row the drop lands in; the drop itself is the new message. -->
      <div class="fusion-split-demo__landing" aria-hidden="true" />

      <div ref="composerRef">
        <TxFusionSurface
          class="fusion-split-demo__composer"
          :buds="buds"
          stroke="var(--tx-border-color-lighter)"
        >
          <span class="fusion-split-demo__draft" :class="{ 'is-empty': !draft }">
            {{ draft ? copy.message : copy.placeholder }}
          </span>
          <button
            type="button"
            class="fusion-split-demo__send"
            :aria-label="copy.send"
            :disabled="!draft"
            @click="send"
          >
            <span class="i-carbon-send" aria-hidden="true" />
          </button>

          <template #bud>
            <span class="fusion-split-demo__message">{{ copy.message }}</span>
          </template>
        </TxFusionSurface>
      </div>
    </div>

    <TxButton size="sm" variant="ghost" icon="i-carbon-renew" @click="replay">
      {{ copy.replay }}
    </TxButton>
  </div>
</template>

<style scoped>
.fusion-split-demo {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.fusion-split-demo__stage {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 320px;
  max-width: 100%;
}

/* Inset like the drop: see INSET in the script. */
.fusion-split-demo__thread {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0 28px;
  list-style: none;
}

.fusion-split-demo__row {
  display: flex;
  margin: 0;
}

.fusion-split-demo__row.is-out {
  justify-content: flex-end;
}

.fusion-split-demo__bubble {
  display: inline-flex;
  align-items: center;
  height: 36px;
  padding: 0 12px;
  border-radius: 12px;
  font-size: 13px;
  white-space: nowrap;
  color: var(--tx-text-color-primary, #303133);
}

.fusion-split-demo__bubble.is-in {
  background: var(--tx-fill-color-light, #f5f7fa);
}

/* What a landed drop looks like: the composer's fill, outline and shadow. */
.fusion-split-demo__bubble.is-out {
  background: var(--tx-bg-color-overlay, #fff);
  box-shadow:
    inset 0 0 0 1px var(--tx-border-color-lighter, #ebeef5),
    var(--tx-elevation-3, 2px 4px 14px rgba(0, 0, 0, 0.06));
}

.fusion-split-demo__landing {
  height: 36px;
  margin-bottom: 36px;
}

.fusion-split-demo__composer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  box-sizing: border-box;
  height: 48px;
  padding: 0 8px 0 16px;
}

.fusion-split-demo__draft {
  overflow: hidden;
  font-size: 13px;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--tx-text-color-primary, #303133);
}

.fusion-split-demo__draft.is-empty {
  color: var(--tx-text-color-regular, #606266);
}

/* Radius 8 inside 8px of inset: concentric with the composer's 16px corner. */
.fusion-split-demo__send {
  display: grid;
  flex: none;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: var(--tx-color-primary-light-9, #ecf5ff);
  color: color-mix(in srgb, var(--tx-color-primary, #409eff) 50%, var(--tx-text-color-primary, #303133));
  font-size: 16px;
  cursor: pointer;
}

.fusion-split-demo__send:hover:not(:disabled) {
  background: var(--tx-color-primary-light-8, #d9ecff);
}

.fusion-split-demo__send:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 1px;
}

.fusion-split-demo__send:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* Fills the bud's content layer, BUBBLE_WIDTH x BUBBLE_HEIGHT, laid out like
   a thread bubble. */
.fusion-split-demo__message {
  display: flex;
  align-items: center;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  padding: 0 12px;
  font-size: 13px;
  white-space: nowrap;
  color: var(--tx-text-color-primary, #303133);
}
</style>
