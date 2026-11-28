<script setup lang="ts">
import type { CodeRunPayload, StreamMarkdownCodePreview } from './types'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { hasWindow } from '../../../../utils/env'
import TxCopyButton from '../../button/src/copy-button.vue'
import TxEdgeFadeMask from '../../edge-fade-mask/src/TxEdgeFadeMask.vue'
import { isRunnableShellLanguage } from './runnable-languages'
import { highlightToHtml } from './shiki-runtime'

defineOptions({ name: 'TxCodeBlock' })

const props = withDefaults(
  defineProps<{
    lang?: string
    code?: string
    /** False only for the still-growing tail fence of a live stream. */
    closed?: boolean
    streaming?: boolean
    theme?: 'light' | 'dark'
    /** Offers a rendered view for markup languages once the fence settles. */
    previewable?: boolean
    /** False hands the settled preview to the host through `preview` instead of rendering it below the header. */
    inlinePreview?: boolean
    previewLabel?: string
    codeLabel?: string
    /** Builds the preview frame's accessible name from the fence language. @default (lang) => `${lang} preview` */
    frameLabelFormatter?: (lang: string) => string
    copyLabel?: string
    copiedLabel?: string
    /** Offers a run button to the left of the copy button for settled shell fences. */
    runnable?: boolean
    runLabel?: string
    ranLabel?: string
    runTitle?: string
  }>(),
  {
    lang: '',
    code: '',
    closed: true,
    streaming: false,
    theme: 'light',
    previewable: true,
    inlinePreview: true,
    previewLabel: 'Preview',
    codeLabel: 'Code',
    frameLabelFormatter: (lang: string) => `${lang} preview`,
    copyLabel: 'Copy',
    copiedLabel: 'Copied',
    runnable: false,
    runLabel: 'Run',
    ranLabel: 'Ran',
    runTitle: undefined,
  },
)

const emit = defineEmits<{
  preview: [preview: StreamMarkdownCodePreview]
  run: [payload: CodeRunPayload]
}>()

/**
 * Shiki output for the current (code, theme); null renders the escaped
 * plain-text fallback. Highlighting is a pure async enhancement: the plain
 * rendering is always correct, colour arrives when it arrives.
 */
const highlighted = ref<string | null>(null)
let requestToken = 0

/**
 * Live highlighting cadence.
 *
 * An open fence is re-tokenized as it grows, so code arrives coloured rather
 * than turning colour at the end — but only on a trailing timer, because
 * tokenizing on every delta would put a full re-parse of the block between
 * each character and the screen. A settled fence highlights immediately.
 */
const STREAM_HIGHLIGHT_INTERVAL_MS = 120
let streamTimer: ReturnType<typeof setTimeout> | null = null

function clearStreamTimer(): void {
  if (streamTimer) {
    clearTimeout(streamTimer)
    streamTimer = null
  }
}

function runHighlight(): void {
  const token = ++requestToken
  void highlightToHtml(props.code, props.lang, props.theme).then((html) => {
    // A newer request (or a language change) superseded this one in flight.
    if (token === requestToken)
      highlighted.value = html
  })
}

watch(
  [() => props.code, () => props.closed, () => props.theme, () => props.lang],
  () => {
    if (!props.lang) {
      clearStreamTimer()
      requestToken += 1
      highlighted.value = null
      return
    }

    if (props.closed) {
      clearStreamTimer()
      runHighlight()
      return
    }

    // Open fence: coalesce bursts of deltas into one highlight pass.
    if (streamTimer) return
    streamTimer = setTimeout(() => {
      streamTimer = null
      runHighlight()
    }, STREAM_HIGHLIGHT_INTERVAL_MS)
  },
  { immediate: true },
)

onBeforeUnmount(clearStreamTimer)

// ---------------------------------------------------------------------------
// Following the stream inside the capped body
// ---------------------------------------------------------------------------

/**
 * With the body capped, a code fence that is still arriving would grow past the
 * visible area and the reader would watch a frozen first screen while the model
 * writes below it. Pin the body to its own bottom while the fence is open, and
 * stop the moment the reader scrolls up — the same contract as the transcript.
 */
const bodyRef = ref<HTMLElement | null>(null)
/** Set by a real scroll away from the bottom; cleared by a fresh fence. */
const detached = ref(false)

function atBodyBottom(el: HTMLElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= 4
}

function onBodyScroll(): void {
  const el = bodyRef.value
  if (el && !props.closed)
    detached.value = !atBodyBottom(el)
}

/** The mask owns the scroll box now; ask it to re-measure whenever the body changes. */
const maskRef = ref<{ refresh?: () => void } | null>(null)

function syncFade(): void {
  maskRef.value?.refresh?.()
}

function followStream(): void {
  const el = bodyRef.value
  if (!el || props.closed || detached.value)
    return
  el.scrollTop = el.scrollHeight
  syncFade()
}

// A settled fence starts over at the top of the finished code, the way a reader
// expects to re-read a file from its first line.
watch(
  () => props.closed,
  (closed) => {
    detached.value = false
    const el = bodyRef.value
    if (el && closed)
      el.scrollTop = 0
    void nextTick(syncFade)
  },
)

