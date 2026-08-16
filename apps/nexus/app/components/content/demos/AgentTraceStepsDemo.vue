<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const { locale } = useI18n()

/**
 * The upstream Beautiful UI timeline, reproduced here rather than inside the
 * component: TxAgentTrace is a controlled primitive, so the schedule that
 * drives it belongs to whoever owns the data. Cumulative marks are 800 /
 * 1400 / 3200 / 5800ms. The source array carries a trailing 1600 that never
 * fires — the sequence stops one step earlier.
 */
const STAGES = [800, 600, 1800, 2600]

const copy = computed(() => {
  if (locale.value === 'zh') {
    return {
      replay: '重新播放',
      done: '思考了 4 秒',
      rows: [
        { id: 'briefs', primary: '阅读口味简报' },
        { id: 'suppliers', primary: '扫描供应商名单' },
        { id: 'notes', primary: '比对品鉴记录', secondary: '6 种口味' },
        { id: 'report', primary: '撰写冰淇淋报告' },
      ],
    }
  }

  return {
    replay: 'Replay',
    done: 'Thought for 4 seconds',
    rows: [
      { id: 'briefs', primary: 'Reading flavor briefs' },
      { id: 'suppliers', primary: 'Scanning supplier lists' },
      { id: 'notes', primary: 'Comparing tasting notes', secondary: '6 flavors' },
      { id: 'report', primary: 'Writing the scoop report' },
    ],
  }
})

const stage = ref(0)
let timer: ReturnType<typeof setTimeout> | undefined

function stop(): void {
  if (timer) {
    clearTimeout(timer)
    timer = undefined
  }
}

function advance(): void {
  if (stage.value >= STAGES.length) return

  timer = setTimeout(() => {
    stage.value += 1
    advance()
  }, STAGES[stage.value])
}

function replay(): void {
  stop()
  stage.value = 0
  advance()
}

// Rows arrive in two batches rather than one at a time.
const visible = computed(() => {
  if (stage.value < 2) return 0
  if (stage.value === 2) return Math.min(2, copy.value.rows.length)
  return copy.value.rows.length
})

const rows = computed(() => copy.value.rows.slice(0, visible.value))
const working = computed(() => stage.value < 3)

// Opens as the trace starts, folds once it has settled and been read.
const open = computed(() => stage.value >= 1 && stage.value < 4)

// Started on mount, not in setup: setup also runs while prerendering, and a
// timer chain scheduled there would never be cleaned up on the server.
onMounted(replay)
onBeforeUnmount(stop)
</script>

<template>
  <div class="flex flex-col gap-4">
    <TxButton class="self-start" size="small" variant="secondary" @click="replay">
      {{ copy.replay }}
    </TxButton>

    <div class="max-w-[380px] min-h-[176px]">
      <TxAgentTrace
        :rows="rows"
        :working="working"
        :default-open="open"
        :done-label="copy.done"
      />
    </div>
  </div>
</template>
