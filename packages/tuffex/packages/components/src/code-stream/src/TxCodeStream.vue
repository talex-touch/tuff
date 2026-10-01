<!-- Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT. -->
<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import type { FreshChunks } from '../../stream-markdown/src/use-fresh-chunks'
import type { StreamState } from '../../stream-text/src/types'
import type { CodeStreamProps } from './types'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useSlots, watch } from 'vue'
import { hasDocument, hasWindow } from '../../../../utils/env'
import TxCopyButton from '../../button/src/copy-button.vue'
import { useReducedMotion } from '../../liquid/src/use-reduced-motion'
import { highlightToHtml } from '../../stream-markdown/src/shiki-runtime'
import { useAutoTheme } from '../../stream-markdown/src/use-auto-theme'
import { createFreshChunks } from '../../stream-markdown/src/use-fresh-chunks'
import { streamRevealDuration } from '../../stream-text/src/presets'
import TxStreamCaret from '../../stream-text/src/TxStreamCaret.vue'
import { useStreamPacer } from '../../stream-text/src/use-stream-pacer'
import { codeWordEnds } from './units'

defineOptions({ name: 'TxCodeStream' })

const props = withDefaults(defineProps<CodeStreamProps>(), {
  lang: '',
  caret: true,
  lineNumbers: true,
  theme: 'auto',
  copyable: true,
  copyLabel: 'Copy',
  copiedLabel: 'Copied',
  revealedLines: undefined,
  minHeight: undefined,
  diff: undefined,
  // Vue casts an absent boolean prop to `false`; whether `streaming` is set at
  // all is what selects streaming mode.
  streaming: undefined,
  reveal: 'aurora',
  reserve: false,
  paced: true,
  appear: false,
})

const emit = defineEmits<{
  copy: [code: string]
  /** Fires when the reveal reaches the last line (`revealedLines` mode). */
  complete: []
  /** Streaming mode: the stream moved to another state. */
  'state-change': [state: StreamState]
  /** Streaming mode: once per play-through, when the last word is shown and the source has finished. */
  done: []
}>()

const slots = useSlots()

defineSlots<{
  /** Replaces the filename / label pair. */
  header?: () => any
  /** Extra chrome beside the copy button. */
  actions?: () => any
  /** Streaming mode: replaces the stream caret; rendered while the stream is live. */
  caret?: (props: { state: StreamState }) => any
}>()

const resolvedTheme = useAutoTheme(() => props.theme)

/**
 * Diff mode is entered by supplying rows, not by a flag: an empty `diff` array
 * is a diff with nothing in it, which is a listing.
 */
const diffRows = computed(() => props.diff ?? [])
const isDiff = computed(() => diffRows.value.length > 0)

/**
 * Streaming mode: `streaming` is set (either value) and nothing else owns the
 * reveal — no `revealedLines`, no diff. The component then paces `code`
 * itself, word by word.
 */
const live = computed(() => props.streaming !== undefined && props.revealedLines === undefined && !isDiff.value)

/**
 * The rendered text, whichever mode is active. Everything downstream — the
 * highlighter, the gutter, the reveal, the reserved height — reads this, so the
 * two modes share one pipeline instead of forking the template.
 */
const plainLines = computed(() =>
  isDiff.value ? diffRows.value.map(row => row.content) : props.code.split('\n'),
)
const totalLines = computed(() => plainLines.value.length)

/**
 * What goes to the highlighter.
 *
 * In diff mode this is every row joined, removed and added alike, so a replaced
 * line is tokenized in both revisions. The text is briefly not valid source —
 * two versions of one statement in a row — but a highlighter recovers per line,
 * and the alternative (highlighting each row alone) loses all surrounding
 * context and mis-colours anything spanning lines.
 */
const highlightSource = computed(() =>
  isDiff.value ? plainLines.value.join('\n') : props.code,
)

/** Added/removed tally for the header, counted from the rows themselves. */
const diffTally = computed(() => {
  let added = 0
  let removed = 0
  for (const row of diffRows.value) {
    if (row.kind === 'added')
      added += 1
    else if (row.kind === 'removed')
      removed += 1
  }
  return { added, removed }
})

