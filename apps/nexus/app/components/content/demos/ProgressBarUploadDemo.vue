<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const { locale } = useI18n()

const TOTAL_MB = 2.3
const STEP_MS = 100

const percentage = ref(0)

let tickTimer: ReturnType<typeof setInterval> | undefined
let restartTimer: ReturnType<typeof setTimeout> | undefined

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

onMounted(start)
onBeforeUnmount(stop)

defineExpose({ replayDemo: start })
</script>

<template>
  <div class="progress-bar-upload-demo">
    <TxProgressBar
      :percentage="percentage"
      :format="copy.format"
      :detail="detail"
      :aria-label="copy.aria"
      show-text
      text-placement="top"
      height="6px"
    />
  </div>
</template>

<style scoped>
.progress-bar-upload-demo {
  width: min(100%, 360px);
}
</style>
