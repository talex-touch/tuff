<script setup lang="ts">
import type { FunctionalComponent, VNode, VNodeArrayChildren } from 'vue'
import type { AiSourceItem } from '../../ai-elements/src/types'
import type { StreamAtom as Atom, StreamRun as Run, StreamUnit as Unit } from './model'
import type { StreamState, StreamTextEmits, StreamTextProps } from './types'
import { computed, createTextVNode, h, onBeforeUnmount, ref, watch } from 'vue'
import TxInlineCitation from '../../inline-citation/src/TxInlineCitation.vue'
import { useReducedMotion } from '../../../../utils/use-reduced-motion'
import { buildStreamModel } from './model'
import { streamRevealDuration } from './presets'
import TxStreamCaret from './TxStreamCaret.vue'
import { useSlotVersion } from './use-slot-version'
import { useStreamPacer } from './use-stream-pacer'

defineOptions({ name: 'TxStreamText' })

const props = withDefaults(defineProps<StreamTextProps>(), {
  streaming: false,
  reveal: 'aurora',
  caret: true,
  reserve: false,
  paced: true,
  appear: false,
  tag: 'span',
  locale: 'zh',
})

const emit = defineEmits<StreamTextEmits>()

const slots = defineSlots<{
  /** Replaces the Tuff caret; rendered while the stream is live. */
  caret?: (props: { state: StreamState }) => any
  /** Replaces the citation chip. */
  citation?: (props: { source: AiSourceItem, label?: string, index?: number }) => any
  /** Renders `{ type: 'custom' }` inline runs. */
  inline?: (props: { name: string, props?: Record<string, unknown> }) => any
}>()

interface WordView {
  key: string
  text: string
  ws: string
}

type Group =
  | { kind: 'run', key: string, run: Run, settled: string, fresh: WordView[] }
  | { kind: 'atom', key: string, atom: Atom, ws: string, fresh: boolean }

/** A word that ends on punctuation is finished, whatever follows it. */
const CLOSED_WORD = /\p{P}$/u
/** How long the source must be quiet before a held-back last word shows anyway. */
const TAIL_GRACE_MS = 200

function runKey(run: Run | undefined): string {
  return run ? `${run.marks.join('+')}|${run.href ?? ''}` : ''
}

// Words, citations and custom inlines in release order (`model.ts`, shared with
// TxStreamElement, which slices the same units to pace several streams at once).
const model = computed(() => buildStreamModel(props.content, props.locale))

// While the source is live, the last word may still be growing (a token often
// ends mid-word), so it waits for whitespace, its own closing punctuation, or a
// quiet source: Chinese has no spaces, and a model can stop mid-sentence for a
// tool call. If it grows after showing, it keeps its place (see the rewrite
// watcher below).
const quietTail = ref(false)
let tailTimer: ReturnType<typeof setTimeout> | undefined

const available = computed(() => {
  const { units } = model.value
  const last = units[units.length - 1]
  if (!props.streaming || !last || quietTail.value)
    return units.length
  const open = last.kind === 'word' && !last.ws && !CLOSED_WORD.test(last.text)
  return open ? units.length - 1 : units.length
})

watch(() => [props.content, props.streaming] as const, () => {
  quietTail.value = false
  clearTimeout(tailTimer)
  if (props.streaming && typeof window !== 'undefined') {
    tailTimer = setTimeout(() => {
      quietTail.value = true
    }, TAIL_GRACE_MS)
  }
}, { immediate: true })

onBeforeUnmount(() => clearTimeout(tailTimer))

const reduced = useReducedMotion()
const preset = computed(() => (reduced.value ? 'none' : props.reveal))
const duration = computed(() => streamRevealDuration(preset.value))

const pacer = useStreamPacer({
  total: () => available.value,
  streaming: () => props.streaming,
  wordMs: () => props.wordMs,
  maxLagMs: () => props.maxLagMs,
  drainMs: () => props.drainMs,
  pauseMs: () => props.pauseMs,
  settleMs: () => duration.value,
  paced: () => props.paced && !reduced.value,
  appear: props.appear,
  onState: (state) => {
    emit('state-change', state)
    if (state === 'done')
      emit('done')
  },
})

function sameUnit(a: Unit, b: Unit, runsA: Run[], runsB: Run[]): boolean {
  return a.kind === b.kind && a.text === b.text && a.ws === b.ws
    && runKey(runsA[a.run]) === runKey(runsB[b.run])
}