/**
 * Per-row helpers. These stay in the script rather than the template: the
 * gutter and the row class both need an optional chain plus a fallback, and a
 * template expression is the wrong place for that.
 */
function lineClass(index: number): string | undefined {
  if (!isDiff.value)
    return undefined
  return `is-${diffRows.value[index - 1]?.kind ?? 'context'}`
}

function gutterLabel(index: number): string | number {
  if (!isDiff.value)
    return index
  return diffRows.value[index - 1]?.number ?? ''
}

/**
 * Shiki output split back into lines, or null to keep the escaped plain-text
 * rendering. Highlighting is a pure async enhancement — plain is always
 * correct, colour arrives when it arrives.
 *
 * Upstream hand-writes a five-colour token model; that is a demo standing in
 * for a highlighter, and it would make every host tokenize its own code.
 */
const highlighted = ref<string[] | null>(null)
/** The source `highlighted` was made from; streaming mode maps shown lines against it. */
const highlightedFrom = shallowRef<string | null>(null)
let requestToken = 0

function splitHighlightedLines(html: string, expected: number): string[] | null {
  if (typeof DOMParser === 'undefined')
    return null

  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const lines = parsed.querySelectorAll('code > .line')

  // Line-for-line alignment is what makes the reveal and the gutter agree.
  // A shiki release that changes its line markup fails this check and falls
  // back to plain text rather than shifting every number by one.
  if (lines.length !== expected)
    return null

  return Array.from(lines, line => line.innerHTML)
}

/**
 * Live highlighting cadence, TxCodeBlock's for an open fence: growing code is
 * re-tokenized on a trailing timer, because tokenizing on every word would put
 * a full parse between each word and the screen. Settled code highlights at once.
 */
const STREAM_HIGHLIGHT_INTERVAL_MS = 120
let highlightTimer: ReturnType<typeof setTimeout> | null = null

function clearHighlightTimer(): void {
  if (highlightTimer) {
    clearTimeout(highlightTimer)
    highlightTimer = null
  }
}

function runHighlight(): void {
  const source = highlightSource.value
  // Streaming mode highlights code that is ahead of or behind what is shown,
  // so it checks against that code's own line count.
  const expected = live.value ? source.split('\n').length : totalLines.value
  const token = ++requestToken
  void highlightToHtml(source, props.lang, resolvedTheme.value).then((html) => {
    // A newer request (or a language change) superseded this one in flight.
    if (token !== requestToken)
      return
    const lines = html ? splitHighlightedLines(html, expected) : null
    highlighted.value = lines
    highlightedFrom.value = lines ? source : null
  })
}

watch(
  [highlightSource, () => props.lang, resolvedTheme, () => live.value && props.streaming === true],
  () => {
    if (!props.lang) {
      clearHighlightTimer()
      requestToken += 1
      highlighted.value = null
      highlightedFrom.value = null
      return
    }

    if (live.value && props.streaming === true && hasWindow()) {
      if (!highlightTimer) {
        highlightTimer = setTimeout(() => {
          highlightTimer = null
          runHighlight()
        }, STREAM_HIGHLIGHT_INTERVAL_MS)
      }
      return
    }

    clearHighlightTimer()
    runHighlight()
  },
  { immediate: true },
)

onBeforeUnmount(clearHighlightTimer)

const revealCount = computed(() => {
  const requested = props.revealedLines
  if (requested === undefined || requested < 0)
    return totalLines.value
  return Math.min(Math.max(0, Math.trunc(requested)), totalLines.value)
})

const revealing = computed(() => revealCount.value > 0 && revealCount.value < totalLines.value)
const showCaret = computed(() => props.caret && revealing.value)

watch(revealCount, (count, previous) => {
  if (!live.value && count >= totalLines.value && previous < totalLines.value)
    emit('complete')
})

// ---------------------------------------------------------------------------
// Streaming mode
// ---------------------------------------------------------------------------

