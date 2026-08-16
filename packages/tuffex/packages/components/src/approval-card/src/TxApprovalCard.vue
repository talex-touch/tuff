<script setup lang="ts">
// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
import type { ApprovalAnswer, ApprovalAnswerMap, ApprovalCardEmits, ApprovalCardProps, ApprovalQuestion } from './types'
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'

defineOptions({ name: 'TxApprovalCard' })

const props = withDefaults(defineProps<ApprovalCardProps>(), {
  modelValue: undefined,
  index: undefined,
  sent: undefined,
  open: undefined,
  autoAdvance: true,
  autoAdvanceDelay: 480,
  dismissible: true,
  ariaLabel: 'Approval questions',
  sendLabel: 'Send answers',
  nextQuestionLabel: 'Next question',
  nextLabel: 'Next',
  prevLabel: 'Previous',
  dismissLabel: 'Dismiss',
  reopenLabel: 'Open approval',
  sentLabel: 'Answers sent',
  startOverLabel: 'Start over',
  customPlaceholder: 'Type something…',
  customLabel: 'Custom answer',
  pagerLabelFormatter: (position: number) => `Go to question ${position}`,
})

const emit = defineEmits<ApprovalCardEmits>()

defineSlots<{
  /** Replaces the question prompt. */
  question?: (props: { question: ApprovalQuestion, index: number }) => any
  /** Replaces the submitted confirmation panel. */
  sent?: (props: { answers: ApprovalAnswer[] }) => any
  /** Appended inside the footer bar, before the send control. */
  'footer-extra'?: () => any
}>()

const questionId = useId()

/**
 * Each piece of state is dual-mode: the internal ref is always written, and the
 * prop wins whenever the host supplied one. A remounting host (a streaming
 * transcript re-rendering the row) keeps its page and answers by controlling
 * them; an uncontrolled host gets the upstream behaviour for free.
 */
const internalAnswers = ref<ApprovalAnswerMap>({})
const internalIndex = ref(0)
const internalSent = ref(false)
const internalOpen = ref(true)

const answers = computed(() => props.modelValue ?? internalAnswers.value)
const isSent = computed(() => props.sent ?? internalSent.value)
const isOpen = computed(() => props.open ?? internalOpen.value)

const lastIndex = computed(() => Math.max(0, props.questions.length - 1))
const currentIndex = computed(() => {
  const raw = props.index ?? internalIndex.value
  return Math.min(lastIndex.value, Math.max(0, raw))
})
const question = computed<ApprovalQuestion | undefined>(() => props.questions[currentIndex.value])
const isLast = computed(() => currentIndex.value >= lastIndex.value)

const currentAnswer = computed<ApprovalAnswer | undefined>(() =>
  question.value ? answers.value[question.value.id] : undefined,
)
const selectedValues = computed(() => currentAnswer.value?.values ?? [])
const customText = computed(() => currentAnswer.value?.custom ?? '')
const hasAnswer = computed(() => selectedValues.value.length > 0 || customText.value.trim().length > 0)

const orderedAnswers = computed(() =>
  props.questions.map(item => answers.value[item.id]).filter((item): item is ApprovalAnswer => Boolean(item)),
)

function isAnswered(item: ApprovalQuestion): boolean {
  const answer = answers.value[item.id]
  if (!answer)
    return false
  return answer.values.length > 0 || Boolean(answer.custom?.trim())
}

/* ─── auto-advance ─── */

let advanceTimer: ReturnType<typeof setTimeout> | null = null

function clearAdvance(): void {
  if (advanceTimer !== null) {
    clearTimeout(advanceTimer)
    advanceTimer = null
  }
}

/**
 * Reduced motion suppresses the auto-advance rather than shortening it: the
 * preference stands in for "no unrequested change of context", and a page that
 * moves out from under a screen reader mid-sentence is exactly that. Every
 * question stays reachable through the pager and the send control.
 */
function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function scheduleAdvance(): void {
  if (!props.autoAdvance || prefersReducedMotion())
    return

  clearAdvance()
  advanceTimer = setTimeout(() => {
    advanceTimer = null
    if (isLast.value)
      setSent(true)
    else
      goTo(currentIndex.value + 1)
  }, props.autoAdvanceDelay)
}

onBeforeUnmount(clearAdvance)
watch(currentIndex, clearAdvance)

/* ─── writes ─── */

function setAnswers(next: ApprovalAnswerMap): void {
  internalAnswers.value = next
  emit('update:modelValue', next)
}

function setSent(next: boolean): void {
  if (isSent.value === next)
    return

  internalSent.value = next
  emit('update:sent', next)
  if (next)
    emit('submit', orderedAnswers.value)
}

