<script setup lang="ts">
import type { ChoiceOption, ChoiceSelectPayload, ChoiceStep } from '@talex-touch/tuffex/choice-card'
import { computed, ref } from 'vue'

type CategoryId = 'write' | 'plan' | 'learn' | 'organize'

const { locale } = useI18n()
const zh = computed(() => locale.value.startsWith('zh'))

const copy = computed(() => zh.value
  ? {
      title: '我们先从哪类事开始？',
      prev: '上一步',
      next: '下一步',
      startOver: '重新开始',
      pickCategory: '先选一类。',
      pickTask: '选一件具体的事，或回到上一步换一类。',
      starting: '开始：',
      categories: {
        write: ['写作', '报告、邮件、会议纪要'],
        plan: ['规划', '日程、优先级、复盘'],
        learn: ['学习', '入门、练习、翻译'],
        organize: ['整理', '文件、待办、收件箱'],
      },
      taskTitles: {
        write: '写点什么？',
        plan: '规划哪一段时间？',
        learn: '想怎么学？',
        organize: '先整理哪里？',
      },
      tasks: {
        write: [['report', '周报', '整理本周完成的事和下周计划'], ['reply', '回复邮件', '为一封邮件起草回复'], ['notes', '会议纪要', '把录音整理成要点']],
        plan: [['tomorrow', '明天', '按顺序列出三件最重要的事'], ['week', '这一周', '为专注工作预留时间'], ['retro', '上周复盘', '回顾上周做成了什么']],
        learn: [['primer', '10 分钟入门', '任意主题的快速概览'], ['quiz', '自测', '用五道题检验掌握程度'], ['translate', '对照翻译', '逐段读一篇外文']],
        organize: [['todos', '待办清单', '合并散落各处的待办'], ['files', '下载文件夹', '把文件归入对应目录'], ['inbox', '收件箱', '归档已经处理完的邮件']],
      },
    }
  : {
      title: 'What should we start with?',
      prev: 'Previous',
      next: 'Next',
      startOver: 'Start over',
      pickCategory: 'Pick a kind of task first.',
      pickTask: 'Pick a task, or go back to change the kind.',
      starting: 'Starting: ',
      categories: {
        write: ['Write', 'Reports, emails, meeting notes'],
        plan: ['Plan', 'Schedules, priorities, reviews'],
        learn: ['Learn', 'Primers, practice, translation'],
        organize: ['Organize', 'Files, to-dos, inbox'],
      },
      taskTitles: {
        write: 'What are we writing?',
        plan: 'Which stretch of time?',
        learn: 'How do you want to learn?',
        organize: 'What needs tidying first?',
      },
      tasks: {
        write: [['report', 'Weekly report', 'Sum up what shipped and what is next'], ['reply', 'Email reply', 'Draft an answer to one thread'], ['notes', 'Meeting notes', 'Turn a recording into key points']],
        plan: [['tomorrow', 'Tomorrow', 'Three priorities, in order'], ['week', 'This week', 'Block out time for focused work'], ['retro', 'Last week', 'Look back at what got done']],
        learn: [['primer', '10-minute primer', 'A quick overview of any topic'], ['quiz', 'Self-test', 'Five questions to check yourself'], ['translate', 'Side-by-side reading', 'A foreign article, paragraph by paragraph']],
        organize: [['todos', 'To-do list', 'Merge to-dos scattered around'], ['files', 'Downloads', 'Sort files into their folders'], ['inbox', 'Inbox', 'Archive mail that is dealt with']],
      },
    })

const CATEGORY_ICONS: Record<CategoryId, string> = {
  write: 'i-carbon-pen',
  plan: 'i-carbon-roadmap',
  learn: 'i-carbon-education',
  organize: 'i-carbon-folder',
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
  todos: 'i-carbon-list-checked',
  files: 'i-carbon-folder',
  inbox: 'i-carbon-email',
}

const step = ref(0)
const category = ref<CategoryId>()
const task = ref<string>()

const categoryStep = computed<ChoiceStep>(() => ({
  id: 'category',
  title: copy.value.title,
  options: (Object.keys(CATEGORY_ICONS) as CategoryId[]).map(id => ({
    id,
    label: copy.value.categories[id][0]!,
    description: copy.value.categories[id][1],
    icon: CATEGORY_ICONS[id],
  })),
}))

// The second page depends on the first answer, so it only exists once there is one, and
// its id changes with the category: picking another kind replaces the page.
const steps = computed<ChoiceStep[]>(() => {
  if (!category.value)
    return [categoryStep.value]

  const id = category.value
  const options: ChoiceOption[] = copy.value.tasks[id].map(([taskId, label, description]) => ({
    id: taskId!,
    label: label!,
    description,
    icon: TASK_ICONS[taskId!],
  }))
  return [categoryStep.value, { id: `tasks-${id}`, title: copy.value.taskTitles[id], options }]
})

// Each page marks its own answer, so going back shows what was picked there.
const selected = computed(() => (step.value === 0 ? category.value : task.value))

const taskLabel = computed(() => steps.value[1]?.options.find(option => option.id === task.value)?.label)
const note = computed(() => {
  if (taskLabel.value)
    return `${copy.value.starting}${taskLabel.value}`
  return category.value ? copy.value.pickTask : copy.value.pickCategory
})

function onSelect({ stepIndex, option }: ChoiceSelectPayload): void {
  if (stepIndex === 0) {
    if (category.value !== option.id)
      task.value = undefined
    category.value = option.id as CategoryId
    // The card never moves on by itself; the host decides the next page is due.
    step.value = 1
    return
  }
  task.value = option.id
}

function startOver(): void {
  category.value = undefined
  task.value = undefined
  step.value = 0
}
</script>

<template>
  <div class="choice-card-steps-demo not-prose">
    <TxChoiceCard
      v-model:step="step"
      :steps="steps"
      :selected="selected"
      :columns="2"
      :prev-label="copy.prev"
      :next-label="copy.next"
      @select="onSelect"
    />
    <div class="choice-card-steps-demo__footer">
      <p class="choice-card-steps-demo__note" aria-live="polite">
        {{ note }}
      </p>
      <TxButton v-if="category" size="sm" variant="secondary" @click="startOver">
        {{ copy.startOver }}
      </TxButton>
    </div>
  </div>
</template>

<style scoped>
.choice-card-steps-demo {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 600px;
}

.choice-card-steps-demo__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 28px;
}

.choice-card-steps-demo__note {
  margin: 0;
  font-size: 12px;
  color: var(--tx-text-color-regular, #606266);
}
</style>