// Where each word of `code` ends (`units.ts`).
const wordEnds = computed(() => (live.value ? codeWordEnds(props.code) : []))

const reduced = useReducedMotion()
const preset = computed(() => (reduced.value ? 'none' : props.reveal))
const revealDuration = computed(() => streamRevealDuration(preset.value))

const pacer = useStreamPacer({
  total: () => wordEnds.value.length,
  streaming: () => live.value && props.streaming === true,
  wordMs: () => props.wordMs,
  maxLagMs: () => props.maxLagMs,
  drainMs: () => props.drainMs,
  pauseMs: () => props.pauseMs,
  paced: () => props.paced && !reduced.value,
  appear: props.appear,
  onState: (state) => {
    emit('state-change', state)
    if (state === 'done')
      emit('done')
  },
})

// A rewrite (a model revising what it sent) re-releases from the first word
// that changed; code that only grew keeps everything it has shown.
watch(() => props.code, (next, previous) => {
  if (!live.value || next.startsWith(previous))
    return
  let common = 0
  const limit = Math.min(next.length, previous.length)
  while (common < limit && next.charCodeAt(common) === previous.charCodeAt(common))
    common++
  const ends = wordEnds.value
  let keep = 0
  while (keep < ends.length && ends[keep]! <= common)
    keep++
  if (keep < pacer.revealed.value)
    pacer.rewind(keep)
}, { flush: 'sync' })

const shownCode = computed(() => {
  const ends = wordEnds.value
  const count = Math.min(pacer.revealed.value, ends.length)
  return count > 0 ? props.code.slice(0, ends[count - 1]) : ''
})

const streamState = computed(() => pacer.state.value)
const streamLive = computed(() =>
  streamState.value === 'streaming' || streamState.value === 'paused' || streamState.value === 'draining',
)
const showStreamCaret = computed(() => props.caret && streamLive.value)

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, char => HTML_ESCAPES[char]!)
}

/** Highlighted markup cut to its first `length` characters; null without a DOM to cut it in. */
function truncateHtml(html: string, length: number): string | null {
  if (!hasDocument())
    return null
  const template = document.createElement('template')
  template.innerHTML = html
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT)
  const past: Text[] = []
  let remaining = length
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    if (remaining <= 0) {
      past.push(node)
    }
    else if (node.data.length > remaining) {
      node.data = node.data.slice(0, remaining)
      remaining = 0
    }
    else {
      remaining -= node.data.length
    }
  }
  for (const node of past)
    node.remove()
  return template.innerHTML
}

/**
 * One shown line as markup. Colour comes from the last highlight pass, which
 * runs on a trailing timer and so describes slightly different code: a line it
 * covers exactly keeps its markup, a line it covers further than shown is cut
 * to the shown length, and a line that grew past it shows the new characters
 * plain until the next pass colours them — inside their entrance, where the
 * change does not read.
 */
function lineMarkup(text: string, from: string | undefined, html: string | undefined): string {
  if (from === undefined || html === undefined)
    return escapeHtml(text)
  if (from === text)
    return html
  if (from.startsWith(text))
    return truncateHtml(html, text.length) ?? escapeHtml(text)
  if (text.startsWith(from))
    return html + escapeHtml(text.slice(from.length))
  return escapeHtml(text)
}

const highlightedFromLines = computed(() => highlightedFrom.value?.split('\n') ?? null)

/** Streaming mode's lines as markup; the last is the one still being written. */
const streamLines = computed<string[]>(() => {
  if (!live.value)
    return []
  const shown = shownCode.value
  // While the source is live an empty first line holds the caret, even before
  // anything has shown.
  if (!shown && !streamLive.value)
    return []
  const html = highlighted.value
  const from = highlightedFromLines.value
  return shown.split('\n').map((text, index) => lineMarkup(text, from?.[index], html?.[index]))
})

// The line being written is always the same element, so the caret inside it
// never remounts: a new line moves the finished one out into a new row
// instead, and the caret keeps its orbit.
const settledStreamLines = computed(() => streamLines.value.slice(0, -1))
const tailStreamLine = computed(() => streamLines.value[streamLines.value.length - 1])

