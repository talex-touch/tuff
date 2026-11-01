<script lang="ts">
/**
 * Monotonic ids: mermaid.render mounts a temp element per call and ids must not
 * collide. This lives in a plain `<script>` block on purpose — a `<script setup>`
 * body compiles into `setup()`, which would make the counter per-instance and
 * hand every block the same id.
 */
let mermaidIdSeq = 0
</script>

<script setup lang="ts">
import type { ImagePreviewItem } from '../../image-preview/src/types'
import { hasDocument } from '@talex-touch/utils/env'
import { computed, nextTick, onBeforeUnmount, onMounted, onUpdated, ref, watch } from 'vue'
import TxEdgeFadeMask from '../../edge-fade-mask/src/TxEdgeFadeMask.vue'
import TxImagePreview from '../../image-preview/src/TxImagePreview.vue'
import TxCodeBlock from './TxCodeBlock.vue'

defineOptions({ name: 'TxMermaidBlock' })

const props = withDefaults(
  defineProps<{
    lang?: string
    code?: string
    /** False only for the still-growing tail fence of a live stream. */
    closed?: boolean
    streaming?: boolean
    theme?: 'light' | 'dark'
    /** Accessible label for the rendered diagram, which opens the preview. @default 'Zoom diagram' */
    zoomLabel?: string
    /** Accessible name of the fullscreen preview. @default 'Diagram preview' */
    previewLabel?: string
    /** Accessible label for the preview's close button. @default 'Close preview' */
    closeLabel?: string
    /** Shown above the source when the diagram fails to render. @default 'Diagram failed to render — showing source.' */
    errorText?: string
    /** Copy button text of that source fallback. @default 'Copy' */
    copyLabel?: string
    /** Shown on the fallback's copy button after a successful copy. @default 'Copied' */
    copiedLabel?: string
    /** Viewer's save action label. @default 'Download' */
    downloadLabel?: string
    /** Said by the viewer when the source could not be copied. @default 'Could not copy' */
    copyFailedText?: string
    /**
     * Tallest the diagram may draw before it scrolls inside its own frame.
     * A wide, deep chart would otherwise push the whole transcript off screen;
     * the zoom preview still shows it whole. @default 480
     */
    maxHeight?: number
  }>(),
  {
    lang: 'mermaid',
    code: '',
    closed: false,
    streaming: false,
    theme: 'light',
    zoomLabel: 'Zoom diagram',
    previewLabel: 'Diagram preview',
    closeLabel: 'Close preview',
    errorText: 'Diagram failed to render — showing source.',
    copyLabel: 'Copy',
    copiedLabel: 'Copied',
    downloadLabel: 'Download',
    copyFailedText: 'Could not copy',
    maxHeight: 480,
  },
)

const svg = ref<string | null>(null)
const failed = ref(false)
const zoomOpen = ref(false)
const figureRef = ref<HTMLButtonElement | null>(null)
const svgSize = ref({ width: 800, height: 600 })
const previewItems = computed<ImagePreviewItem[]>(() => svg.value
  // The viewer's copy puts the diagram's *source* on the clipboard, which is what a reader
  // wants to paste into a doc or an editor; saving writes the rendered SVG.
  ? [{ type: 'custom', svg: svg.value, copyText: props.code, name: 'diagram', ...svgSize.value }]
  : [])
let renderToken = 0

/**
 * The capped frame's own scroll position. A diagram redrawn (theme flip, a
 * settled fence) keeps the reader where they were instead of snapping to the
 * top; the frame only resets when the diagram itself changes size.
 */
const frameRef = ref<HTMLElement | null>(null)
const maskRef = ref<{ viewport?: HTMLElement | null, refresh?: () => void } | null>(null)
const frameScroll = ref(0)

/**
 * The mask owns the scroll box, so its viewport — not the inner frame — is what
 * scrolls and what the reading position has to be read from.
 */
function onFrameScroll(): void {
  frameScroll.value = maskRef.value?.viewport?.scrollTop ?? 0
}

