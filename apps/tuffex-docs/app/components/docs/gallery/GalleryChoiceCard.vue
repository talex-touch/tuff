<script setup lang="ts">
import type { ChoiceSelectPayload, ChoiceStep } from '@talex-touch/tuffex/choice-card'
import { computed, ref } from 'vue'

type Kind = 'write' | 'plan' | 'learn'

// The page state lives here, not in the gallery, so the cell's reset button puts the
// card back on its first page and replays the rows' entrance.
const { locale } = useI18n()
const zh = computed(() => locale.value.startsWith('zh'))

const copy = computed(() => zh.value
  ? {
      title: '我们先从哪件事开始？',
      prev: '上一步',
      next: '下一步',
      kinds: {
        write: ['写作', '报告、邮件、纪要'],
        plan: ['规划', '日程与优先级'],
        learn: ['学习', '入门与练习'],
      },
      taskTitles: { write: '写点什么？', plan: '规划哪一段？', learn: '想怎么学？' },
      tasks: {
        write: [['report', '周报', '本周完成的事'], ['reply', '回复邮件', '起草一封回复'], ['notes', '会议纪要', '整理成要点']],
        plan: [['tomorrow', '明天', '三件最重要的事'], ['week', '这一周', '预留专注时间'], ['retro', '上周复盘', '做成了什么']],
        learn: [['primer', '10 分钟入门', '快速概览'], ['quiz', '自测', '五道小题'], ['translate', '对照翻译', '逐段阅读']],
      },
    }
  : {
      title: 'Where should we start?',
      prev: 'Previous',
      next: 'Next',
      kinds: {
        write: ['Write', 'Reports, emails, notes'],
        plan: ['Plan', 'Schedules and priorities'],
        learn: ['Learn', 'Primers and practice'],
      },
      taskTitles: { write: 'What are we writing?', plan: 'Which stretch?', learn: 'How to learn?' },
      tasks: {
        write: [['report', 'Weekly report', 'What shipped'], ['reply', 'Email reply', 'Draft an answer'], ['notes', 'Meeting notes', 'Key points']],
        plan: [['tomorrow', 'Tomorrow', 'Three priorities'], ['week', 'This week', 'Focus time'], ['retro', 'Last week', 'What got done']],
        learn: [['primer', 'Primer', 'A quick overview'], ['quiz', 'Self-test', 'Five questions'], ['translate', 'Side by side', 'Paragraph by paragraph']],
      },
    })

const KIND_ICONS: Record<Kind, string> = {
  write: 'i-carbon-pen',
  plan: 'i-carbon-roadmap',
  learn: 'i-carbon-education',
}

const TASK_ICONS: Record<string, string> = {
  report: 'i-carbon-report',
  reply: 'i-carbon-email',
  notes: 'i-carbon-notebook',
  tomorrow: 'i-carbon-calendar',
  week: 'i-carbon-time',
  retro: 'i-carbon-recently-viewed',
  primer: 'i-carbon-book',
  quiz: 'i-carbon-idea',
  translate: 'i-carbon-translate',
}

const step = ref(0)
const kind = ref<Kind>()
const task = ref<string>()

// Both pages exist from the start, so the pager shows; the second follows the first answer.
const steps = computed<ChoiceStep[]>(() => {
  const shown = kind.value ?? 'write'
  return [
    {
      id: 'kind',
      title: copy.value.title,
      options: (Object.keys(KIND_ICONS) as Kind[]).map(id => ({
        id,
        label: copy.value.kinds[id][0]!,
        description: copy.value.kinds[id][1],
        icon: KIND_ICONS[id],
      })),
    },
    {
      id: `tasks-${shown}`,
      title: copy.value.taskTitles[shown],
      options: copy.value.tasks[shown].map(([id, label, description]) => ({
        id: id!,
        label: label!,
        description,
        icon: TASK_ICONS[id!],
      })),
    },
  ]
})

const selected = computed(() => (step.value === 0 ? kind.value : task.value))

function onSelect({ stepIndex, option }: ChoiceSelectPayload): void {
  if (stepIndex === 0) {
    if (kind.value !== option.id)
      task.value = undefined
    kind.value = option.id as Kind
    step.value = 1
    return
  }
  task.value = option.id
}
</script>

<template>
  <TxChoiceCard
    v-model:step="step"
    :steps="steps"
    :selected="selected"
    :prev-label="copy.prev"
    :next-label="copy.next"
    @select="onSelect"
  />
</template>
