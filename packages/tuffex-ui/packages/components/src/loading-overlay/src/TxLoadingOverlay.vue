<script setup lang="ts">
import { computed } from 'vue'
import type { CSSProperties } from 'vue'
import type { LoadingOverlayProps } from '../index'
import { TxSpinner } from '../../spinner'

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

const overlayStyle = computed<CSSProperties>(() => {
  return {
    '--tx-loading-overlay-bg': props.background,
  } as CSSProperties
})
</script>

<template>
  <teleport v-if="fullscreen" to="body">
    <div v-if="loading" class="tx-loading-overlay tx-loading-overlay--fullscreen" :style="overlayStyle">
      <div class="tx-loading-overlay__inner">
        <TxSpinner :size="spinnerSize" />
        <div v-if="text" class="tx-loading-overlay__text">{{ text }}</div>
      </div>
    </div>
  </teleport>

  <div v-else class="tx-loading-overlay__container">
    <slot />
    <div v-if="loading" class="tx-loading-overlay" :style="overlayStyle">
      <div class="tx-loading-overlay__inner">
        <TxSpinner :size="spinnerSize" />
        <div v-if="text" class="tx-loading-overlay__text">{{ text }}</div>
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
  z-index: 3000;
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