/*
 * The entrance of newly shown characters. A line's markup is replaced
 * whenever its text or colour changes, which destroys any wrapper mid-
 * animation, so each line has a tracker that re-wraps its still-entering
 * characters after every patch with a negative delay: an entrance resumes
 * where the patch cut it (StreamMarkdown's technique, `use-fresh-chunks.ts`).
 */
const settledCodeEls: (HTMLElement | null)[] = []
const tailCodeEl = ref<HTMLElement | null>(null)
const trackers = new Map<number, FreshChunks>()
const trackedLines = new Map<number, { el: HTMLElement, html: string }>()
let adoptNext = false
let settleTimer: ReturnType<typeof setTimeout> | undefined

function bindSettledCode(index: number, el: Element | ComponentPublicInstance | null): void {
  settledCodeEls[index] = el instanceof HTMLElement ? el : null
}

/** `adopt` takes what is on screen as already shown: at mount, after `skip()`, once done. */
function syncFresh(adopt = false): void {
  const adopting = adopt || adoptNext
  adoptNext = false
  if (preset.value === 'none') {
    trackers.clear()
    trackedLines.clear()
    return
  }
  const lines = streamLines.value
  for (let index = 0; index < lines.length; index++) {
    const el = index === lines.length - 1 ? tailCodeEl.value : settledCodeEls[index] ?? null
    if (!el)
      continue
    const html = lines[index]!
    const last = trackedLines.get(index)
    if (!adopting && last && last.el === el && last.html === html)
      continue
    trackedLines.set(index, { el, html })
    let tracker = trackers.get(index)
    if (!tracker) {
      tracker = createFreshChunks({ className: 'tx-bui-code-stream__fresh', durationMs: revealDuration.value })
      trackers.set(index, tracker)
    }
    if (adopting)
      tracker.seed(el, index)
    else
      tracker.update(el, index)
  }
  for (const index of [...trackers.keys()]) {
    if (index >= lines.length) {
      trackers.delete(index)
      trackedLines.delete(index)
    }
  }
}

watch(streamLines, () => syncFresh(), { flush: 'post' })
// What is on screen at mount is adopted as shown, unless it is meant to enter.
onMounted(() => syncFresh(!props.appear))

watch(preset, () => {
  trackers.clear()
  trackedLines.clear()
  void nextTick(() => syncFresh(true))
})

// Once the stream is done and its last entrance has played, the entering
// characters fold back into plain markup.
watch(streamState, (state) => {
  clearTimeout(settleTimer)
  if (state === 'done' && hasWindow())
    settleTimer = setTimeout(() => syncFresh(true), revealDuration.value)
})

onBeforeUnmount(() => clearTimeout(settleTimer))

function replay(): void {
  trackers.clear()
  trackedLines.clear()
  pacer.replay()
}

function skip(): void {
  adoptNext = true
  pacer.skip()
  // skip() may change nothing on screen, and then no patch runs the watcher.
  void nextTick(() => {
    if (adoptNext)
      syncFresh(true)
  })
}

defineExpose({
  /** Streaming mode: where the stream is; `idle` in the other modes. */
  state: streamState,
  /** Streaming mode: plays the code again from the first word. */
  replay,
  /** Streaming mode: shows everything now, without entrances. */
  skip,
})

const hasHeader = computed(
  () => !!(props.filename || props.langLabel || props.copyable || isDiff.value || slots.header || slots.actions),
)

/**
 * The listing's own height, reserved up front: line-height is 1.7em against
 * the body's 11.5px, plus the 10px block padding on each side. Upstream pins
 * this at 137px, which is exactly six lines of its sample — a number that
 * means nothing for any other listing.
 */
