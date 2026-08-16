<script setup lang="ts">
import type { SelectionPayload } from '@talex-touch/tuffex/selection-actions'
import { useSelectionAnchor } from '@talex-touch/tuffex/selection-actions'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const { locale } = useI18n()

const copy = computed(() => {
  if (locale.value === 'zh') {
    return {
      lead: '开心果整个周末都排在第一位。',
      picked: '周六一早就先搅它，这批料在下午高峰前才有时间凝固。',
      rewrite: '周六一早先搅开心果，这批料在下午高峰前能完全凝固。',
      hint: '选中上面第二句，工具条会浮现在选区下方。',
      placeholder: '描述修改',
      keepLabel: '保留',
      discardLabel: '放弃',
      retryLabel: '再试一次',
      actions: [
        { id: 'explain', label: '解释', busyLabel: '解释中' },
        { id: 'improve', label: '润色', busyLabel: '润色中' },
        { id: 'shorten', label: '精简', more: true, busyLabel: '精简中' },
        { id: 'tone', label: '语气', more: true, busyLabel: '调整语气中' },
        { id: 'grammar', label: '语法', more: true, busyLabel: '修正语法中' },
      ],
    }
  }

  return {
    lead: 'Pistachio holds the top slot all weekend.',
    picked: 'Churn it first thing Saturday so the batch has time to firm up before the afternoon rush.',
    rewrite: 'Churn pistachio first thing Saturday so the batch has time to fully firm before the afternoon rush.',
    hint: 'Select the second sentence above — the bar appears beneath the selection.',
    placeholder: 'Describe edits',
    keepLabel: 'Keep',
    discardLabel: 'Discard',
    retryLabel: 'Try again',
    actions: [
      { id: 'explain', label: 'Explain', busyLabel: 'Explaining' },
      { id: 'improve', label: 'Improve', busyLabel: 'Improving' },
      { id: 'shorten', label: 'Shorten', more: true, busyLabel: 'Shortening' },
      { id: 'tone', label: 'Tone', more: true, busyLabel: 'Changing tone' },
      { id: 'grammar', label: 'Grammar', more: true, busyLabel: 'Fixing grammar' },
    ],
  }
})

const articleRef = ref<HTMLElement | null>(null)
const targetRef = ref<HTMLElement | null>(null)
const barRef = ref<{ updatePosition: () => void } | null>(null)

const state = ref<'idle' | 'thinking' | 'streaming' | 'result'>('idle')
const activeActionId = ref<string | undefined>()
const shownText = ref('')
const pinned = ref<SelectionPayload | null>(null)

watch(copy, () => { shownText.value = copy.value.picked }, { immediate: true })

// The bar's own text field takes focus, which collapses the live selection —
// listing the bar here keeps that from reading as "the reader deselected".
const { selection, clear } = useSelectionAnchor({
  root: articleRef,
  ignore: () => [document.querySelector('.tx-bui-selection-actions')],
})

// While a rewrite runs the live selection is gone, so the host supplies the
// payload: same text, but rects re-measured from the element that is reflowing.
const payload = computed(() => (state.value === 'idle' ? selection.value : pinned.value))

function measure(): DOMRect[] {
  return targetRef.value ? Array.from(targetRef.value.getClientRects()) : []
}

let timer: ReturnType<typeof setTimeout> | undefined

function stop() {
  if (timer) {
    clearTimeout(timer)
    timer = undefined
  }
}

function stream(index: number) {
  const full = copy.value.rewrite
  shownText.value = full.slice(0, index)

  // Every delta reflows the paragraph. A virtual reference has nothing to
  // observe, so the host has to say "re-measure" — this is the contract.
  pinned.value = pinned.value ? { ...pinned.value, rects: measure() } : pinned.value
  barRef.value?.updatePosition()

  if (index >= full.length) {
    state.value = 'result'
    return
  }

  timer = setTimeout(() => stream(index + 2), 24)
}

function run(id: string) {
  stop()
  activeActionId.value = id
  pinned.value = { text: shownText.value, rects: measure() }
  state.value = 'thinking'

  timer = setTimeout(() => {
    state.value = 'streaming'
    stream(0)
  }, 700)
}

function reset(keep: boolean) {
  stop()
  if (!keep)
    shownText.value = copy.value.picked

  state.value = 'idle'
  activeActionId.value = undefined
  pinned.value = null
  clear()
}

onBeforeUnmount(stop)
</script>

<template>
  <div class="flex flex-col gap-3">
    <div ref="articleRef" class="max-w-[460px]">
      <p class="text-[13px] leading-relaxed text-[var(--tx-text-color-primary)]">
        {{ copy.lead }}
        <span ref="targetRef" class="rounded-[3px] bg-[color-mix(in_srgb,var(--tx-bui-accent)_14%,transparent)]">{{ shownText }}</span>
      </p>
    </div>

    <p class="text-sm text-[var(--tx-text-color-secondary)]">
      {{ copy.hint }}
    </p>

    <TxSelectionActions
      ref="barRef"
      :selection="payload"
      :state="state"
      :actions="copy.actions"
      :active-action-id="activeActionId"
      :placeholder="copy.placeholder"
      :keep-label="copy.keepLabel"
      :discard-label="copy.discardLabel"
      :retry-label="copy.retryLabel"
      @action="run($event.id)"
      @submit="run('improve')"
      @retry="run(activeActionId ?? 'improve')"
      @keep="reset(true)"
      @discard="reset(false)"
    />
  </div>
</template>
