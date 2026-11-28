<script setup lang="ts">
import { computed, ref } from 'vue'

type AnswerMap = Record<string, { questionId: string, values: string[], custom?: string }>

const { locale } = useI18n()

const copy = computed(() => {
  if (locale.value === 'zh') {
    return {
      questions: [
        {
          id: 'count',
          question: '我们先上几个口味？',
          type: 'radio' as const,
          options: [
            { value: 'three', label: '三个（核心线）' },
            { value: 'five', label: '五个（整箱）' },
            { value: 'one', label: '只做一个主打' },
          ],
        },
        {
          id: 'mixins',
          question: '要备哪些配料？',
          type: 'check' as const,
          options: [
            { value: 'chips', label: '巧克力碎' },
            { value: 'waffle', label: '华夫碎' },
            { value: 'sprinkles', label: '彩针糖' },
          ],
        },
        {
          id: 'market',
          question: '先进入哪个渠道？',
          type: 'radio' as const,
          options: [
            { value: 'trucks', label: '餐车' },
            { value: 'grocery', label: '商超冷柜' },
            { value: 'shops', label: '甜品店' },
          ],
        },
      ],
      sendLabel: '发送答案',
      nextQuestionLabel: '下一题',
      prevLabel: '上一题',
      nextLabel: '下一题',
      dismissLabel: '关闭',
      reopenLabel: '打开确认',
      sentLabel: '答案已发送',
      startOverLabel: '重新开始',
      customPlaceholder: '写点别的…',
      customLabel: '自定义答案',
      answered: '已作答',
      empty: '还没有作答。',
    }
  }

  return {
    questions: [
      {
        id: 'count',
        question: 'How many flavors should we launch?',
        type: 'radio' as const,
        options: [
          { value: 'three', label: 'Three (core line)' },
          { value: 'five', label: 'Five (full case)' },
          { value: 'one', label: 'Just one hero' },
        ],
      },
      {
        id: 'mixins',
        question: 'Which mix-ins should we stock?',
        type: 'check' as const,
        options: [
          { value: 'chips', label: 'Chocolate chips' },
          { value: 'waffle', label: 'Waffle bits' },
          { value: 'sprinkles', label: 'Sprinkles' },
        ],
      },
      {
        id: 'market',
        question: 'Which market do we enter first?',
        type: 'radio' as const,
        options: [
          { value: 'trucks', label: 'Food trucks' },
          { value: 'grocery', label: 'Grocery freezers' },
          { value: 'shops', label: 'Scoop shops' },
        ],
      },
    ],
    sendLabel: 'Send answers',
    nextQuestionLabel: 'Next question',
    prevLabel: 'Previous',
    nextLabel: 'Next',
    dismissLabel: 'Dismiss',
    reopenLabel: 'Open approval',
    sentLabel: 'Answers sent',
    startOverLabel: 'Start over',
    customPlaceholder: 'Type something…',
    customLabel: 'Custom answer',
    answered: 'Answered',
    empty: 'Nothing answered yet.',
  }
})

const answers = ref<AnswerMap>({})
const submitted = ref<string[]>([])

// The card owns the 480ms single-choice auto-advance; the host only records
// what came back so the walkthrough is inspectable.
function onSubmit(list: Array<{ questionId: string, values: string[], custom?: string }>) {
  submitted.value = list.map((answer) => {
    const text = answer.custom?.trim() || answer.values.join(', ')
    return `${answer.questionId}: ${text}`
  })
}

const answeredCount = computed(() => Object.values(answers.value).filter(
  answer => answer.values.length > 0 || Boolean(answer.custom?.trim()),
).length)
</script>

<template>
  <div class="flex flex-col gap-4">
    <TxApprovalCard
      v-model="answers"
      :questions="copy.questions"
      :send-label="copy.sendLabel"
      :next-question-label="copy.nextQuestionLabel"
      :prev-label="copy.prevLabel"
      :next-label="copy.nextLabel"
      :dismiss-label="copy.dismissLabel"
      :reopen-label="copy.reopenLabel"
      :sent-label="copy.sentLabel"
      :start-over-label="copy.startOverLabel"
      :custom-placeholder="copy.customPlaceholder"
      :custom-label="copy.customLabel"
      @submit="onSubmit"
    />

    <p class="text-sm text-[var(--tx-text-color-secondary)]">
      <template v-if="answeredCount">
        {{ copy.answered }}: {{ answeredCount }} / {{ copy.questions.length }}
      </template>
      <template v-else>
        {{ copy.empty }}
      </template>
    </p>

    <ul v-if="submitted.length" class="flex flex-col gap-1 text-sm text-[var(--tx-text-color-secondary)]">
      <li v-for="line in submitted" :key="line">
        {{ line }}
      </li>
    </ul>
  </div>
</template>
