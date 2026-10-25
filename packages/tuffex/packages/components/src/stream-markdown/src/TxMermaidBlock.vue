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
import { hasDocument } from '@talex-touch/utils/env'
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { lockBodyScroll, unlockBodyScroll } from '../../../../utils/body-scroll-lock'
import { createFocusReturn, trapTab } from '../../../../utils/focus-trap'
import { isTopmostModalDialog, useZIndexAllocator } from '../../../../utils/z-index-manager'
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
// The fullscreen preview joins the shared overlay stack instead of pinning a
// literal above the seed, so later dialogs/drawers still stack above it.
const zIndexAllocator = useZIndexAllocator()
const overlayZIndex = ref(zIndexAllocator.get())
const overlayRef = ref<HTMLElement | null>(null)
const closeRef = ref<HTMLButtonElement | null>(null)
// Focus moves into the preview, stays there, and goes back to the diagram once it closes.
const focusReturn = createFocusReturn()
// Whether the preview holds a page scroll lock. A close in the same tick as an unmount never
// reaches the watcher below, so the unmount lets go of this one, and of no other overlay's.
let holdsScrollLock = false
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

function closeZoom(): void {
  zoomOpen.value = false
}

function handleKeydown(event: KeyboardEvent): void {
  const root = overlayRef.value
  if (event.defaultPrevented || !root || !isTopmostModalDialog(root))
    return
  if (event.key === 'Escape') {
    event.preventDefault()
    closeZoom()
  }
  else if (event.key === 'Tab') {
    // aria-modal promises the page behind is inert, so Tab stays inside.
    trapTab(event, root)
  }
}

function releaseScrollLock(): void {
  if (!holdsScrollLock)
    return
  holdsScrollLock = false
  unlockBodyScroll()
}

watch(zoomOpen, (open) => {
  if (!hasDocument())
    return
  if (open) {
    overlayZIndex.value = zIndexAllocator.next()
    focusReturn.save()
    // The page behind holds still: the wheel over the dim, or past the end of a tall diagram,
    // would scroll it.
    lockBodyScroll()
    holdsScrollLock = true
    document.addEventListener('keydown', handleKeydown)
    void nextTick(() => closeRef.value?.focus({ preventScroll: true }))
  }
  else {
    document.removeEventListener('keydown', handleKeydown)
    releaseScrollLock()
    focusReturn.restore()
  }
})

onBeforeUnmount(() => {
  if (hasDocument())
    document.removeEventListener('keydown', handleKeydown)
  releaseScrollLock()
  focusReturn.restore()
})
</script>

<template>
  <div class="tx-mermaid-block" :class="theme">
    <!-- Strict securityLevel makes mermaid escape node labels, so its svg is
         safe to inject; the raw fence text itself never lands in v-html. -->
    <button
      v-if="svg"
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

    <Teleport v-if="zoomOpen" to="body">
      <div
        ref="overlayRef"
        class="tx-mermaid-block__overlay"
        role="dialog"
        aria-modal="true"
        :aria-label="previewLabel"
        :style="{ zIndex: overlayZIndex }"
        @click.self="closeZoom"
      >
        <button
          ref="closeRef"
          type="button"
          class="tx-mermaid-block__close"
          :aria-label="closeLabel"
          @click="closeZoom"
        >
          ×
        </button>
        <!-- Focusable, so the keys scroll a diagram taller than the screen. -->
        <div
          class="tx-mermaid-block__zoomed"
          role="region"
          :aria-label="previewLabel"
          tabindex="0"
          v-html="svg"
        />
      </div>
    </Teleport>
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

.tx-mermaid-block__overlay {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 48px;
  background: color-mix(in srgb, var(--tx-color-black, #000) 55%, transparent);
  animation: tx-mermaid-fade 0.22s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.tx-mermaid-block__zoomed {
  max-width: min(1200px, 92vw);
  max-height: 88vh;
  padding: 24px;
  border-radius: 12px;
  background: var(--tx-fill-color-blank, #fff);
  overflow: auto;

  svg {
    width: 100%;
    height: auto;
  }
}

.tx-mermaid-block__close {
  position: absolute;
  top: 18px;
  right: 22px;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 999px;
  background: color-mix(in srgb, var(--tx-color-black, #000) 40%, transparent);
  color: var(--tx-color-white, #fff);
  font-size: 19px;
  line-height: 1;
  cursor: pointer;
}

@keyframes tx-mermaid-shimmer {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -20% 0;
  }
}

@keyframes tx-mermaid-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tx-mermaid-block .tx-mermaid-block__shimmer,
  .tx-mermaid-block__overlay {
    animation: none;
  }
}
</style>
