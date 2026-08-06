<script setup lang="ts">
import type { StreamBlock, StreamMarkdownBlockRenderer, StreamMarkdownProps } from './types'
import { Marked } from 'marked'
import { computed, ref, shallowRef, toRaw, watch } from 'vue'
import TxCodeBlock from './TxCodeBlock.vue'
import TxMermaidBlock from './TxMermaidBlock.vue'
import { createBlockStream } from './use-block-stream'
import { useAutoTheme } from './use-auto-theme'

defineOptions({ name: 'TxStreamMarkdown' })

const props = withDefaults(defineProps<StreamMarkdownProps>(), {
  streaming: false,
  sanitize: true,
  theme: 'auto',
})

// Per-component parser, same reasoning as TxMarkdownView: mutating the global
// `marked` singleton would reconfigure every other consumer app-wide.
const markedInstance = new Marked({ gfm: true, breaks: true })

const sanitizer = ref<null | ((html: string) => string)>(null)
const sanitizerReady = ref(false)
let sanitizerLoading = false

async function ensureSanitizer(): Promise<void> {
  if (sanitizer.value || sanitizerLoading)
    return

  sanitizerLoading = true
  try {
    const mod = await import('dompurify')
    const dp = mod.default
    sanitizer.value = (html: string) => dp.sanitize(html)
  }
  catch {
    sanitizer.value = null
  }
  finally {
    sanitizerReady.value = true
    sanitizerLoading = false
  }
}

watch(
  () => props.sanitize,
  (next) => {
    if (next)
      ensureSanitizer()
  },
  { immediate: true },
)

const stream = createBlockStream({
  marked: markedInstance,
  // Reads the live sanitizer so the closure stays valid once it loads; the
  // render gate below guarantees this never runs while it is missing.
  sanitize: html => (props.sanitize ? (sanitizer.value ? sanitizer.value(html) : '') : html),
})

/** Nothing renders while sanitization is requested but the sanitizer isn't usable. */
const canRender = computed(() => !props.sanitize || (sanitizerReady.value && !!sanitizer.value))

const blocks = shallowRef<StreamBlock[]>([])

watch(
  () => props.sanitize,
  () => {
    // Cached HTML was produced under the other mode — recompute everything.
    stream.reset()
  },
)

watch(
  [() => props.content, canRender],
  ([content, ok], previous) => {
    if (!ok) {
      blocks.value = []
      return
    }
    // The gate just opened: cached entries predate the sanitizer.
    if (previous && previous[1] === false)
      stream.reset()
    blocks.value = stream.update(content)
  },
  { immediate: true },
)

const resolvedTheme = useAutoTheme(() => props.theme ?? 'auto')

/** Built-in fence dispatch; consumer renderers override per language. */
const BUILT_IN_RENDERERS: Record<string, StreamMarkdownBlockRenderer> = {
  mermaid: TxMermaidBlock,
}

function resolveRenderer(lang: string): StreamMarkdownBlockRenderer {
  const renderer = props.renderers?.[lang]
  // `toRaw` unwraps consumers who handed us a reactive-wrapped map — rendering
  // a reactive component definition is pure overhead (and warns).
  if (renderer)
    return toRaw(renderer)
  return BUILT_IN_RENDERERS[lang] ?? TxCodeBlock
}

/**
 * A fence is safe to render in final form once it closed, once another block
 * follows it, or once the stream settled — only the still-growing tail fence
 * of a live stream stays provisional.
 */
function isBlockClosed(block: StreamBlock, index: number): boolean {
  return block.fenceClosed || index < blocks.value.length - 1 || !props.streaming
}

const tailBlock = computed(() => blocks.value.at(-1) ?? null)

/**
 * The cursor rides inline (::after) only when the tail block ends in an
 * element whose last line is text; lists, tables and fences get a standalone
 * block cursor instead of a stray glyph inside their markup.
 */
