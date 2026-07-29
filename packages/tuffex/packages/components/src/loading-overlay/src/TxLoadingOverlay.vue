<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { LoadingOverlayProps } from '../index'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { TxSpinner } from '../../spinner'
import { getZIndex, nextZIndex } from '../../../../utils/z-index-manager'

defineOptions({
  name: 'TxLoadingOverlay',
})

const props = withDefaults(defineProps<LoadingOverlayProps>(), {
  loading: false,
  fullscreen: false,
  text: '',
  spinnerSize: 18,
  background: 'color-mix(in srgb, var(--tx-bg-color, #fff) 70%, transparent)',
})

const zIndex = ref(getZIndex())

const overlayStyle = computed<CSSProperties>(() => {
  return {
    '--tx-loading-overlay-bg': props.background,
  } as CSSProperties
})

const overlayRef = ref<HTMLElement | null>(null)
let restoreFocus: HTMLElement | null = null

watch(
  () => props.loading && props.fullscreen,
  (open) => {
    if (open) {
      zIndex.value = nextZIndex()
      // Park focus on the blocking overlay so keyboard users can't Tab to the page
      // behind a fullscreen loading state, and remember where to return afterwards.
      restoreFocus = (document.activeElement as HTMLElement | null) ?? null
      nextTick(() => {
        overlayRef.value?.focus()
      })
    }
    else if (restoreFocus) {
      restoreFocus.focus?.()
      restoreFocus = null
    }
  },
  { immediate: true },
)

function onFullscreenKeydown(event: KeyboardEvent) {
  // The fullscreen overlay has no interactive content, so trap Tab to keep focus
  // parked here — the flow "cannot continue in parallel" while loading.
  if (event.key === 'Tab')
    event.preventDefault()
}

onBeforeUnmount(() => {
  if (restoreFocus) {
    restoreFocus.focus?.()
    restoreFocus = null
  }
})
</script>

<template>
  <teleport v-if="fullscreen" to="body">
    <div
      v-if="loading"
      ref="overlayRef"
      class="tx-loading-overlay tx-loading-overlay--fullscreen"
      :style="[overlayStyle, { zIndex }]"
      role="status"
      aria-live="polite"
      aria-busy="true"
      tabindex="-1"
      @keydown="onFullscreenKeydown"
    >
      <div class="tx-loading-overlay__inner">
        <TxSpinner :size="spinnerSize" />
        <div v-if="text" class="tx-loading-overlay__text">
          {{ text }}
        </div>
      </div>
    </div>
  </teleport>

  <div v-else class="tx-loading-overlay__container" :aria-busy="loading || undefined">
    <slot />
    <div
      v-if="loading"
      class="tx-loading-overlay"
      :style="overlayStyle"
      role="status"
      aria-live="polite"
    >
      <div class="tx-loading-overlay__inner">
        <TxSpinner :size="spinnerSize" />
        <div v-if="text" class="tx-loading-overlay__text">
          {{ text }}
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss">
.tx-loading-overlay__container {
  position: relative;
}

.tx-loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--tx-loading-overlay-bg);
  backdrop-filter: blur(10px) saturate(140%);
  -webkit-backdrop-filter: blur(10px) saturate(140%);
  z-index: 1;
}

.tx-loading-overlay--fullscreen {
  position: fixed;
}

.tx-loading-overlay__inner {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--tx-bg-color, #fff) 80%, transparent);
  border: 1px solid var(--tx-border-color-light, #e4e7ed);
  color: var(--tx-text-color-secondary, #909399);
}

.tx-loading-overlay__text {
  font-size: 12px;
  line-height: 1.2;
}
</style>
