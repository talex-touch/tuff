<script setup lang="ts">
import type { FunctionalComponent, VNode, VNodeArrayChildren } from 'vue'
import type { AiSourceItem } from '../../ai-elements/src/types'
import type { StreamInline, StreamState } from '../../stream-text/src/types'
import type { PlanCache, PlanNode } from './plan'
import type { StreamElementEmits, StreamElementProps, StreamPart } from './types'
import { computed, h, nextTick, onMounted, shallowRef, toRaw, watch } from 'vue'
import TxCodeStream from '../../code-stream/src/TxCodeStream.vue'
import { useReducedMotion } from '../../../../utils/use-reduced-motion'
import TxStreamMarkdown from '../../stream-markdown/src/TxStreamMarkdown.vue'
import { sliceStreamContent } from '../../stream-text/src/model'
import { streamRevealDuration } from '../../stream-text/src/presets'
import TxStreamCaret from '../../stream-text/src/TxStreamCaret.vue'
import TxStreamText from '../../stream-text/src/TxStreamText.vue'
import { useSlotVersion } from '../../stream-text/src/use-slot-version'
import { useStreamPacer } from '../../stream-text/src/use-stream-pacer'
import { parseStreamMarkdown } from './parse'
import { planParts } from './plan'

defineOptions({ name: 'TxStreamElement' })

const props = withDefaults(defineProps<StreamElementProps>(), {
  content: '',
  streaming: false,
  reveal: 'aurora',
  caret: true,
  reserve: false,
  locale: 'zh',
})

const emit = defineEmits<StreamElementEmits>()

type CodePart = Extract<StreamPart, { type: 'code' }>
type CustomPart = Extract<StreamPart, { type: 'custom' }>

const slots = defineSlots<{
  /** Replaces the stream caret; rendered at the write head while the stream is live. */
  caret?: (props: { state: StreamState }) => any
  /** Replaces a citation chip. */
  citation?: (props: { source: AiSourceItem, label?: string, index?: number }) => any
  /** Renders a custom inline inside text. */
  inline?: (props: { name: string, props?: Record<string, unknown> }) => any
  /** Replaces a code block; `code` is what has been revealed so far. */
  code?: (props: { part: CodePart, code: string, streaming: boolean }) => any
  /** Below the answer; `done` once the last word is shown and the source has finished. */
  footer?: (props: { state: StreamState, done: boolean }) => any
  /** Renders `{ type: 'custom', name }` parts. */
  [name: `part-${string}`]: ((props: { part: CustomPart, state: StreamState }) => any) | undefined
}>()

const parts = computed<readonly StreamPart[]>(() =>
  props.parts ?? parseStreamMarkdown(props.content ?? '', { streaming: props.streaming, sources: props.sources }),
)

// Unchanged text parts keep their model and content object across parses, so
// a new token re-renders only the part it lands in.
let planCache: PlanCache | undefined
const plan = computed(() => {
  const result = planParts(parts.value, props.locale, planCache)
  planCache = result.cache
  return result
})

const reduced = useReducedMotion()
const preset = computed(() => (reduced.value ? 'none' : props.reveal))
const revealDuration = computed(() => streamRevealDuration(preset.value))

// The one clock: every part reveals a prefix of itself as the element's count
// passes over it, so parts come in strictly in order at one steady cadence.
const pacer = useStreamPacer({
  total: () => plan.value.total,
  streaming: () => props.streaming,
  wordMs: () => props.wordMs,
  maxLagMs: () => props.maxLagMs,
  drainMs: () => props.drainMs,
  pauseMs: () => props.pauseMs,
  paced: () => !reduced.value,
  onState: (state) => {
    emit('state-change', state)
    if (state === 'done')
      emit('done')
  },
})

const state = computed(() => pacer.state.value)
const live = computed(() => state.value === 'streaming' || state.value === 'paused' || state.value === 'draining')
// The reserve copy exists only while complete content plays back.
const reserving = computed(() => props.reserve && !props.streaming && pacer.revealed.value < plan.value.total)
const rootStyle = computed(() => ({ '--tx-stream-reveal-duration': `${revealDuration.value}ms` }))

// replay() and skip() remount the parts: a replay starts every stream from
// empty, and a skip mounts them complete, without entrances.
const generation = shallowRef(0)
// A part that mounts mid-answer arrives with the words already due and plays
// their entrance too (`appear`). What is there when the element itself mounts,
// or renders on a server, and what a skip mounts, shows as it is.
let appearing = false
onMounted(() => {
  appearing = true
})

