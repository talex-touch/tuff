<!-- Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT. -->
<script setup lang="ts">
import type { CodeStreamProps } from './types'
import { computed, ref, useSlots, watch } from 'vue'
import TxCopyButton from '../../button/src/copy-button.vue'
import { highlightToHtml } from '../../stream-markdown/src/shiki-runtime'
import { useAutoTheme } from '../../stream-markdown/src/use-auto-theme'

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
})

const emit = defineEmits<{
  copy: [code: string]
  /** Fires when the reveal reaches the last line. */
  complete: []
}>()

const slots = useSlots()

defineSlots<{
  /** Replaces the filename / label pair. */
  header?: () => any
  /** Extra chrome beside the copy button. */
  actions?: () => any
}>()

const resolvedTheme = useAutoTheme(() => props.theme)

const plainLines = computed(() => props.code.split('\n'))
const totalLines = computed(() => plainLines.value.length)

/**
 * Shiki output split back into lines, or null to keep the escaped plain-text
 * rendering. Highlighting is a pure async enhancement — plain is always
 * correct, colour arrives when it arrives.
 *
 * Upstream hand-writes a five-colour token model; that is a demo standing in
 * for a highlighter, and it would make every host tokenize its own code.
 */
const highlighted = ref<string[] | null>(null)
let requestToken = 0

function splitHighlightedLines(html: string): string[] | null {
  if (typeof DOMParser === 'undefined')
    return null

  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const lines = parsed.querySelectorAll('code > .line')

  // Line-for-line alignment is what makes the reveal and the gutter agree.
  // A shiki release that changes its line markup fails this check and falls
  // back to plain text rather than shifting every number by one.
  if (lines.length !== totalLines.value)
    return null

  return Array.from(lines, line => line.innerHTML)
}

watch(
  [() => props.code, () => props.lang, resolvedTheme],
  () => {
    if (!props.lang) {
      requestToken += 1
      highlighted.value = null
      return
    }

    const token = ++requestToken
    void highlightToHtml(props.code, props.lang, resolvedTheme.value).then((html) => {
      // A newer request (or a language change) superseded this one in flight.
      if (token !== requestToken)
        return
      highlighted.value = html ? splitHighlightedLines(html) : null
    })
  },
  { immediate: true },
)

const revealCount = computed(() => {
  const requested = props.revealedLines
  if (requested === undefined || requested < 0)
    return totalLines.value
  return Math.min(Math.max(0, Math.trunc(requested)), totalLines.value)
})

const revealing = computed(() => revealCount.value > 0 && revealCount.value < totalLines.value)
const showCaret = computed(() => props.caret && revealing.value)

watch(revealCount, (count, previous) => {
  if (count >= totalLines.value && previous < totalLines.value)
    emit('complete')
})

const hasHeader = computed(
  () => !!(props.filename || props.langLabel || props.copyable || slots.header || slots.actions),
)

/**
 * The listing's own height, reserved up front: line-height is 1.7em against
 * the body's 11.5px, plus the 10px block padding on each side. Upstream pins
 * this at 137px, which is exactly six lines of its sample — a number that
 * means nothing for any other listing.
 */
const bodyStyle = computed(() => {
  const style: Record<string, string> = {
    '--tx-bui-code-stream-lines': String(totalLines.value),
  }

  if (props.minHeight !== undefined) {
    style['--tx-bui-code-stream-min-height']
      = typeof props.minHeight === 'number' ? `${props.minHeight}px` : props.minHeight
  }

  return style
})
</script>

<template>
  <div class="tx-bui-code-stream">
    <div v-if="hasHeader" class="tx-bui-code-stream__header">
      <slot name="header">
        <span class="tx-bui-code-stream__title">
          <span v-if="filename" class="tx-bui-code-stream__filename">{{ filename }}</span>
          <span v-if="langLabel" class="tx-bui-code-stream__lang">{{ langLabel }}</span>
        </span>
      </slot>

      <span class="tx-bui-code-stream__actions">
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
      <div
        v-for="index in revealCount"
        :key="index"
        class="tx-bui-code-stream__line"
      >
        <span v-if="lineNumbers" class="tx-bui-code-stream__lineno" aria-hidden="true">{{ index }}</span>
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
    </div>
  </div>
</template>

<style lang="scss">
@use '../../../style/mixins.scss' as *;

@include bui-keyframes-fade-up;

.tx-bui-code-stream {
  @include bui-scope;

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
    @include bui-fade-up(250ms);

    display: flex;
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
    transition: background-color 0.1s ease, color 0.1s ease;

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
}

@media (prefers-reduced-motion: reduce) {
  // bui-fade-up carries its own guard; this is the hand-written transition.
  .tx-bui-code-stream .tx-bui-code-stream__copy.tx-copy-button {
    transition: none;
  }
}
</style>