// A rewrite (an emphasis closing, a stream restarting) re-releases only what
// changed; a word that merely grew keeps its place and its entrance.
watch(model, (next, previous) => {
  if (!previous)
    return
  const limit = Math.min(previous.units.length, next.units.length)
  let keep = 0
  while (keep < limit && sameUnit(previous.units[keep]!, next.units[keep]!, previous.runs, next.runs))
    keep++
  const before = previous.units[keep]
  const after = next.units[keep]
  if (before && after && before.kind === 'word' && after.kind === 'word' && !before.ws
    && after.text.startsWith(before.text) && runKey(previous.runs[before.run]) === runKey(next.runs[after.run])) {
    keep++
  }
  if (keep < pacer.revealed.value)
    pacer.rewind(keep)
}, { flush: 'sync' })

function buildGroups(revealed: number, settled: number): Group[] {
  const { runs, units } = model.value
  const groups: Group[] = []
  let current: Extract<Group, { kind: 'run' }> | null = null
  let currentRun = -1
  for (let index = 0; index < revealed && index < units.length; index++) {
    const unit = units[index]!
    if (unit.kind === 'atom') {
      groups.push({ kind: 'atom', key: `a${index}`, atom: unit.atom!, ws: unit.ws, fresh: index >= settled })
      current = null
      continue
    }
    if (!current || currentRun !== unit.run) {
      current = { kind: 'run', key: `r${unit.run}`, run: runs[unit.run]!, settled: '', fresh: [] }
      currentRun = unit.run
      groups.push(current)
    }
    if (index < settled)
      current.settled += unit.text + unit.ws
    else
      current.fresh.push({ key: `w${index}`, text: unit.text, ws: unit.ws })
  }
  return groups
}

const liveGroups = computed(() => buildGroups(pacer.revealed.value, pacer.settled.value))
const fullGroups = computed(() => buildGroups(model.value.units.length, model.value.units.length))

function renderAtom(group: Extract<Group, { kind: 'atom' }>): VNode {
  const { atom } = group
  let content: VNodeArrayChildren
  if (atom.type === 'citation') {
    content = slots.citation
      ? slots.citation({ source: atom.source, label: atom.label, index: atom.index })
      : [h(TxInlineCitation, {
          source: atom.source,
          label: atom.label,
          // The stream's own entrance plays on the chip; its pop-in would double it.
          appear: false,
          onOpen: (source: AiSourceItem) => emit('cite', source),
        })]
  }
  else {
    content = slots.inline?.({ name: atom.name, props: atom.props }) ?? []
  }
  return h('span', { key: group.key, class: ['tx-stream-text__atom', group.fresh && 'tx-stream-text__word'] }, content)
}

function renderRun(group: Extract<Group, { kind: 'run' }>): VNode {
  // The space after the run's last word (the next run's leading space, which
  // that word carries) sits outside the run's marks, so a code pill or a link
  // ends at the word, as rendered Markdown does.
  const last = group.fresh[group.fresh.length - 1]
  const settled = last ? group.settled : group.settled.trimEnd()
  const trailing = last ? last.ws : group.settled.slice(settled.length)
  // Settled words are one text node; only words still entering are elements, so
  // each release patches a handful of nodes however long the text has grown.
  let children: VNodeArrayChildren = settled ? [createTextVNode(settled)] : []
  for (const word of group.fresh) {
    children.push(h('span', { key: word.key, class: 'tx-stream-text__word' }, word.text))
    if (word.ws && word !== last)
      children.push(createTextVNode(word.ws))
  }
  const { marks, href } = group.run
  if (marks.includes('code'))
    children = [h('code', { class: 'tx-stream-text__code' }, children)]
  if (marks.includes('del'))
    children = [h('del', children)]
  if (marks.includes('em'))
    children = [h('em', children)]
  if (marks.includes('strong'))
    children = [h('strong', children)]
  if (href)
    children = [h('a', { class: 'tx-stream-text__link', href, rel: 'noopener noreferrer' }, children)]
  return h('span', { key: group.key, class: 'tx-stream-text__run' }, trailing ? [...children, createTextVNode(trailing)] : children)
}

const slotVersion = useSlotVersion(slots)