// The copy renders its delegated parts (tables, math) a frame or two late, so
// a replay also holds the height the complete answer has now until it is done.
const liveRef = shallowRef<HTMLElement | null>(null)
const heldHeight = shallowRef(0)
const liveStyle = computed(() => (heldHeight.value > 0 ? { minHeight: `${heldHeight.value}px` } : undefined))
watch(reserving, (now) => {
  if (!now)
    heldHeight.value = 0
})

function replay(): void {
  const height = props.reserve && !props.streaming ? liveRef.value?.getBoundingClientRect().height ?? 0 : 0
  generation.value++
  pacer.replay()
  heldHeight.value = reserving.value ? height : 0
}

function skip(): void {
  generation.value++
  appearing = false
  pacer.skip()
  void nextTick(() => {
    appearing = true
  })
}

const EMPTY: StreamInline[] = []
let lastSlice: { key: string, count: number, content: StreamInline[] } | null = null

/** A text part's first `count` units; the same array while nothing changes. */
function textPrefix(node: Extract<PlanNode, { kind: 'text' }>, count: number): StreamInline[] {
  if (count >= node.units)
    return node.full
  if (count <= 0)
    return EMPTY
  if (lastSlice?.key === node.key && lastSlice.count === count && lastSlice.content.length > 0)
    return lastSlice.content
  const content = sliceStreamContent(node.model, count)
  lastSlice = { key: node.key, count, content }
  return content
}

/** A slots object as `h()` takes it; `$stable` spares the child a forced update. */
type PartSlots = Record<string, unknown> & { $stable?: boolean }

interface ForwardedSlots {
  text: PartSlots
  code: PartSlots | undefined
}

interface RenderContext {
  /** Units revealed on the clock. */
  revealed: number
  live: boolean
  /** The reserve copy: complete, invisible, without entrances or caret. */
  still: boolean
  keyPrefix: string
  slots: ForwardedSlots
}

const slotVersion = useSlotVersion(slots)

const forwardedCache: Record<'live' | 'still', (ForwardedSlots & { version: number }) | undefined> = { live: undefined, still: undefined }

/**
 * The host's slots, forwarded to the parts. A hand-written render function
 * updates every child it passes a slots object to, unless the object is marked
 * `$stable`; so each layer keeps one set across renders, and the forwarders look
 * the host's slot up when called. When the host's slots change the set is
 * rebuilt, and that one render passes it unmarked, so every part takes it.
 */
function forwardedSlots(layer: 'live' | 'still', version: number): ForwardedSlots {
  const cached = forwardedCache[layer]
  if (cached?.version === version)
    return cached
  const text: PartSlots = {}
  if (slots.caret)
    text.caret = (scope: any) => slots.caret?.(scope)
  if (slots.citation)
    text.citation = (scope: any) => slots.citation?.(scope)
  if (slots.inline)
    text.inline = (scope: any) => slots.inline?.(scope)
  const code: PartSlots | undefined = slots.caret ? { caret: (scope: any) => slots.caret?.(scope) } : undefined
  forwardedCache[layer] = { version, text: { ...text, $stable: true }, code: code && { ...code, $stable: true } }
  return { text, code }
}

