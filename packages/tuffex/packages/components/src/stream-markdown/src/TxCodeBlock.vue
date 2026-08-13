<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import TxCopyButton from '../../copy-button/src/TxCopyButton.vue'
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
    previewLabel?: string
    codeLabel?: string
  }>(),
  {
    lang: '',
    code: '',
    closed: true,
    streaming: false,
    theme: 'light',
    previewable: true,
    previewLabel: 'Preview',
    codeLabel: 'Code',
  },
)

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

// A fence that stops being previewable (language edited mid-stream) must not
// leave the toggle stuck on a view that no longer exists.
watch(canPreview, (allowed) => {
  if (!allowed) showPreview.value = false
})

/**
 * `srcdoc` inside a sandboxed frame: no same-origin, so the preview cannot
 * reach the app's DOM, storage or IPC. Scripts stay off entirely — a rendered
 * preview is for looking at markup, not for running a program.
 */
const previewDocument = computed(() =>
  props.lang === 'svg' || props.lang === 'xml'
    ? `<!doctype html><meta charset="utf-8"><body style="margin:0;display:grid;place-items:center">${props.code}</body>`
    : props.code
)
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
          :aria-pressed="showPreview"
          @click="showPreview = !showPreview"
        >
          {{ showPreview ? codeLabel : previewLabel }}
        </button>
        <TxCopyButton :text="code" size="sm" class="tx-code-block__copy" />
      </div>
    </div>

    <!-- Sandboxed with no allow-scripts and no allow-same-origin: the preview
         renders markup, it never runs code or reaches the app. -->
    <iframe
      v-if="canPreview && showPreview"
      class="tx-code-block__preview"
      sandbox=""
      :title="`${lang} preview`"
      :srcdoc="previewDocument"
    />
    <!-- Shiki output is generated markup with the code text already escaped —
         nothing user-controlled lands here unescaped. -->
    <div v-else-if="highlighted" class="tx-code-block__body" v-html="highlighted" />
    <pre v-else class="tx-code-block__body tx-code-block__plain"><code>{{ code }}</code></pre>
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
    font-weight: 600;
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

  .tx-code-block__preview {
    display: block;
    width: 100%;
    height: 260px;
    border: none;
    background: #fff;
  }

  // Beats the `.markdown-body pre` typography rules on specificity, so the
  // host document's code styling never double-frames the block.
  .tx-code-block__body,
  .tx-code-block__body pre,
  pre.tx-code-block__plain {
    margin: 0;
    padding: 0;
    border: none;
    border-radius: 0;
    background: transparent;
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
