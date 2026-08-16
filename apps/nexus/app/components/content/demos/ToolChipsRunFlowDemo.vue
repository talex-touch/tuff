<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

// Upstream reveals one row every 700ms. That cadence is a demo script, not a
// component behaviour — a real run pushes rows in as the agent produces them —
// so the timeline lives here and the component only renders what it is given.
const STEP_MS = 700

const { locale } = useI18n()

const copy = computed(() => {
  if (locale.value === 'zh') {
    return {
      rows: [
        {
          id: 'think',
          label: '思考',
          chip: '正在规划搅拌排期…',
          icon: 'think' as const,
          detail: [
            { text: '周末需求集中在开心果，先churn它。' },
            { text: '产能只剩两个傍晚的冷冻窗口。' },
          ],
        },
        {
          id: 'write',
          label: '写入 204 行',
          chip: 'ChurnSchedule.tsx',
          icon: 'write' as const,
          mono: true,
          detailMono: true,
          detail: [
            { text: '+ const windows = slots.filter((s) => s.temp <= -12)', tone: 'add' as const },
            { text: '+ return schedule(windows, { hero: "pistachio" })', tone: 'add' as const },
          ],
        },
        {
          id: 'run',
          label: '重建并校验',
          chip: 'npm run freeze',
          icon: 'run' as const,
          mono: true,
          detailMono: true,
          detail: [
            { text: '✓ 1.2s 内构建完成' },
            { text: '✓ 34 项检查通过' },
          ],
        },
        {
          id: 'read',
          label: '读取图片',
          chip: 'flavor-chart.png',
          icon: 'read' as const,
          mono: true,
          detail: [
            { text: '1280 × 720 · 折线图，三个夏天。' },
            { text: '薄荷碎片七月上涨 12%。' },
          ],
        },
      ],
      summary: '4 次工具调用，2 条消息',
      replay: '重新播放',
    }
  }

  return {
    rows: [
      {
        id: 'think',
        label: 'Thinking',
        chip: 'Planning the churn schedule…',
        icon: 'think' as const,
        detail: [
          { text: 'Weekend demand carries pistachio, so it churns first.' },
          { text: 'Batch capacity leaves two evening freezer windows.' },
        ],
      },
      {
        id: 'write',
        label: 'Write 204 lines',
        chip: 'ChurnSchedule.tsx',
        icon: 'write' as const,
        mono: true,
        detailMono: true,
        detail: [
          { text: '+ const windows = slots.filter((s) => s.temp <= -12)', tone: 'add' as const },
          { text: '+ return schedule(windows, { hero: "pistachio" })', tone: 'add' as const },
        ],
      },
      {
        id: 'run',
        label: 'Rebuild and verify',
        chip: 'npm run freeze',
        icon: 'run' as const,
        mono: true,
        detailMono: true,
        detail: [
          { text: '✓ built in 1.2s' },
          { text: '✓ 34 checks passed' },
        ],
      },
      {
        id: 'read',
        label: 'Read image',
        chip: 'flavor-chart.png',
        icon: 'read' as const,
        mono: true,
        detail: [
          { text: '1280 × 720 · line chart, three summers.' },
          { text: 'Mint chip trends up 12% through July.' },
        ],
      },
    ],
    summary: '4 tool calls, 2 messages',
    replay: 'Replay',
  }
})

const DIFFS = [
  { file: 'flavors.css', add: 13, del: 0 },
  { file: 'ChurnSchedule.tsx', add: 74, del: 41 },
  { file: 'menu.ts', add: 8, del: 2 },
]

const step = ref(0)
let timer: ReturnType<typeof setTimeout> | undefined

const visibleRows = computed(() => copy.value.rows.slice(0, step.value))
const visibleDiffs = computed(() => (step.value > copy.value.rows.length ? DIFFS : []))

function stop() {
  if (timer) {
    clearTimeout(timer)
    timer = undefined
  }
}

function tick() {
  stop()
  if (step.value > copy.value.rows.length)
    return

  timer = setTimeout(() => {
    step.value += 1
    tick()
  }, STEP_MS)
}

function replay() {
  step.value = 0
  tick()
}

// Kicked off on mount, not in setup: the timeline would otherwise start on the
// server, where nothing ever clears it.
onMounted(replay)
watch(locale, replay)
onBeforeUnmount(stop)
</script>

<template>
  <div class="flex flex-col gap-4">
    <TxToolChips
      :rows="visibleRows"
      :diffs="visibleDiffs"
      :summary="copy.summary"
      :more-count="2"
    />

    <div>
      <TxButton size="small" variant="secondary" @click="replay">
        {{ copy.replay }}
      </TxButton>
    </div>
  </div>
</template>