// The space after an atom (a run's leading space attaches to the unit before
// it) is plain text beside the chip, never part of its entrance.
const StreamTextBody: FunctionalComponent<{ groups: Group[], slotVersion: number }> = ({ groups }) =>
  groups.flatMap(group => (group.kind === 'atom'
    ? (group.ws ? [renderAtom(group), createTextVNode(group.ws)] : [renderAtom(group)])
    : [renderRun(group)]))
StreamTextBody.props = ['groups', 'slotVersion']

const state = computed(() => pacer.state.value)
const live = computed(() => state.value === 'streaming' || state.value === 'paused' || state.value === 'draining')
const showCaret = computed(() => props.caret && live.value)
// The reserve copy exists only while a complete content plays back.
const reserving = computed(() => props.reserve && !props.streaming && pacer.revealed.value < model.value.units.length)

const rootStyle = computed(() => ({ '--tx-stream-reveal-duration': `${duration.value}ms` }))

defineExpose({
  /** Where the stream is. */
  state,
  /** Plays the whole content again from the first word. */
  replay: pacer.replay,
  /** Shows everything now, without entrances. */
  skip: pacer.skip,
})
</script>

<template>
  <component
    :is="tag"
    class="tx-stream-text"
    :class="[`is-reveal-${preset}`, { 'is-reserving': reserving }]"
    :style="rootStyle"
    :aria-busy="live ? 'true' : undefined"
  >
    <span v-if="reserving" class="tx-stream-text__reserve" aria-hidden="true" inert>
      <StreamTextBody :groups="fullGroups" :slot-version="slotVersion" />
    </span>
    <span class="tx-stream-text__live">
      <StreamTextBody :groups="liveGroups" :slot-version="slotVersion" />
      <!-- Switched off by the host, the caret goes at once; only a stream that ends retracts it. -->
      <Transition name="tx-stream-text-caret" :css="caret">
        <span v-if="showCaret" class="tx-stream-text__caret" aria-hidden="true">
          <slot name="caret" :state="state">
            <TxStreamCaret :state="state" />
          </slot>
        </span>
      </Transition>
    </span>
  </component>
</template>

<style lang="scss">
@use '../../../style/mixins.scss' as *;

@include stream-reveal-keyframes;

.tx-stream-text {
  @include stream-reveal-presets('.tx-stream-text__word');

  // The final layout, held by an invisible copy in the same grid cell, so a
  // playback never reflows the lines around it.
  &.is-reserving {
    display: inline-grid;
  }
}

.tx-stream-text.is-reserving > .tx-stream-text__reserve,
.tx-stream-text.is-reserving > .tx-stream-text__live {
  grid-area: 1 / 1;
}

.tx-stream-text__reserve {
  visibility: hidden;
}

.tx-stream-text__code {
  padding: 0.1em 0.35em;
  border-radius: 4px;
  background: var(--tx-fill-color-light, #f5f7fa);
  font-family: var(--tx-font-mono, ui-monospace, 'SF Mono', Menlo, monospace);
  font-size: 0.9em;
}

.tx-stream-text__link {
  color: var(--tx-color-primary, #409eff);
  text-decoration: underline;
  text-underline-offset: 2px;
}

// Zero inline size: the caret overhangs the last word instead of taking room,
// so a line breaks where it would without it (and where the reserve copy does).
.tx-stream-text__caret {
  position: relative;
  display: inline-block;
  width: 0;
  height: 1em;
  vertical-align: -0.14em;
  transform-origin: 0.7em 50%;
}

.tx-stream-text__caret > * {
  position: absolute;
  top: 0;
  left: 0.22em;
}

@media (prefers-reduced-motion: no-preference) {
  .tx-stream-text-caret-enter-active {
    transition:
      opacity 0.3s cubic-bezier(0.22, 1, 0.36, 1),
      scale 0.3s cubic-bezier(0.22, 1, 0.36, 1);
  }

  // Retracts when the stream ends rather than fading over the last word.
  .tx-stream-text-caret-leave-active {
    transition:
      opacity 0.26s cubic-bezier(0.4, 0, 1, 1),
      scale 0.26s cubic-bezier(0.4, 0, 1, 1);
  }

  .tx-stream-text-caret-enter-from,
  .tx-stream-text-caret-leave-to {
    opacity: 0;
    scale: 0.4;
  }
}
</style>
