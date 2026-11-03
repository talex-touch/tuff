<script setup lang="ts">
import DOMPurify from 'dompurify'
import { Marked } from 'marked'
import { computed, ref, watch } from 'vue'
import { completeInlineMarkup } from '../../stream-markdown/src/complete-inline-markup'
import { usePacedText } from './use-paced-text'

defineOptions({ name: 'TxThinkingBody' })

const props = withDefaults(
  defineProps<{
    /** Everything the step has received so far. */
    text: string
    /** The step is still receiving text; a settled step shows in full. */
    streaming?: boolean
  }>(),
  { streaming: false },
)

// Per-component parser, mirroring TxStreamMarkdown's reasoning: a shared mutable `marked`
// singleton would leak configuration across consumers.
const thinkingMarked = new Marked({ gfm: true, breaks: true })

const paced = usePacedText({
  text: () => props.text,
  streaming: () => props.streaming,
})
// Once the thinking step settles (props.streaming turns false), immediately flush
// any remaining buffered units to show the complete text in full, preventing
// thinking from slowly draining while subsequent prose or tool execution begins.
watch(
  () => props.streaming,
  (streaming) => {
    if (!streaming) {
      paced.skip()
    }
  },
  { immediate: true },
)


/**
 * Reasoning is markdown (models head their thoughts with bold runs) and model output, so it is
 * sanitized like any other. While it is still being released the text ends mid-construct (`**bo`),
 * so the open markup is closed for the parser - the text never changes, only its styling arrives a
 * moment early - and a settled body says exactly what it says.
 */
const html = computed(() => {
  const source = paced.pending.value || props.streaming ? completeInlineMarkup(paced.shown.value) : paced.shown.value
  // `async: false` guarantees a string; marked's overloads just don't narrow.
  return DOMPurify.sanitize(thinkingMarked.parse(source, { async: false }) as string)
})

// The body follows its own tail while text is released, and lets go the moment the reader scrolls
// up to read: whether to follow is decided against the layout *before* the new text lands.
const root = ref<HTMLElement | null>(null)
const FOLLOW_SLOP_PX = 24
let following = true

function scroller(): HTMLElement | null {
  return root.value?.closest<HTMLElement>('.tx-chain-of-thought__body') ?? null
}

watch(
  () => paced.shown.value,
  () => {
    const el = scroller()
    following = !el || el.scrollHeight - el.scrollTop - el.clientHeight <= FOLLOW_SLOP_PX
  },
  { flush: 'pre' },
)

watch(
  () => paced.shown.value,
  () => {
    const el = scroller()
    if (el && following)
      el.scrollTop = el.scrollHeight
  },
  { flush: 'post' },
)
</script>

<template>
  <div ref="root" class="tx-chain-of-thought__md" v-html="html" />
</template>