let boundViewport: HTMLElement | null = null

function bindViewport(): void {
  boundViewport?.removeEventListener('scroll', onFrameScroll)
  boundViewport = maskRef.value?.viewport ?? null
  boundViewport?.addEventListener('scroll', onFrameScroll, { passive: true })
}

onMounted(bindViewport)
onUpdated(bindViewport)
onBeforeUnmount(() => {
  boundViewport?.removeEventListener('scroll', onFrameScroll)
  boundViewport = null
})

// The whole diagram is the zoom preview's job; inside the transcript it must not
// grow past the frame. A redraw after a scroll keeps the same reading position.
watch(svg, () => {
  void nextTick(() => {
    const el = maskRef.value?.viewport
    if (el && frameScroll.value > 0)
      el.scrollTop = frameScroll.value
    maskRef.value?.refresh?.()
    bindViewport()
  })
})

/**
 * Theme rides an init directive in the source instead of `initialize()` so
 * two blocks with different themes never race each other through mermaid's
 * global config. `securityLevel` stays global — it is the same value always.
 */
function themedSource(): string {
  const theme = props.theme === 'dark' ? 'dark' : 'default'
  return `%%{init: {"theme": "${theme}"}}%%\n${props.code}`
}

async function render(): Promise<void> {
  const token = ++renderToken
  failed.value = false

  // mermaid measures text against a real DOM — without one, stay on the skeleton.
  if (!hasDocument())
    return

  try {
    const { default: mermaid } = await import('mermaid')
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })
    const result = await mermaid.render(`tx-mermaid-${++mermaidIdSeq}`, themedSource())
    if (token !== renderToken)
      return
    svg.value = result.svg
    const diagram = new DOMParser().parseFromString(result.svg, 'image/svg+xml').documentElement
    const viewBox = diagram.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number)
    const widthAttr = diagram.getAttribute('width') ?? ''
    const heightAttr = diagram.getAttribute('height') ?? ''
    const width = viewBox?.[2] || (widthAttr.endsWith('%') ? 0 : Number.parseFloat(widthAttr))
    const height = viewBox?.[3] || (heightAttr.endsWith('%') ? 0 : Number.parseFloat(heightAttr))
    svgSize.value = {
      width: Number.isFinite(width) && width > 0 ? width : 800,
      height: Number.isFinite(height) && height > 0 ? height : 600,
    }
  }
  catch {
    if (token !== renderToken)
      return
    // Broken source (or a missing runtime) falls back to showing the code —
    // a diagram that cannot draw is still useful as text.
    svg.value = null
    failed.value = true
  }
}

watch(
  [() => props.code, () => props.closed, () => props.theme],
  () => {
    if (!props.closed) {
      renderToken += 1
      svg.value = null
      failed.value = false
      return
    }
    void render()
  },
  { immediate: true },
)

function openZoom(event: MouseEvent): void {
  // WebKit does not focus a clicked button, and focus comes back to it on closing.
  ;(event.currentTarget as HTMLButtonElement).focus()
  zoomOpen.value = true
}

onBeforeUnmount(() => {
  renderToken += 1
})
</script>