function renderLeaf(node: Exclude<PlanNode, { kind: 'list' | 'quote' }>, ctx: RenderContext): VNode | null {
  const count = Math.min(Math.max(0, ctx.revealed - node.start), node.units)
  // The part holding the last revealed unit is the write head: only it streams
  // and shows the caret.
  const last = count > 0 && ctx.revealed <= node.start + node.units
  const head = ctx.live && last
  const reveal = ctx.still ? 'none' : props.reveal
  // Every other part has its caret switched off, which removes it at once, so
  // the write head moving on never leaves one behind. Once the answer is done
  // the last part keeps it switched on, so that caret retracts as a stream's end.
  const caret = props.caret && !ctx.still && last
  const key = `${ctx.keyPrefix}${node.key}`

  switch (node.kind) {
    case 'text': {
      const tag = node.part.type === 'heading' ? `h${node.part.depth}` : node.part.tight ? 'div' : 'p'
      return h(tag, { key, class: ['tx-stream-element__text', node.part.type === 'paragraph' && node.part.tight && 'is-tight'] }, [
        h(TxStreamText, {
          content: textPrefix(node, count),
          paced: false,
          appear: !ctx.still && appearing && !reduced.value,
          streaming: head,
          reveal,
          caret,
          locale: props.locale,
          onCite: (source: AiSourceItem) => emit('cite', source),
        }, ctx.slots.text),
      ])
    }
    case 'code': {
      const code = count >= node.units ? node.part.code : node.part.code.slice(0, node.ends[count - 1] ?? 0)
      if (slots.code)
        return h('div', { key, class: 'tx-stream-element__code' }, slots.code({ part: node.part, code, streaming: head }))
      return h(TxCodeStream, {
        key,
        class: 'tx-stream-element__code',
        code,
        streaming: head,
        paced: false,
        appear: !ctx.still && appearing && !reduced.value,
        reveal,
        caret,
        lang: node.part.lang,
        langLabel: node.part.lang,
        filename: node.part.filename,
      }, ctx.slots.code)
    }
    case 'markdown': {
      const content = count >= node.units ? node.part.raw : node.part.raw.slice(0, node.ends[count - 1] ?? 0)
      return h(TxStreamMarkdown, {
        key,
        class: 'tx-stream-element__markdown',
        ...props.markdownProps,
        content,
        streaming: head,
        reveal,
        caret,
      })
    }
    case 'atom': {
      if (count < 1)
        return null
      if (node.part.type === 'rule')
        return h('hr', { key, class: ['tx-stream-element__rule', !ctx.still && 'tx-stream-element__block'] })
      const part = node.part
      const slot = slots[`part-${part.name}`]
      // Raw: a renderers object kept in reactive state would hand h() a proxy.
      const renderer = toRaw(props.renderers?.[part.name])
      const content = slot
        ? slot({ part, state: state.value })
        : renderer ? [h(renderer, part.props ?? {})] : []
      return h('div', { key, class: ['tx-stream-element__custom', !ctx.still && 'tx-stream-element__block'] }, content)
    }
  }
}

function renderNode(node: PlanNode, ctx: RenderContext): VNode | null {
  const key = `${ctx.keyPrefix}${node.key}`
  if (node.kind === 'quote')
    return h('blockquote', { key, class: 'tx-stream-element__quote' }, renderNodes(node.children, ctx))
  if (node.kind === 'list') {
    const items: VNode[] = []
    for (const item of node.items) {
      if (item.start >= ctx.revealed && item.units > 0)
        break
      items.push(h('li', { key: `${ctx.keyPrefix}${item.key}`, class: item.checked !== undefined && 'is-task' }, [
        item.checked !== undefined
          ? h('input', { class: 'tx-stream-element__task', type: 'checkbox', checked: item.checked, disabled: true, tabindex: -1 })
          : null,
        ...renderNodes(item.children, ctx),
      ]))
    }
    return h(node.part.ordered ? 'ol' : 'ul', {
      key,
      class: 'tx-stream-element__list',
      start: node.part.ordered && node.part.start !== undefined && node.part.start !== 1 ? node.part.start : undefined,
    }, items)
  }
  return renderLeaf(node, ctx)
}

/** Parts up to the write head: each mounts with its first word, which enters (`appear`). */
function renderNodes(nodes: readonly PlanNode[], ctx: RenderContext): VNodeArrayChildren {
  const out: VNodeArrayChildren = []
  for (const node of nodes) {
    if (node.start >= ctx.revealed && node.units > 0)
      break
    out.push(renderNode(node, ctx))
  }
  return out
}

const StreamElementBody: FunctionalComponent<{ still: boolean, slotVersion: number }> = ({ still, slotVersion: version }) => {
  const ctx: RenderContext = still
    ? { revealed: plan.value.total, live: false, still: true, keyPrefix: 'r:', slots: forwardedSlots('still', version) }
    : { revealed: pacer.revealed.value, live: live.value, still: false, keyPrefix: `${generation.value}:`, slots: forwardedSlots('live', version) }
  const out = renderNodes(plan.value.nodes, ctx)
  // Live before the first word: the caret waits on an empty line.
  if (!still && live.value && pacer.revealed.value === 0 && props.caret) {
    out.push(h('p', { key: 'lead', class: 'tx-stream-element__lead' }, [
      h('span', { class: 'tx-stream-element__caret', 'aria-hidden': 'true' }, slots.caret ? slots.caret({ state: state.value }) : [h(TxStreamCaret, { state: state.value })]),
    ]))
  }
  return out
}
StreamElementBody.props = ['still', 'slotVersion']

