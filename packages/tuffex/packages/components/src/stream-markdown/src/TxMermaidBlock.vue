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
import { computed, onBeforeUnmount, ref, watch } from 'vue'
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
  },
)

const svg = ref<string | null>(null)
const failed = ref(false)
const zoomOpen = ref(false)
const figureRef = ref<HTMLButtonElement | null>(null)
const svgSize = ref({ width: 800, height: 600 })
const previewItems = computed<ImagePreviewItem[]>(() => svg.value
  ? [{ type: 'custom', svg: svg.value, ...svgSize.value }]
  : [])
let renderToken = 0

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
      @click="openZoom"
    >
      <div class="tx-mermaid-block__svg" v-html="svg" />
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
      :actions="['rotate']"
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

  .tx-mermaid-block__svg {
    display: flex;
    justify-content: center;

    svg {
      max-width: 100%;
      height: auto;
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