const INLINE_CURSOR_RE = /<\/(?:p|h[1-6]|blockquote)>\s*$/

const inlineCursor = computed(() => {
  const tail = tailBlock.value
  return !!tail && tail.type === 'markup' && INLINE_CURSOR_RE.test(tail.html)
})

const showBlockCursor = computed(
  () => props.streaming && blocks.value.length > 0 && !inlineCursor.value,
)

/**
 * A bare fence with nothing in it renders as an empty framed box — all chrome,
 * no content. Models emit these mid-stream (a ``` just arrived) and in
 * fence-about-fences answers; both look broken, neither carries information.
 */
function isSuppressedFence(block: StreamBlock): boolean {
  return !block.lang && !block.code.trim()
}
</script>

<template>
  <div
    class="tx-stream-md"
    :class="[resolvedTheme, { 'is-streaming': streaming }]"
    :data-theme="resolvedTheme"
  >
    <div class="markdown-body">
      <template v-for="(block, index) in blocks" :key="block.id">
        <template v-if="block.type === 'code'">
          <component
            :is="resolveRenderer(block.lang)"
            v-if="!isSuppressedFence(block)"
            class="tx-stream-md__block tx-stream-md__fence"
            :class="{ 'tx-stream-md__block--last': index === blocks.length - 1 }"
            :lang="block.lang"
            :code="block.code"
            :closed="isBlockClosed(block, index)"
            :streaming="streaming"
            :theme="resolvedTheme"
          />
        </template>
        <div
          v-else
          class="tx-stream-md__block tx-stream-md__markup"
          :class="{
            'tx-stream-md__markup--tail': streaming && inlineCursor && index === blocks.length - 1,
            'tx-stream-md__block--last': index === blocks.length - 1,
          }"
          v-html="block.html"
        />
      </template>

      <div v-if="showBlockCursor" class="tx-stream-md__cursor" aria-hidden="true" />
    </div>
  </div>
</template>

<style lang="scss">
@import '../../markdown-view/src/github-markdown.css';