watch(
  [() => props.code, highlighted],
  () => {
    if (!props.closed)
      followStream()
    else
      syncFade()
  },
  { flush: 'post' },
)

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

/**
 * Languages whose settled output is worth showing rendered. Kept to markup the
 * app can display inside a sandboxed frame — anything that would need a
 * toolchain to run is source only.
 */
const PREVIEWABLE = new Set(['html', 'svg', 'xml'])

const canPreview = computed(
  () => props.previewable && props.closed && PREVIEWABLE.has(props.lang) && !!props.code.trim()
)

const showPreview = ref(false)

// A fence that stops being previewable, or a host that hands previews to itself,
// must not leave the toggle stuck on an inline view that no longer exists.
watch([canPreview, () => props.inlinePreview], ([allowed, inline]) => {
  if (!allowed || !inline) showPreview.value = false
})

const PREVIEW_CSP = 'default-src \'none\'; frame-src about:; style-src \'unsafe-inline\'; img-src data: blob:; font-src data:; script-src \'none\''

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

/**
 * `srcdoc` inside a sandboxed frame: no same-origin, so the preview cannot
 * reach the app's DOM, storage or IPC. Scripts stay off entirely — a rendered
 * preview is for looking at markup, not for running a program. The outer
 * document carries a restrictive CSP inherited by the nested `srcdoc` frame so
 * markup cannot make external network requests or beacon remote resources.
 */
const previewDocument = computed(() => {
  const inner = props.lang === 'svg' || props.lang === 'xml'
    ? `<!doctype html><meta charset="utf-8"><body style="margin:0;display:grid;place-items:center">${props.code}</body>`
    : props.code
  return `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}"><style>html,body{margin:0;height:100%;background:transparent}iframe{display:block;width:100%;height:100%;border:0}</style><iframe sandbox="" srcdoc="${escapeAttribute(inner)}"></iframe>`
})

function togglePreview(): void {
  if (!props.inlinePreview) {
    emit('preview', { lang: props.lang, code: props.code, srcdoc: previewDocument.value })
    return
  }
  showPreview.value = !showPreview.value
}

// ---------------------------------------------------------------------------
// Run shell command
// ---------------------------------------------------------------------------

const RUN_FEEDBACK_MS = 1400

const canRun = computed(
  () => props.runnable && props.closed && isRunnableShellLanguage(props.lang) && !!props.code.trim(),
)

const ran = ref(false)
let runResetTimer: ReturnType<typeof setTimeout> | undefined

function clearRunResetTimer(): void {
  if (runResetTimer !== undefined) {
    clearTimeout(runResetTimer)
    runResetTimer = undefined
  }
}

watch([() => props.code, () => props.lang, canRun], () => {
  clearRunResetTimer()
  ran.value = false
})

onBeforeUnmount(clearRunResetTimer)

function handleRun(): void {
  if (!canRun.value)
    return
  emit('run', { lang: props.lang.trim().toLowerCase(), code: props.code })
  ran.value = true
  clearRunResetTimer()
  if (hasWindow()) {
    runResetTimer = setTimeout(() => {
      runResetTimer = undefined
      ran.value = false
    }, RUN_FEEDBACK_MS)
  }
}
</script>

<template>
  <div class="tx-code-block" :class="theme" :data-lang="lang || undefined">
    <div class="tx-code-block__header">
      <span class="tx-code-block__lang">{{ lang || 'text' }}</span>
      <div class="tx-code-block__actions">
        <button
          v-if="canPreview"
          type="button"
          class="tx-code-block__toggle"
          :aria-pressed="inlinePreview ? showPreview : undefined"
          @click="togglePreview"
        >
          {{ showPreview ? codeLabel : previewLabel }}
        </button>
        <button
          v-if="canRun"
          type="button"
          class="tx-code-block__run"
          :class="{ 'is-ran': ran }"
          :title="runTitle || runLabel"
          :aria-label="ran ? ranLabel : (runTitle || runLabel)"
          @click="handleRun"
        >
          <span class="tx-code-block__run-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="12" height="12">
              <path v-if="ran" d="M4 12l5 5L20 6" />
              <polygon v-else points="6 4 20 12 6 20 6 4" />
            </svg>
          </span>
          <span class="tx-code-block__run-label">{{ ran ? ranLabel : runLabel }}</span>
        </button>
        <TxCopyButton
          :text="code"
          :copy-label="copyLabel"
          :copied-label="copiedLabel"
          size="sm"
          class="tx-code-block__copy"
        />
      </div>
    </div>

    <!-- Sandboxed with no allow-scripts and no allow-same-origin: the preview
         renders markup, it never runs code or reaches the app. -->
    <iframe
      v-if="canPreview && showPreview"
      class="tx-code-block__preview"
      sandbox=""
      :title="frameLabelFormatter(lang)"
      :srcdoc="previewDocument"
    />
    <!-- Shiki output is generated markup with the code text already escaped —
         nothing user-controlled lands here unescaped. The mask is what makes the
         capped body read as scrollable instead of as text that just stops: the
         edge it can still scroll toward fades out. -->
    <TxEdgeFadeMask
      v-else-if="highlighted"
      ref="maskRef"
      class="tx-code-block__scroller"
      axis="vertical"
      :size="18"
    >
      <div
        ref="bodyRef"
        class="tx-code-block__body"
        @scroll.passive="onBodyScroll"
        v-html="highlighted"
      />
    </TxEdgeFadeMask>
    <TxEdgeFadeMask
      v-else
      ref="maskRef"
      class="tx-code-block__scroller"
      axis="vertical"
      :size="18"
    >
      <pre
        ref="bodyRef"
        class="tx-code-block__body tx-code-block__plain"
        @scroll.passive="onBodyScroll"
      ><code>{{ code }}</code></pre>
    </TxEdgeFadeMask>
  </div>