<template>
  <div class="tx-mermaid-block" :class="theme">
    <!-- Strict securityLevel makes mermaid escape node labels, so its svg is
         safe to inject; the raw fence text itself never lands in v-html. -->
    <button
      v-if="svg"
      ref="figureRef"
      type="button"
      class="tx-mermaid-block__figure"
      :aria-label="zoomLabel"
      :style="{ '--tx-mermaid-max-height': `${maxHeight}px` }"
      @click="openZoom"
    >
      <!-- The frame is capped and the mask fades whichever edge can still be
           scrolled toward: a deep chart reads as scrollable, not as truncated. -->
      <TxEdgeFadeMask
        ref="maskRef"
        class="tx-mermaid-block__scroller"
        axis="vertical"
        :size="20"
      >
        <div ref="frameRef" class="tx-mermaid-block__svg" v-html="svg" />
      </TxEdgeFadeMask>
    </button>

    <div v-else-if="failed" class="tx-mermaid-block__fallback">
      <p class="tx-mermaid-block__error" role="alert">
        {{ errorText }}
      </p>
      <TxCodeBlock
        lang="mermaid"
        :code="code"
        :closed="true"
        :theme="theme"
        :copy-label="copyLabel"
        :copied-label="copiedLabel"
      />
    </div>

    <div v-else class="tx-mermaid-block__skeleton" aria-hidden="true">
      <div class="tx-mermaid-block__shimmer" />
      <pre class="tx-mermaid-block__draft"><code>{{ code }}</code></pre>
    </div>

    <TxImagePreview
      v-model:open="zoomOpen"
      :items="previewItems"
      :origin="() => figureRef"
      :label="previewLabel"
      :close-label="closeLabel"
      :actions="['rotate', 'copy', 'download']"
      :copy-label="copyLabel"
      :download-label="downloadLabel"
      :copied-text="copiedLabel"
      :copy-failed-text="copyFailedText"
    >
      <template #item="{ item }">
        <div class="tx-mermaid-block__zoomed" :class="theme" v-html="item.svg" />
      </template>
    </TxImagePreview>
  </div>
</template>

<style lang="scss">
.tx-mermaid-block {
  margin: 16px 0;

  .tx-mermaid-block__figure {
    display: block;
    width: 100%;
    padding: 12px;
    border: 1px solid var(--tx-border-color-light, #e4e7ed);
    border-radius: 8px;
    background: var(--tx-fill-color-blank, #fff);
    cursor: zoom-in;

    &:hover {
      border-color: var(--tx-border-color, #dcdfe6);
    }
  }

  // The cap lives on the mask, which owns the scroll box and fades the edge that
  // can still be scrolled toward; the svg keeps its own size inside it, so a deep
  // chart is scrolled rather than squashed. The zoom preview still shows it whole.
  .tx-mermaid-block__scroller {
    max-height: var(--tx-mermaid-max-height, 480px);
  }

  .tx-mermaid-block__svg {
    display: flex;
    justify-content: center;

    svg {
      max-width: 100%;
      height: auto;
      // A diagram taller than the frame must keep its aspect ratio and scroll,
      // not be compressed to fit.
      flex: none;
    }
  }

  .tx-mermaid-block__error {
    margin: 0 0 8px;
    color: var(--tx-color-danger, #f56c6c);
    font-size: 12px;
  }

  .tx-mermaid-block__skeleton {
    position: relative;
    padding: 12px;
    border: 1px dashed var(--tx-border-color-light, #e4e7ed);
    border-radius: 8px;
    overflow: hidden;
  }

  .tx-mermaid-block__shimmer {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      100deg,
      transparent 30%,
      color-mix(in srgb, var(--tx-fill-color, #f0f2f5) 65%, transparent) 50%,
      transparent 70%
    );
    background-size: 220% 100%;
    animation: tx-mermaid-shimmer 1.6s ease-in-out infinite;
    pointer-events: none;
  }

  .tx-mermaid-block__draft {
    margin: 0;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--tx-text-color-secondary, #6b7280);
    font-size: 12px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
  }

  &.dark {
    .tx-mermaid-block__figure {
      border-color: var(--tx-border-color, #414243);
      background: var(--tx-fill-color-darker, #1a1a1a);
    }

    .tx-mermaid-block__skeleton {
      border-color: var(--tx-border-color, #414243);
    }
  }
}

.tx-mermaid-block__zoomed {
  width: 100%;
  height: 100%;
  border-radius: 12px;
  background: var(--tx-fill-color-blank, #fff);
  overflow: hidden;

  &.dark {
    background: var(--tx-fill-color-darker, #1a1a1a);
  }

  svg {
    width: 100% !important;
    height: 100% !important;
    max-width: none !important;
  }
}

@keyframes tx-mermaid-shimmer {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -20% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tx-mermaid-block .tx-mermaid-block__shimmer {
    animation: none;
  }
}
</style>