const bodyStyle = computed(() => {
  // Streaming mode grows with what it shows, unless `reserve` holds the full
  // height while complete code plays back.
  const reserving = live.value && props.reserve && !props.streaming
  const lines = live.value && !reserving ? streamLines.value.length : totalLines.value
  const style: Record<string, string> = {
    '--tx-bui-code-stream-lines': String(lines),
  }

  if (props.minHeight !== undefined) {
    style['--tx-bui-code-stream-min-height']
      = typeof props.minHeight === 'number' ? `${props.minHeight}px` : props.minHeight
  }

  return style
})

const rootClass = computed(() => (live.value ? ['is-live', `is-reveal-${preset.value}`] : undefined))
const rootStyle = computed(() => (live.value ? { '--tx-stream-reveal-duration': `${revealDuration.value}ms` } : undefined))
</script>

<template>
  <div class="tx-bui-code-stream" :class="rootClass" :style="rootStyle" :aria-busy="streamLive ? 'true' : undefined">
    <div v-if="hasHeader" class="tx-bui-code-stream__header">
      <slot name="header">
        <span class="tx-bui-code-stream__title">
          <span v-if="filename" class="tx-bui-code-stream__filename">{{ filename }}</span>
          <span v-if="langLabel" class="tx-bui-code-stream__lang">{{ langLabel }}</span>
        </span>
      </slot>

      <span class="tx-bui-code-stream__actions">
        <span v-if="isDiff" class="tx-bui-code-stream__tally">
          <span v-if="diffTally.added" class="tx-bui-code-stream__added">+{{ diffTally.added }}</span>
          <span v-if="diffTally.removed" class="tx-bui-code-stream__removed">−{{ diffTally.removed }}</span>
        </span>
        <slot name="actions" />
        <TxCopyButton
          v-if="copyable"
          class="tx-bui-code-stream__copy"
          :text="code"
          :copy-label="copyLabel"
          :copied-label="copiedLabel"
          size="sm"
          @copy="emit('copy', $event)"
        />
      </span>
    </div>

    <!-- A `div` rather than a `pre`: Vue's compiler preserves template
         whitespace inside `pre`, so the markup's own indentation would render
         as code. `white-space: pre` on each line carries the same meaning. -->
    <div class="tx-bui-code-stream__body" :style="bodyStyle">
      <!-- Streaming mode: every line is markup (`v-html`) so the entering
           characters can be wrapped in it after each patch; Vue never owns a
           text node the wrapping would split. -->
      <template v-if="live">
        <div
          v-for="(markup, index) in settledStreamLines"
          :key="index"
          class="tx-bui-code-stream__line"
        >
          <span v-if="lineNumbers" class="tx-bui-code-stream__lineno" aria-hidden="true">{{ index + 1 }}</span>
          <span class="tx-bui-code-stream__content">
            <code :ref="el => bindSettledCode(index, el)" class="tx-bui-code-stream__code" v-html="markup" />
          </span>
        </div>
        <div v-if="tailStreamLine !== undefined" class="tx-bui-code-stream__line">
          <span v-if="lineNumbers" class="tx-bui-code-stream__lineno" aria-hidden="true">{{ streamLines.length }}</span>
          <span class="tx-bui-code-stream__content">
            <code ref="tailCodeEl" class="tx-bui-code-stream__code" v-html="tailStreamLine" />
            <!-- Switched off by the host, the caret goes at once; only a stream that ends retracts it. -->
            <Transition name="tx-bui-code-stream-caret" :css="caret">
              <span v-if="showStreamCaret" class="tx-bui-code-stream__stream-caret" aria-hidden="true">
                <slot name="caret" :state="streamState">
                  <TxStreamCaret :state="streamState" />
                </slot>
              </span>
            </Transition>
          </span>
        </div>
      </template>
      <template v-else>
        <div
          v-for="index in revealCount"
          :key="index"
          class="tx-bui-code-stream__line"
          :class="lineClass(index)"
        >
          <span v-if="lineNumbers" class="tx-bui-code-stream__lineno" aria-hidden="true">{{ gutterLabel(index) }}</span>
          <span class="tx-bui-code-stream__content">
            <!-- Shiki emits markup with the code text already escaped; nothing
                 user-controlled reaches v-html unescaped. The plain branch below
                 is ordinary interpolation. -->
            <code
              v-if="highlighted"
              class="tx-bui-code-stream__code"
              v-html="highlighted[index - 1]"
            />
            <code v-else class="tx-bui-code-stream__code">{{ plainLines[index - 1] }}</code>
            <span
              v-if="showCaret && index === revealCount"
              class="tx-bui-code-stream__caret"
              aria-hidden="true"
            />
          </span>
        </div>
      </template>
    </div>
  </div>