</template>

<style lang="scss">
.tx-code-block {
  margin: 16px 0;
  border: 1px solid var(--tx-border-color-light, #e4e7ed);
  border-radius: 8px;
  background: var(--tx-fill-color-darker, #f6f8fa);
  overflow: hidden;

  .tx-code-block__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 8px 4px 14px;
    border-bottom: 1px solid var(--tx-border-color-light, #e4e7ed);
  }

  .tx-code-block__lang {
    color: var(--tx-text-color-secondary, #6b7280);
    font-size: 11px;
    font-weight: var(--tx-font-weight-semibold, 600);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .tx-code-block__actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .tx-code-block__toggle {
    padding: 3px 10px;
    border: 1px solid var(--tx-border-color-lighter, #e5e7eb);
    border-radius: 999px;
    background: transparent;
    color: var(--tx-text-color-secondary, #6b7280);
    font: inherit;
    font-size: 11.5px;
    cursor: pointer;

    &:hover {
      border-color: var(--tx-color-primary, #409eff);
      color: var(--tx-color-primary, #409eff);
    }
  }

  .tx-code-block__run {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    height: 30px;
    padding: 0 10px 0 9px;
    border: 0;
    border-radius: 8px;
    background: var(--tx-bg-color, #ffffff);
    box-shadow: inset 0 0 0 1px var(--tx-border-color, #dcdfe6);
    color: var(--tx-text-color-regular, #606266);
    font: inherit;
    font-size: 13px;
    font-weight: var(--tx-font-weight-medium, 500);
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;

    &:hover:not(:disabled) {
      background: var(--tx-fill-color-light, #f5f7fa);
      color: var(--tx-text-color-primary, #303133);
    }

    &.is-ran:not(:disabled) {
      background: color-mix(in srgb, var(--tx-color-success, #67c23a) 12%, var(--tx-bg-color, #ffffff));
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-color-success, #67c23a) 38%, transparent);
      color: color-mix(in srgb, var(--tx-color-success, #67c23a) 45%, var(--tx-text-color-primary, #303133));
    }

    &:focus-visible {
      outline: 2px solid var(--tx-color-primary-light-5, #a0cfff);
      outline-offset: 2px;
    }

    @media (prefers-reduced-motion: no-preference) {
      transition: transform 0.12s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));

      &:active:not(:disabled) {
        transform: scale(0.97);
      }
    }
  }

  .tx-code-block__run-icon,
  .tx-code-block__run-label {
    display: inline-flex;
    align-items: center;
  }

  .tx-code-block__run-icon svg {
    display: block;
    width: 14px;
    height: 14px;
    overflow: visible;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .tx-code-block__preview {
    display: block;
    width: 100%;
    height: 260px;
    border: none;
    background: var(--tx-color-white, #fff);
  }

  // Beats the `.markdown-body pre` typography rules on specificity, so the
  // host document's code styling never double-frames the block.
  .tx-code-block__body,
  .tx-code-block__body pre,
  pre.tx-code-block__plain {
    margin: 0;
    border: none;
    border-radius: 0;
    background: transparent;
  }

  // The scroll box is the mask's viewport, so the cap goes on the mask and the
  // body grows inside it: a 500-line file scrolls within the card instead of
  // pushing the rest of the answer off screen, and the mask fades the edge that
  // can still be scrolled toward.
  .tx-code-block__scroller {
    max-height: var(--tx-code-block-max-height, 360px);
  }

  .tx-code-block__body {
    // Both renderings share the box: Shiki's body is a div holding a `pre`, the
    // fallback's body *is* the `pre`.
    display: block;
  }

  .tx-code-block__body pre,
  pre.tx-code-block__plain {
    padding: 14px 16px;
    overflow-x: auto;

    code {
      display: block;
      padding: 0;
      border-radius: 0;
      background: transparent;
      font-size: 13px;
      line-height: 1.6;
      white-space: pre;
    }
  }

  &.dark {
    border-color: var(--tx-border-color, #414243);
    background: var(--tx-fill-color-darker, #1a1a1a);

    .tx-code-block__header {
      border-bottom-color: var(--tx-border-color, #414243);
    }
  }
}
</style>