function setOpen(next: boolean): void {
  if (isOpen.value === next)
    return

  internalOpen.value = next
  emit('update:open', next)
  // Branch rather than computing the event name: `emit` is typed as overloads,
  // and a union of names matches none of them.
  if (next)
    emit('reopen')
  else
    emit('dismiss')
}

function goTo(next: number): void {
  const clamped = Math.min(lastIndex.value, Math.max(0, next))
  if (clamped === currentIndex.value)
    return

  clearAdvance()
  internalIndex.value = clamped
  emit('update:index', clamped)
}

function commit(answer: ApprovalAnswer): void {
  setAnswers({ ...answers.value, [answer.questionId]: answer })
  emit('answer', answer)
}

/* ─── interactions ─── */

function toggleOption(value: string): void {
  const active = question.value
  if (!active || isSent.value)
    return

  const picked = selectedValues.value
  if ((active.type ?? 'radio') === 'radio') {
    // Single choice replaces the selection and clears the free-text answer —
    // the two are alternatives, not additions.
    commit({ questionId: active.id, values: [value], custom: '' })
    scheduleAdvance()
    return
  }

  const values = picked.includes(value) ? picked.filter(item => item !== value) : [...picked, value]
  commit({ questionId: active.id, values, custom: customText.value })
}

function onCustomInput(event: Event): void {
  const active = question.value
  if (!active)
    return

  const custom = (event.target as HTMLInputElement).value
  const isRadio = (active.type ?? 'radio') === 'radio'
  commit({ questionId: active.id, values: isRadio ? [] : selectedValues.value, custom })
}

function submit(): void {
  if (!hasAnswer.value || isSent.value)
    return

  clearAdvance()
  if (isLast.value)
    setSent(true)
  else
    goTo(currentIndex.value + 1)
}

function reset(): void {
  clearAdvance()
  setAnswers({})
  internalIndex.value = 0
  emit('update:index', 0)
  setSent(false)
  setOpen(true)
}

defineExpose({ next: () => goTo(currentIndex.value + 1), prev: () => goTo(currentIndex.value - 1), goTo, submit, reset })
</script>

<template>
  <button
    v-if="!isOpen"
    type="button"
    class="tx-bui-approval-card__reopen"
    @click="setOpen(true)"
  >
    {{ reopenLabel }}
  </button>

  <div v-else class="tx-bui-approval-card" role="group" :aria-label="ariaLabel">
    <div class="tx-bui-approval-card__shell">
      <div v-if="isSent" class="tx-bui-approval-card__sent">
        <slot name="sent" :answers="orderedAnswers">
          <span class="tx-bui-approval-card__sent-mark" aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </span>
          <span class="tx-bui-approval-card__sent-text">{{ sentLabel }}</span>
          <button type="button" class="tx-bui-approval-card__restart" @click="reset">
            {{ startOverLabel }}
          </button>
        </slot>
      </div>

      <div v-else-if="question" :key="currentIndex" class="tx-bui-approval-card__body">
        <div class="tx-bui-approval-card__prompt">
          <span :id="questionId" class="tx-bui-approval-card__question">
            <slot name="question" :question="question" :index="currentIndex">{{ question.question }}</slot>
          </span>
          <button
            v-if="dismissible"
            type="button"
            class="tx-bui-approval-card__dismiss"
            :aria-label="dismissLabel"
            @click="setOpen(false)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="tx-bui-approval-card__options" role="group" :aria-labelledby="questionId">
          <button
            v-for="option in question.options"
            :key="option.value"
            type="button"
            class="tx-bui-approval-card__option"
            :class="{ 'is-selected': selectedValues.includes(option.value) }"
            :aria-pressed="selectedValues.includes(option.value)"
            @click="toggleOption(option.value)"
          >
            <span
              class="tx-bui-approval-card__indicator"
              :class="(question.type ?? 'radio') === 'radio' ? 'is-radio' : 'is-check'"
              aria-hidden="true"
            >
              <span v-if="(question.type ?? 'radio') === 'radio'" class="tx-bui-approval-card__dot" />
              <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </span>
            <span class="tx-bui-approval-card__option-label">{{ option.label }}</span>
          </button>

          <label v-if="question.allowCustom !== false" class="tx-bui-approval-card__custom">
            <span class="tx-bui-approval-card__indicator is-spacer" aria-hidden="true" />
            <input
              class="tx-bui-approval-card__custom-input"
              :value="customText"
              :placeholder="question.customPlaceholder ?? customPlaceholder"
              :aria-label="customLabel"
              @input="onCustomInput"
            >
          </label>
        </div>
      </div>

      <div class="tx-bui-approval-card__footer">
        <span class="tx-bui-approval-card__pager">
          <button
            type="button"
            class="tx-bui-approval-card__nav"
            :aria-label="prevLabel"
            :disabled="currentIndex === 0 || isSent"
            @click="goTo(currentIndex - 1)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>

          <span class="tx-bui-approval-card__dots">
            <button
              v-for="(item, position) in questions"
              :key="item.id"
              type="button"
              class="tx-bui-approval-card__dot-button"
              :class="{
                'is-current': position === currentIndex && !isSent,
                'is-answered': isSent || isAnswered(item),
              }"
              :aria-label="pagerLabelFormatter(position + 1)"
              :aria-current="position === currentIndex && !isSent ? 'step' : undefined"
              :disabled="isSent"
              @click="goTo(position)"
            />
          </span>

          <button
            type="button"
            class="tx-bui-approval-card__nav"
            :aria-label="nextLabel"
            :disabled="isLast || isSent"
            @click="goTo(currentIndex + 1)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </span>

        <span class="tx-bui-approval-card__actions">
          <slot name="footer-extra" />
          <button
            v-if="!isSent"
            type="button"
            class="tx-bui-approval-card__send"
            :aria-label="isLast ? sendLabel : nextQuestionLabel"
            :disabled="!hasAnswer"
            @click="submit"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        </span>
      </div>
    </div>
  </div>