</template>

<style lang="scss">
@use '../../../style/mixins.scss' as *;

// Reduced motion, one form for the whole component: every animation and
// transition is declared only under `no-preference`, so reduced motion never
// starts one and everything rests in its declared (final) style.
@include bui-keyframes-fade-up;
@include stream-reveal-keyframes(code);

.tx-bui-code-stream {
  @include bui-scope;
  // Streaming mode: code words enter without the colour sweep, so syntax
  // colour holds from the first frame.
  @include stream-reveal-presets('.tx-bui-code-stream__fresh', code);

  overflow: hidden;
  border-radius: var(--tx-bui-radius-card, 10px);
  background: var(--tx-bui-surface, #fff);
  box-shadow: var(--tx-bui-shadow-card, 0 0 0 1px #ecedef, 0 1px 2px #1018280a, 0 2px 6px #10182808);

  .tx-bui-code-stream__header {
    @include bui-card-bar;

    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    border-bottom: 1px solid var(--tx-bui-line, #ecedef);
  }

  .tx-bui-code-stream__title {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }

  .tx-bui-code-stream__filename {
    overflow: hidden;
    color: var(--tx-bui-ink, #1f2124);
    font-family: var(--tx-bui-font-mono, "JetBrains Mono", ui-monospace, "SF Mono", monospace);
    font-size: 12px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tx-bui-code-stream__lang {
    flex: none;
    color: var(--tx-bui-ink-3, #9a9da3);
    font-size: 11.5px;
  }

  .tx-bui-code-stream__actions {
    display: flex;
    flex: none;
    align-items: center;
    gap: 4px;
  }

  .tx-bui-code-stream__body {
    min-height: var(
      --tx-bui-code-stream-min-height,
      calc(var(--tx-bui-code-stream-lines, 0) * 1.7em + 20px)
    );
    padding: 10px 12px;
    overflow-x: auto;
    background: var(--tx-bui-inset, #f7f8f9);
    font-family: var(--tx-bui-font-mono, "JetBrains Mono", ui-monospace, "SF Mono", monospace);
    font-size: 11.5px;
    line-height: 1.7;
  }

  .tx-bui-code-stream__line {
    display: flex;
  }

  // Diff rows tint the whole row and mark the gutter edge, so the change is
  // legible from the margin without reading the code. The marker is a
  // background on the row rather than a border, or the 2px would shift every
  // line's text and the two modes would no longer align.
  .tx-bui-code-stream__line.is-added,
  .tx-bui-code-stream__line.is-removed {
    margin: 0 -10px;
    padding: 0 8px 0 10px;
    background-repeat: no-repeat;
    background-position: 0 0;
    background-size: 2px 100%;
  }

  .tx-bui-code-stream__line.is-added {
    background-color: var(--tx-bui-green-tint, #e8f5ed);
    background-image: linear-gradient(var(--tx-bui-green, #189a4d), var(--tx-bui-green, #189a4d));
  }

  // Removed rows get a hatched marker rather than a solid one: colour alone
  // must not be the carrier, and the two tints are the one pairing a
  // red/green-blind reader cannot separate.
  .tx-bui-code-stream__line.is-removed {
    background-color: var(--tx-bui-red-tint, #fcecec);
    background-image: repeating-linear-gradient(
      45deg,
      var(--tx-bui-red, #e3474c) 0 2px,
      transparent 2px 4px
    );
  }

  // 10.5px at 1.86 and 11.5px at 1.7 both land on ~19.5px, so the number sits
  // on the same baseline as its line. Changing either side breaks the pairing.
  .tx-bui-code-stream__lineno {
    flex: none;
    width: 20px;
    color: color-mix(in oklab, var(--tx-bui-ink-3, #9a9da3) 60%, transparent);
    font-size: 10.5px;
    line-height: 1.86;
    text-align: right;
    user-select: none;
  }

  .tx-bui-code-stream__content {
    padding-left: 10px;
    white-space: pre;
  }

  // The tally reads as a figure, so it takes the mono face and tabular digits
  // — a two-digit count must not shift the filename beside it.
  .tx-bui-code-stream__tally {
    @include bui-tabular-nums;

    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--tx-bui-font-mono, ui-monospace, monospace);
    font-size: 11.5px;
  }

  .tx-bui-code-stream__added {
    color: var(--tx-bui-green, #189a4d);
  }

  .tx-bui-code-stream__removed {
    color: var(--tx-bui-red, #e3474c);
  }

  .tx-bui-code-stream__code {
    font: inherit;
  }

  // Deliberately still. Upstream reserves the blinking caret for prose
  // streaming; the code caret is a position marker, not a cursor.
  .tx-bui-code-stream__caret {
    display: inline-block;
    width: 3px;
    height: 12px;
    margin-left: 2px;
    border-radius: 999px;
    background: var(--tx-bui-accent, #0285ff);
    transform: translateY(2px);
  }

  // The copy control is TxCopyButton — clipboard write, execCommand fallback
  // and the polite live region all come with it — wearing BUI's chrome. The
  // three-class selector clears the child's own scoped rules.
  .tx-bui-code-stream__copy.tx-copy-button {
    gap: 4px;
    height: 24px;
    padding: 0 6px;
    border: 0;
    border-radius: var(--tx-bui-radius-chip, 6px);
    background: transparent;
    color: var(--tx-bui-ink-3, #9a9da3);
    font-size: 11.5px;
    font-weight: 500;
    // The child's own transition is replaced by ours below, and by none at all
    // under reduced motion.
    transition: none;

    &:hover:not(:disabled) {
      border: 0;
      background: var(--tx-bui-hover, #f4f5f6);
      color: var(--tx-bui-ink, #1f2124);
    }

    &.is-copied {
      border: 0;
      background: transparent;
      color: var(--tx-bui-green, #189a4d);
    }

    .tx-copy-button__icon svg {
      width: 10px;
      height: 10px;
    }
  }

  // Streaming mode's caret takes no room: it overhangs the end of the line
  // being written, so the line is as wide as its code.
  .tx-bui-code-stream__stream-caret {
    position: relative;
    display: inline-block;
    width: 0;
    height: 1em;
    vertical-align: -0.14em;
    transform-origin: 0.7em 50%;

    > * {
      position: absolute;
      top: 0;
      left: 0.22em;
    }
  }

  @media (prefers-reduced-motion: no-preference) {
    // In streaming mode the words carry the entrance, not the lines.
    &:not(.is-live) .tx-bui-code-stream__line {
      animation: tx-bui-fade-up 250ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)) both;
    }

    .tx-bui-code-stream__copy.tx-copy-button {
      transition: background-color 0.1s ease, color 0.1s ease;
    }
  }
}

@media (prefers-reduced-motion: no-preference) {
  .tx-bui-code-stream-caret-enter-active {
    transition:
      opacity 0.3s cubic-bezier(0.22, 1, 0.36, 1),
      scale 0.3s cubic-bezier(0.22, 1, 0.36, 1);
  }

  // Retracts when the stream ends rather than fading over the last word.
  .tx-bui-code-stream-caret-leave-active {
    transition:
      opacity 0.26s cubic-bezier(0.4, 0, 1, 1),
      scale 0.26s cubic-bezier(0.4, 0, 1, 1);
  }

  .tx-bui-code-stream-caret-enter-from,
  .tx-bui-code-stream-caret-leave-to {
    opacity: 0;
    scale: 0.4;
  }
}
</style>
