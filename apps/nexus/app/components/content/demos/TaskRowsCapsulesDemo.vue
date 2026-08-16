<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const { locale } = useI18n()

/**
 * The upstream Beautiful UI timeline, kept here rather than in the component:
 * TxTaskRows is controlled, so the status run belongs to whoever owns the
 * rows. Cumulative marks are 600 / 1500 / 3900 / 5300 / 7700ms. The source
 * array carries a trailing 600 that never fires.
 */
const TICKS = [600, 900, 2400, 1400, 2400]

const copy = computed(() => {
  if (locale.value === 'zh') {
    return {
      replay: '重新播放',
      done: '已完成',
      error: '失败',
      verify: '已核对供应商记录',
      verifyAmount: '12 家供应商',
      verifyDetails: [
        { label: '税号与联系人已匹配', meta: '12/12' },
        { label: '标记过期记录', meta: '0' },
      ],
      index: '生成补货任务清单',
      indexAmount: '7 个 SKU',
      indexDetails: [
        { label: '读取 POS 导出', meta: '3 个文件' },
        { label: '评估缺货风险', meta: '68%' },
      ],
      draft: '起草供应商邮件',
      draftAmount: '2 封',
      draftDetails: [
        { label: '蛋筒供应商跟进', meta: '草稿' },
        { label: '开心果补货说明', meta: '草稿' },
      ],
    }
  }

  return {
    replay: 'Replay',
    done: 'Completed',
    error: 'Failed',
    verify: 'Verified vendor records',
    verifyAmount: '12 suppliers',
    verifyDetails: [
      { label: 'Matched tax and contact IDs', meta: '12/12' },
      { label: 'Flagged stale records', meta: '0' },
    ],
    index: 'Build reorder task list',
    indexAmount: '7 SKUs',
    indexDetails: [
      { label: 'Reading POS export', meta: '3 files' },
      { label: 'Scoring stockout risk', meta: '68%' },
    ],
    draft: 'Draft supplier emails',
    draftAmount: '2 messages',
    draftDetails: [
      { label: 'Cone supplier follow-up', meta: 'draft' },
      { label: 'Pistachio reorder note', meta: 'draft' },
    ],
  }
})

const tick = ref(0)
let timer: ReturnType<typeof setTimeout> | undefined

// Controlled open set: the script writes it at tick 2 and 3, and so does the
// reader. Both go through the same ref, so clicking never fights the script.
const openIds = ref<string[]>([])

function stop(): void {
  if (timer) {
    clearTimeout(timer)
    timer = undefined
  }
}

function advance(): void {
  if (tick.value >= TICKS.length) return

  timer = setTimeout(() => {
    tick.value += 1
    if (tick.value === 2) openIds.value = ['index']
    if (tick.value === 3) openIds.value = []
    advance()
  }, TICKS[tick.value])
}

function replay(): void {
  stop()
  tick.value = 0
  openIds.value = []
  advance()
}

const draftStatus = computed(() => {
  if (tick.value < 3) return 'pending' as const
  if (tick.value === 3) return 'error' as const
  return 'done' as const
})

const rows = computed(() => [
  {
    id: 'verify',
    label: copy.value.verify,
    status: 'done' as const,
    amount: copy.value.verifyAmount,
    details: copy.value.verifyDetails,
  },
  {
    id: 'index',
    label: copy.value.index,
    status: 'running' as const,
    amount: copy.value.indexAmount,
    index: 2,
    details: copy.value.indexDetails,
  },
  {
    id: 'draft',
    label: copy.value.draft,
    status: draftStatus.value,
    amount: copy.value.draftAmount,
    index: 3,
    details: copy.value.draftDetails,
  },
])

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

    <div class="max-w-[440px] min-h-[196px]">
      <TxTaskRows
        :rows="rows"
        :open-ids="openIds"
        :done-text="copy.done"
        :error-text="copy.error"
        @update:open-ids="openIds = $event"
      />
    </div>
  </div>
</template>
