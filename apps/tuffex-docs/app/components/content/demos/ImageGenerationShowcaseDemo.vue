<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

const copy = computed(() => (locale.value === 'zh'
  ? {
      presets: '预设',
      auto: '自动循环',
      reveal: '显示图片',
      hide: '隐藏图片',
      regenerate: '重新生成',
      busy: '生成中',
      hint: '用 handle 控制实例：reveal/hide 手动切换，regenerate 让当前图片碎成像素块再溶入下一张。',
    }
  : {
      presets: 'Presets',
      auto: 'Auto reveal',
      reveal: 'Reveal image',
      hide: 'Hide image',
      regenerate: 'Regenerate',
      busy: 'Generating',
      hint: 'Drive the instance through its handle: reveal/hide toggle manually, regenerate breaks the current image into cells before the next one dissolves in.',
    }))

// Inline SVG so the demo needs no network and no public assets.
function swatch(label: string, from: string, to: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="320" height="320" fill="url(#g)"/><text x="160" y="172" font-family="system-ui, sans-serif" font-size="30" fill="#ffffff" text-anchor="middle">${label}</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const POOL = [
  swatch('A', '#6d5efc', '#22d3ee'),
  swatch('B', '#f97316', '#db2777'),
  swatch('C', '#14b8a6', '#84cc16'),
]

const PRESETS = ['pixels-organic', 'pixels-mechanic', 'sweep-gradient'] as const

const autoReveal = ref(false)
const revealed = ref(false)
const cellRef = ref<{ triggerReveal: (o?: { hold?: 'auto' | 'manual' }) => void, triggerHide: () => void, triggerRegenerate: (o?: { durationMs?: number }) => void, isImageActive: () => boolean } | null>(null)

function reveal() {
  cellRef.value?.triggerReveal({ hold: 'manual' })
  revealed.value = true
}

function hide() {
  cellRef.value?.triggerHide()
  revealed.value = false
}

function regenerate() {
  cellRef.value?.triggerRegenerate({ durationMs: 3000 })
}
</script>

<template>
  <TxFlex direction="column" gap="20px" class="image-generation-demo">
    <TxFlex gap="20px" wrap="wrap">
      <TxFlex v-for="preset in PRESETS" :key="preset" direction="column" gap="8px">
        <span class="image-generation-demo__label">{{ preset }}</span>
        <TxImageGeneration :preset="preset" :images="POOL" :auto-reveal="autoReveal">
          <div class="image-generation-demo__card" />
        </TxImageGeneration>
      </TxFlex>
    </TxFlex>

    <TxFlex direction="column" gap="8px">
      <span class="image-generation-demo__label">{{ copy.busy }}</span>
      <TxImageGeneration ref="cellRef" preset="pixels-mechanic" :images="POOL">
        <div class="image-generation-demo__card" />
      </TxImageGeneration>
      <TxFlex align="center" gap="8px" wrap="wrap">
        <TxButton variant="secondary" @click="reveal">
          {{ copy.reveal }}
        </TxButton>
        <TxButton variant="secondary" @click="hide">
          {{ copy.hide }}
        </TxButton>
        <TxButton variant="secondary" :disabled="!revealed" @click="regenerate">
          {{ copy.regenerate }}
        </TxButton>
      </TxFlex>
    </TxFlex>

    <TxFlex align="center" gap="10px">
      <TxSwitch v-model="autoReveal" />
      <span class="image-generation-demo__hint">{{ copy.auto }}</span>
    </TxFlex>

    <p class="image-generation-demo__hint">
      {{ copy.hint }}
    </p>
  </TxFlex>
</template>

<style scoped>
.image-generation-demo {
  padding: 24px 8px;
}

.image-generation-demo__label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--tx-text-color-secondary);
}

.image-generation-demo__card {
  width: 220px;
  height: 220px;
  border-radius: 18px;
}

.image-generation-demo__hint {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}
</style>
