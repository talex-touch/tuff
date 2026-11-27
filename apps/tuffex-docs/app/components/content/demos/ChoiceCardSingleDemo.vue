<script setup lang="ts">
import type { ChoiceSelectPayload, ChoiceStep } from '@talex-touch/tuffex/choice-card'
import { computed, ref } from 'vue'

const { locale } = useI18n()
const zh = computed(() => locale.value.startsWith('zh'))

const copy = computed(() => zh.value
  ? {
      title: '我们先从哪件事开始？',
      picked: '已选择：',
      none: '选一项开始。',
      report: ['写一份周报', '整理本周完成的事和下周计划'],
      plan: ['规划明天', '按顺序列出三件最重要的事'],
      inbox: ['处理未读消息', '汇总需要你回复的消息'],
      learn: ['学点新东西', '任意主题的 10 分钟入门'],
      calendar: ['同步日历', '先连接一个日历账户'],
    }
  : {
      title: 'Where should we start?',
      picked: 'Picked: ',
      none: 'Pick one to start.',
      report: ['Write a weekly report', 'Sum up what shipped and what is next'],
      plan: ['Plan tomorrow', 'Three priorities, in order'],
      inbox: ['Catch up on messages', 'Everything waiting on a reply'],
      learn: ['Learn something new', 'A 10-minute primer on any topic'],
      calendar: ['Sync my calendar', 'Connect a calendar account first'],
    })

type OptionId = 'report' | 'plan' | 'inbox' | 'learn' | 'calendar'

const OPTIONS: { id: OptionId, icon: string, disabled?: boolean }[] = [
  { id: 'report', icon: 'i-carbon-report' },
  { id: 'plan', icon: 'i-carbon-calendar' },
  { id: 'inbox', icon: 'i-carbon-email' },
  { id: 'learn', icon: 'i-carbon-education' },
  // Needs an account the reader has not connected: shown, but not selectable.
  { id: 'calendar', icon: 'i-carbon-calendar-add-alt', disabled: true },
]

const steps = computed<ChoiceStep[]>(() => [{
  id: 'start',
  title: copy.value.title,
  options: OPTIONS.map(({ id, icon, disabled }) => ({
    id,
    icon,
    label: copy.value[id][0]!,
    description: copy.value[id][1],
    disabled,
  })),
}])

const selected = ref<string>()
const pickedLabel = computed(() => steps.value[0]!.options.find(option => option.id === selected.value)?.label)

function onSelect({ option }: ChoiceSelectPayload): void {
  selected.value = option.id
}
</script>

<template>
  <div class="choice-card-single-demo not-prose">
    <TxChoiceCard :steps="steps" :selected="selected" @select="onSelect" />
    <p class="choice-card-single-demo__note" aria-live="polite">
      {{ pickedLabel ? `${copy.picked}${pickedLabel}` : copy.none }}
    </p>
  </div>
</template>

<style scoped>
.choice-card-single-demo {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 420px;
}

.choice-card-single-demo__note {
  margin: 0;
  font-size: 12px;
  color: var(--tx-text-color-regular, #606266);
}
</style>
