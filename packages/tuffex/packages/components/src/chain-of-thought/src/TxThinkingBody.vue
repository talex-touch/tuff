<script setup lang="ts">
import type { Token, TokensList } from 'marked'
import DOMPurify from 'dompurify'
import { Marked } from 'marked'
import { computed, ref, watch } from 'vue'
import { hasWindow } from '../../../../utils/env'
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

interface ThinkingBlockEntry {
  id: number
  raw: string
  html: string | null
}

function fingerprintLinks(links: TokensList['links']): string {
  const keys = Object.keys(links)
  if (keys.length === 0)
    return ''
  keys.sort()
  return JSON.stringify(keys.map(key => [key, links[key]?.href ?? '', links[key]?.title ?? '']))
}

function renderThinkingToken(token: Token, links: TokensList['links']): string | null {
  if (token.type === 'space')
    return null
  if (!hasWindow() || typeof DOMPurify?.sanitize !== 'function')
    return ''
  const list = Object.assign([token], { links }) as TokensList
  return DOMPurify.sanitize(thinkingMarked.parser(list))
}

let cachedEntries: ThinkingBlockEntry[] = []
let cachedLinksSalt = ''
let blockSeq = 0

/**
 * Reasoning is markdown (models head their thoughts with bold runs) and model output, so it is
 * sanitized like any other. While it is still being released the text ends mid-construct (`**bo`),
 * so the open markup is closed for the parser - the text never changes, only its styling arrives a
 * moment early - and a settled body says exactly what it says.
 *
 * Rendered incrementally by top-level markdown token so settled paragraphs keep their DOM nodes
 * and sanitized HTML instead of re-parsing, re-sanitizing, and tearing down the whole reasoning
 * block on every paced animation frame.
 */
const blocks = computed(() => {
  const source = paced.pending.value || props.streaming ? completeInlineMarkup(paced.shown.value) : paced.shown.value
  if (!source) {
    cachedEntries = []
    cachedLinksSalt = ''
    return [] as Array<{ id: number, html: string }>
  }

  const tokens = thinkingMarked.lexer(source)
  const salt = fingerprintLinks(tokens.links)
  const saltChanged = salt !== cachedLinksSalt
  cachedLinksSalt = salt

  const next: ThinkingBlockEntry[] = []
  let mismatched = false

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!
    const prev = cachedEntries[index]
    if (!mismatched && prev && prev.raw === token.raw) {
      next.push(
        saltChanged
          ? { id: prev.id, raw: prev.raw, html: renderThinkingToken(token, tokens.links) }
          : prev,
      )
      continue
    }
    const id = !mismatched && prev ? prev.id : ++blockSeq
    mismatched = true
    next.push({ id, raw: token.raw, html: renderThinkingToken(token, tokens.links) })
  }

  cachedEntries = next
  const rendered: Array<{ id: number, html: string }> = []
  for (const entry of next) {
    if (entry.html)
      rendered.push({ id: entry.id, html: entry.html })
  }
  return rendered
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
    if (el && following && el.scrollHeight > el.clientHeight)
      el.scrollTop = el.scrollHeight
  },
  { flush: 'post' },
)
</script>

<template>
  <div ref="root" class="tx-chain-of-thought__md">
    <div
      v-for="block in blocks"
      :key="block.id"
      class="tx-chain-of-thought__block"
      v-html="block.html"
    />
  </div>
</template>