</template>

<style lang="scss">
@use '../../../style/mixins.scss' as *;

@include bui-keyframes-fade-up;
@include bui-keyframes-pop-in;

.tx-bui-approval-card__reopen {
  @include bui-scope;

  padding: 8px 12px;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--tx-bui-ink, #1f2124);
  cursor: pointer;
  background: var(--tx-bui-surface, #fff);
  border-radius: var(--tx-bui-radius-control, 8px);
  box-shadow: var(--tx-bui-shadow-btn, 0 0 0 1px #e0e2e5, 0 1px 2px #1018280d);
  transition: background-color 0.15s ease;

  &:hover {
    background: var(--tx-bui-hover, #f4f5f6);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

.tx-bui-approval-card {
  @include bui-scope;

  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 100%;
  min-height: 196px;
  max-width: 320px;

  .tx-bui-approval-card__shell {
    width: 100%;
    overflow: hidden;
    background: var(--tx-bui-surface, #fff);
    border-radius: var(--tx-bui-radius-card, 10px);
    box-shadow: var(--tx-bui-shadow-card, 0 0 0 1px #ecedef, 0 1px 2px #1018280a, 0 2px 6px #10182808);
  }

  /* ─── submitted ─── */

  .tx-bui-approval-card__sent {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
    justify-content: center;
    height: 148px;
  }

  .tx-bui-approval-card__sent-mark {
    @include bui-pop-in(300ms);

    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    color: #fff;
    background: var(--tx-bui-green, #189a4d);
    border-radius: 999px;
  }

  .tx-bui-approval-card__sent-text {
    @include bui-fade-up(350ms, 100ms);

    font-size: 13px;
    font-weight: 500;
    color: var(--tx-bui-ink, #1f2124);
  }

  .tx-bui-approval-card__restart {
    font-size: 12px;
    font-weight: 500;
    color: var(--tx-bui-accent-ink, #0170dd);
    cursor: pointer;

    &:hover {
      text-decoration: underline;
    }
  }

  /* ─── question ─── */

  .tx-bui-approval-card__body {
    @include bui-card-pad;
    @include bui-fade-up(350ms);
  }

  .tx-bui-approval-card__prompt {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    justify-content: space-between;
  }

  .tx-bui-approval-card__question {
    font-size: 13px;
    font-weight: 500;
    color: var(--tx-bui-ink, #1f2124);
  }

  .tx-bui-approval-card__dismiss {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    color: var(--tx-bui-ink-3, #9a9da3);
    cursor: pointer;
    border-radius: var(--tx-bui-radius-control, 8px);
    transition: background-color 0.1s ease, color 0.1s ease;

    &:hover {
      color: var(--tx-bui-ink, #1f2124);
      background: var(--tx-bui-hover, #f4f5f6);
    }
  }

  .tx-bui-approval-card__options {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: 8px;
  }

  .tx-bui-approval-card__option,
  .tx-bui-approval-card__custom {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-inline: -6px;
    padding: 4px 6px;
    text-align: left;
    border-radius: var(--tx-bui-radius-control, 8px);
    transition: background-color 0.1s ease;
  }

  .tx-bui-approval-card__option {
    cursor: pointer;

    &:hover {
      background: var(--tx-bui-hover, #f4f5f6);
    }
  }

  .tx-bui-approval-card__custom:hover,
  .tx-bui-approval-card__custom:focus-within {
    background: var(--tx-bui-hover, #f4f5f6);
  }

  .tx-bui-approval-card__indicator {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    color: transparent;
    // The unselected ring is an inset shadow rather than a border so the box
    // stays 16px and the glyph does not shift when it fills in.
    box-shadow: inset 0 0 0 1.5px var(--tx-bui-line-strong, #e0e2e5);
    transition: background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease;

    &.is-radio {
      border-radius: 999px;
    }

    &.is-check {
      border-radius: 5px;
    }

    &.is-spacer {
      box-shadow: none;
    }
  }

  .tx-bui-approval-card__dot {
    width: 6px;
    height: 6px;
    background: var(--tx-bui-canvas, #f1f2f3);
    border-radius: 999px;
    transform: scale(0);
    transition: transform 0.2s ease;
  }

  .tx-bui-approval-card__option.is-selected .tx-bui-approval-card__indicator {
    color: var(--tx-bui-canvas, #f1f2f3);
    background: var(--tx-bui-ink, #1f2124);
    box-shadow: none;
  }

  .tx-bui-approval-card__option.is-selected .tx-bui-approval-card__dot {
    transform: scale(1);
  }

  .tx-bui-approval-card__option-label {
    font-size: 13px;
    color: var(--tx-bui-ink-2, #62656b);
    transition: color 0.2s ease;
  }

  .tx-bui-approval-card__option.is-selected .tx-bui-approval-card__option-label {
    color: var(--tx-bui-ink, #1f2124);
  }

  .tx-bui-approval-card__custom-input {
    flex: 1;
    min-width: 0;
    font: inherit;
    font-size: 13px;
    color: var(--tx-bui-ink, #1f2124);
    background: transparent;
    border: 0;
    outline: none;

    &::placeholder {
      color: var(--tx-bui-ink-3, #9a9da3);
    }
  }

  /* ─── footer ─── */

  .tx-bui-approval-card__footer {
    @include bui-card-bar;

    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
  }

  .tx-bui-approval-card__pager,
  .tx-bui-approval-card__actions {
    display: inline-flex;
    gap: 8px;
    align-items: center;
  }

  .tx-bui-approval-card__actions {
    margin-right: -2px;
  }

  .tx-bui-approval-card__nav {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    color: var(--tx-bui-ink-3, #9a9da3);
    cursor: pointer;
    border-radius: 5px;
    transition: background-color 0.1s ease, color 0.1s ease;

    &:disabled {
      cursor: default;
      opacity: 0.35;
    }

    &:not(:disabled):hover {
      color: var(--tx-bui-ink-2, #62656b);
      background: var(--tx-bui-hover, #f4f5f6);
    }
  }

  .tx-bui-approval-card__dots {
    display: inline-flex;
    gap: 4px;
    align-items: center;
  }

  .tx-bui-approval-card__dot-button {
    width: 7px;
    height: 7px;
    cursor: pointer;
    border: 1.5px solid var(--tx-bui-ink-3, #9a9da3);
    border-radius: 999px;
    transition: width 0.3s ease, height 0.3s ease, background-color 0.3s ease, border-color 0.3s ease, border-width 0.3s ease;

    &:disabled {
      cursor: default;
    }

    &.is-answered {
      background: var(--tx-bui-ink-3, #9a9da3);
      border-color: transparent;
    }

    &.is-current {
      width: 9px;
      height: 9px;
      background: transparent;
      border-width: 2.5px;
      border-color: var(--tx-bui-ink, #1f2124);
    }
  }

  .tx-bui-approval-card__send {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    // Disabled is the base state so the enabled ink treatment lives in one
    // place; the `disabled` attribute is exactly `!hasAnswer`.
    color: var(--tx-bui-ink-3, #9a9da3);
    cursor: default;
    background: var(--tx-bui-field, #f2f2f3);
    border-radius: 8px;
    box-shadow: var(--tx-bui-shadow-btn, 0 0 0 1px #e0e2e5, 0 1px 2px #1018280d);
    transition: background-color 0.2s ease, color 0.2s ease, transform 0.2s ease;

    &:not(:disabled) {
      color: var(--tx-bui-surface, #fff);
      cursor: pointer;
      background: var(--tx-bui-ink, #1f2124);
      box-shadow: inset 0 1px 0 rgb(255 255 255 / 14%);
    }

    &:not(:disabled):active {
      transform: scale(0.96);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .tx-bui-approval-card__dismiss,
    .tx-bui-approval-card__option,
    .tx-bui-approval-card__custom,
    .tx-bui-approval-card__indicator,
    .tx-bui-approval-card__dot,
    .tx-bui-approval-card__option-label,
    .tx-bui-approval-card__nav,
    .tx-bui-approval-card__dot-button,
    .tx-bui-approval-card__send {
      transition: none;
    }

    .tx-bui-approval-card__send:not(:disabled):active {
      transform: none;
    }
  }
}
</style>
