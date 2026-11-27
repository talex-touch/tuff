<script setup lang="ts">
import type { DeviceMockupPreset } from '@talex-touch/tuffex/device-mockup'
import { browserArc } from '@talex-touch/tuffex/device-mockup/presets/browser'
import { macbookPro14 } from '@talex-touch/tuffex/device-mockup/presets/desktop'
import { iphone17Pro } from '@talex-touch/tuffex/device-mockup/presets/ios'
import { pixelWatch3 } from '@talex-touch/tuffex/device-mockup/presets/watch'
import { computed, ref } from 'vue'
import { useGalleryLoop } from './use-gallery-loop'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const FRAMES: readonly DeviceMockupPreset[] = [
  iphone17Pro,
  macbookPro14,
  pixelWatch3,
  browserArc,
]

const index = ref(0)
useGalleryLoop(() => {
  index.value = (index.value + 1) % FRAMES.length
}, 2600, 2200)

const current = computed(() => FRAMES[index.value]!)
</script>

<template>
  <div class="docs-gallery__device-mockup">
    <div class="docs-gallery__device-stage">
      <TxDeviceMockup
        :device="current"
        frame-style="default"
        finish="titanium"
        shadow="grounded"
        animated
        fit="contain"
        :max-width="220"
        :max-height="136"
        :show-status-bar="current.id === 'iphone-17-pro'"
        status-bar-theme="dark"
        browser-theme="dark"
        browser-url="tuff.tagzxia.com"
      >
        <div
          class="docs-gallery__device-screen"
          :class="{ 'is-circle': current.shape === 'circle' }"
        >
          <span class="docs-gallery__device-pill" />
          <span class="docs-gallery__device-card" />
          <span class="docs-gallery__device-bar" />
          <span class="docs-gallery__device-bar is-short" />
        </div>
      </TxDeviceMockup>
    </div>
    <span class="docs-gallery__device-caption">
      {{ current.shortName }} · {{ zh ? '75 款预设' : '75 presets' }}
    </span>
  </div>
</template>

<style scoped>
.docs-gallery__device-mockup {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.docs-gallery__device-stage {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 140px;
}

.docs-gallery__device-screen {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 20% 14% 14%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8%;
  background:
    radial-gradient(circle at 80% 18%, rgba(56, 189, 248, 0.34), transparent 52%),
    linear-gradient(155deg, #0b1120 0%, #1e1b4b 58%, #0f172a 100%);
}

.docs-gallery__device-screen.is-circle {
  align-items: center;
  padding: 24% 20%;
}

.docs-gallery__device-pill {
  width: 34%;
  height: 9%;
  border-radius: 999px;
  background: rgba(125, 211, 252, 0.88);
}

.docs-gallery__device-card {
  width: 100%;
  height: 36%;
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(56, 189, 248, 0.28), rgba(129, 140, 248, 0.24));
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.16);
}

.docs-gallery__device-bar {
  width: 78%;
  height: 8%;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
}

.docs-gallery__device-bar.is-short {
  width: 52%;
  background: rgba(255, 255, 255, 0.34);
}

.docs-gallery__device-caption {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}
</style>