defineExpose({
  /** Where the stream is. */
  state,
  /** Plays the whole answer again from the first word. */
  replay,
  /** Shows everything now, without entrances. */
  skip,
})
</script>

<template>
  <div
    class="tx-stream-element"
    :class="[`is-reveal-${preset}`, { 'is-reserving': reserving }]"
    :style="rootStyle"
    :aria-busy="live ? 'true' : undefined"
  >
    <div v-if="reserving" class="tx-stream-element__reserve" aria-hidden="true" inert>
      <StreamElementBody :still="true" :slot-version="slotVersion" />
    </div>
    <div ref="liveRef" class="tx-stream-element__live" :style="liveStyle">
      <StreamElementBody :still="false" :slot-version="slotVersion" />
    </div>
    <slot name="footer" :state="state" :done="state === 'done'" />
  </div>
</template>

<style lang="scss">
@use '../../../style/mixins.scss' as *;

@include stream-reveal-keyframes(block);

.tx-stream-element {
  color: var(--tx-text-color-primary, #303133);
  font-size: 14px;
  line-height: 1.7;

  // The final layout, held by an invisible copy in the same grid cell, so a
  // playback never moves what sits around the answer.
  &.is-reserving {
    display: grid;
  }

  p,
  .tx-stream-element__lead {
    margin: 0 0 0.85em;
  }

  .is-tight {
    margin: 0;
  }

  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    margin: 1.2em 0 0.5em;
    font-weight: 600;
    line-height: 1.35;
  }

  h1 {
    font-size: 1.5em;
  }

  h2 {
    font-size: 1.3em;
  }

  h3 {
    font-size: 1.15em;
  }

  h4,
  h5,
  h6 {
    font-size: 1em;
  }

  // Declared outright: an app-wide preflight that strips list markers must not
  // turn an answer's lists into paragraphs.
  ul,
  ol {
    margin: 0 0 0.85em;
    padding-left: 1.5em;
  }

  ul {
    list-style: disc;
  }

  ol {
    list-style: decimal;
  }

  li {
    margin: 0.2em 0;

    > ul,
    > ol {
      margin: 0.2em 0 0;
    }

    &.is-task {
      position: relative;
      list-style: none;
    }
  }

  // In the marker's place, centred on the item's first line. The item's text is
  // a block of its own, so an inline box would sit on a line by itself; the
  // inherited font makes `em` and `lh` measure that text, not the control font.
  .tx-stream-element__task {
    position: absolute;
    top: calc(0.5lh - 0.5em);
    left: -1.4em;
    width: 1em;
    height: 1em;
    margin: 0;
    font: inherit;
  }

  .tx-stream-element__quote {
    margin: 0 0 0.85em;
    padding-left: 0.9em;
    border-left: 3px solid var(--tx-border-color, #dcdfe6);
    color: var(--tx-text-color-regular, #606266);
  }

  .tx-stream-element__rule {
    margin: 1.2em 0;
    border: 0;
    border-top: 1px solid var(--tx-border-color-light, #e4e7ed);
  }

  .tx-stream-element__code,
  .tx-stream-element__markdown,
  .tx-stream-element__custom {
    margin: 0 0 0.85em;
  }

  // The answer's box is its parts, margins trimmed at both ends, so the copy
  // that holds a replay and the answer it holds for measure the same.
  .tx-stream-element__live,
  .tx-stream-element__reserve {
    > :first-child {
      margin-top: 0;
    }

    > :last-child {
      margin-bottom: 0;
    }
  }

  // Zero inline size: the waiting caret overhangs the empty first line.
  .tx-stream-element__caret {
    position: relative;
    display: inline-block;
    width: 0;
    height: 1em;
    vertical-align: -0.14em;

    > * {
      position: absolute;
      top: 0;
      left: 0.22em;
    }
  }

  @media (prefers-reduced-motion: no-preference) {
    // A rule or a custom part has no words to reveal: it enters as a block.
    &:not(.is-reveal-none) .tx-stream-element__block {
      animation: tx-stream-fade-blur var(--tx-stream-reveal-duration, 460ms) cubic-bezier(0.22, 0.61, 0.25, 1) both;
    }
  }
}

.tx-stream-element.is-reserving > .tx-stream-element__reserve,
.tx-stream-element.is-reserving > .tx-stream-element__live {
  grid-area: 1 / 1;
}

.tx-stream-element__reserve {
  visibility: hidden;
}
</style>
