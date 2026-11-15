<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const { locale } = useI18n()

const TOTAL_MB = 2.3
const STEP_MS = 100

const percentage = ref(0)
const rootRef = ref<HTMLElement | null>(null)

let tickTimer: ReturnType<typeof setInterval> | undefined
let restartTimer: ReturnType<typeof setTimeout> | undefined
let visibilityObserver: IntersectionObserver | undefined

const copy = computed(() => {
  if (locale.value === 'zh') {
    return {
      aria: '上传 report.pdf',
      format: (p: number) => `上传中 ${p}%`,
      of: (done: string, total: string) => `${done} MB / ${total} MB`,
    }
  }

  return {
    aria: 'Uploading report.pdf',
    format: (p: number) => `Uploading ${p}%`,
    of: (done: string, total: string) => `${done} MB of ${total} MB`,
  }
})

const detail = computed(() => {
  const done = (TOTAL_MB * percentage.value / 100).toFixed(1)
  return copy.value.of(done, TOTAL_MB.toFixed(1))
})

function stop(): void {
  if (tickTimer)
    clearInterval(tickTimer)
  if (restartTimer)
    clearTimeout(restartTimer)
  tickTimer = undefined
  restartTimer = undefined
}

// Reports land every 100ms in uneven steps, the way a real upload does; the
// bar's 480ms ease is what turns those steps into one continuous advance.
function start(): void {
  stop()
  percentage.value = 0
  tickTimer = setInterval(() => {
    const step = 1 + Math.floor(Math.random() * 3)
    percentage.value = Math.min(100, percentage.value + step)
    if (percentage.value >= 100) {
      stop()
      restartTimer = setTimeout(start, 2400)
    }
  }, STEP_MS)
}

// Start on first sight, not on mount: a lazily mounted demo can sit below the fold, and a
// loop that runs unseen is wasted work. Without IntersectionObserver it starts at once.
onMounted(() => {
  const root = rootRef.value
  if (!root || typeof IntersectionObserver === 'undefined') {
    start()
    return
  }

  visibilityObserver = new IntersectionObserver((entries) => {
    if (!entries.some(entry => entry.isIntersecting))
      return
    visibilityObserver?.disconnect()
    visibilityObserver = undefined
    start()
  })
  visibilityObserver.observe(root)
})

onBeforeUnmount(() => {
  visibilityObserver?.disconnect()
  visibilityObserver = undefined
  stop()
})

defineExpose({ replayDemo: start })
</script>

<template>
  <div ref="rootRef" class="progress-bar-upload-demo">
    <TxProgressBar
      :percentage="percentage"
      :format="copy.format"
      :detail="detail"
      :aria-label="copy.aria"
      show-text
      text-placement="top"
      height="6px"
      flow-effect="stardust"
    />
    <TxProgressBar
      :percentage="percentage"
      detail="report.pdf"
      :aria-label="copy.aria"
      show-text
      text-placement="bottom"
      height="6px"
      color="linear-gradient(90deg, #3b82f6, #a855f7)"
      flow-effect="stardust"
    />
  </div>
</template>

<style scoped>
.progress-bar-upload-demo {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: min(100%, 360px);
}
</style>
