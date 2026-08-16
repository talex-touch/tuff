<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const { locale } = useI18n()

/** Upstream cadence: 400ms before the first line, 240ms per line, 3200ms hold. */
const START_MS = 400
const LINE_MS = 240
const HOLD_MS = 3200

const CODE = `export async function churnBatch() {
  const flavor = await getFlavor("pistachio");
  const base = await dairy.fetch({ flavor });
  await freezer.store(base, { temp: "-14C" });
  return base.gallons;
}`

const TOTAL_LINES = CODE.split('\n').length

const copy = computed(() => (locale.value === 'zh'
  ? { copyLabel: '复制', copiedLabel: '已复制', done: '写入完成' }
  : { copyLabel: 'Copy', copiedLabel: 'Copied', done: 'Write complete' }))

const revealed = ref(0)
const completed = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

function stop(): void {
  if (timer) {
    clearTimeout(timer)
    timer = undefined
  }
}

// Loops: reveal line by line, hold on the finished listing, then start over.
function schedule(): void {
  const delay = revealed.value === 0
    ? START_MS
    : revealed.value >= TOTAL_LINES ? HOLD_MS : LINE_MS

  timer = setTimeout(() => {
    revealed.value = revealed.value >= TOTAL_LINES ? 0 : revealed.value + 1
    if (revealed.value === 0) completed.value = false
    schedule()
  }, delay)
}

// Started on mount, not in setup: setup also runs while prerendering, and a
// timer chain scheduled there would never be cleaned up on the server.
onMounted(schedule)
onBeforeUnmount(stop)
</script>

<template>
  <div class="flex max-w-[380px] flex-col gap-2">
    <TxCodeStream
      :code="CODE"
      lang="ts"
      filename="churn.ts"
      lang-label="TypeScript"
      :revealed-lines="revealed"
      :copy-label="copy.copyLabel"
      :copied-label="copy.copiedLabel"
      @complete="completed = true"
    />

    <span class="h-4 text-xs text-[var(--tx-text-color-secondary)]">
      {{ completed ? copy.done : '' }}
    </span>
  </div>
</template>