.tx-stream-md {
  font-size: 14px;
  line-height: 1.7;

  // Streaming affordances --------------------------------------------------

  // Blocks animate once, on insertion: settled blocks never remount, so they
  // never replay this; the growing tail patches in place, so it doesn't either.
  &.is-streaming .tx-stream-md__block {
    animation: tx-stream-md-reveal 0.26s ease-out both;
  }

  // The ChatGPT-style line reveal: while streaming, the tail block's bottom
  // edge fades out, so each new line materialises half-transparent and
  // brightens as the next one pushes it up. Opacity-only — active under
  // reduced motion too.
  &.is-streaming .tx-stream-md__block--last {
    -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 2.2em), rgb(0 0 0 / 25%) 100%);
    mask-image: linear-gradient(to bottom, #000 calc(100% - 2.2em), rgb(0 0 0 / 25%) 100%);
  }

  .tx-stream-md__markup--tail > p:last-child::after,
  .tx-stream-md__markup--tail > h1:last-child::after,
  .tx-stream-md__markup--tail > h2:last-child::after,
  .tx-stream-md__markup--tail > h3:last-child::after,
  .tx-stream-md__markup--tail > h4:last-child::after,
  .tx-stream-md__markup--tail > h5:last-child::after,
  .tx-stream-md__markup--tail > h6:last-child::after,
  .tx-stream-md__markup--tail > blockquote:last-child > p:last-child::after {
    content: '▍';
    display: inline-block;
    margin-left: 2px;
    color: var(--tx-color-primary, #409eff);
    animation: tx-stream-md-blink 1s steps(2, start) infinite;
  }

  .tx-stream-md__cursor {
    height: 1.2em;

    &::before {
      content: '▍';
      color: var(--tx-color-primary, #409eff);
      animation: tx-stream-md-blink 1s steps(2, start) infinite;
    }
  }

  // Typography — modelled on ChatGPT web's reading rhythm: roomy line-height,
  // one-em paragraph beats, quiet borders, no filled panels on prose.
  .markdown-body {
    line-height: 1.75;
    word-break: break-word;

    > :first-child {
      margin-top: 0 !important;
    }

    > :last-child {
      margin-bottom: 0 !important;
    }

    h1, h2, h3, h4, h5, h6 {
      margin: 1.6em 0 0.7em;
      font-weight: 600;
      line-height: 1.35;
    }

    h1 { font-size: 1.6em; }
    h2 { font-size: 1.35em; }
    h3 { font-size: 1.15em; }
    h4, h5, h6 { font-size: 1em; }

    p {
      margin: 0 0 1em;
    }

    a {
      color: var(--tx-color-primary, #409eff);
      text-decoration: none;

      &:hover {
        text-decoration: underline;
      }
    }

    strong {
      font-weight: 600;
    }

    ul, ol {
      margin: 0 0 1em;
      padding-left: 1.6em;

      li {
        margin: 0.35em 0;

        &::marker {
          color: var(--tx-text-color-secondary, #6b7280);
        }
      }

      // Nested lists sit inside a li's rhythm, not the block rhythm.
      ul, ol {
        margin: 0.35em 0 0;
      }
    }

    pre {
      margin: 0 0 1em;
      padding: 14px 16px;
      overflow-x: auto;
      border: 1px solid var(--tx-border-color-light, #e4e7ed);
      border-radius: 10px;
      background-color: var(--tx-fill-color-darker, #f6f8fa);

      code {
        display: block;
        padding: 0;
        border-radius: 0;
        background: transparent;
        font-size: 0.85em;
        line-height: 1.65;
        white-space: pre;
      }
    }

    code {
      padding: 0.15em 0.4em;
      border-radius: 5px;
      background-color: var(--tx-fill-color, #f0f2f5);
      font-size: 0.875em;
    }

    blockquote {
      margin: 0 0 1em;
      padding: 0.1em 0 0.1em 1em;
      border-left: 2px solid var(--tx-border-color, #dcdfe6);
      color: var(--tx-text-color-secondary, #606266);

      p:last-child {
        margin-bottom: 0;
      }
    }

    table {
      width: 100%;
      margin: 0 0 1em;
      border-collapse: collapse;
      font-size: 0.95em;

      th, td {
        padding: 8px 12px;
        border: 1px solid var(--tx-border-color-light, #e4e7ed);
        text-align: left;
        vertical-align: top;
      }

      th {
        background-color: var(--tx-fill-color-light, #fafafa);
        font-weight: 600;
      }
    }

    hr {
      margin: 1.8em 0;
      border: none;
      border-top: 1px solid var(--tx-border-color-light, #e4e7ed);
    }

    img {
      max-width: 100%;
      border-radius: 10px;
    }
  }

  &.dark .markdown-body {
    pre {
      background-color: var(--tx-fill-color-darker, #1a1a1a);
      border-color: var(--tx-border-color, #414243);
    }

    code {
      background-color: var(--tx-fill-color, #2a2a2a);
    }

    blockquote {
      border-left-color: var(--tx-border-color, #414243);
    }

    table {
      th {
        background-color: var(--tx-fill-color, #2a2a2a);
      }

      th, td {
        border-color: var(--tx-border-color, #414243);
      }
    }
  }
}

@keyframes tx-stream-md-reveal {
  from {
    opacity: 0.55;
    transform: translateY(3px);
    filter: blur(2px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
    filter: blur(0);
  }
}

@keyframes tx-stream-md-blink {
  50% {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tx-stream-md.is-streaming .tx-stream-md__block {
    animation: none;
  }

  .tx-stream-md .tx-stream-md__markup--tail > :last-child::after,
  .tx-stream-md .tx-stream-md__cursor::before {
    animation: none;
  }
}
</style>
