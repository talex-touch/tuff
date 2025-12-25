<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

type Bg = 'blur' | 'glass' | 'mask'
const bg = ref<Bg>('glass')

const glassBlur = ref(true)
const glassBlurAmount = ref(22)
const glassOverlay = ref(true)
const glassOverlayOpacity = ref(0.22)

const cardHostRef = ref<HTMLDivElement | null>(null)
const cardW = ref(320)
const cardH = ref(186)
let ro: ResizeObserver | null = null

const glassW = computed(() => Math.max(1, Math.round(cardW.value)))
const glassH = computed(() => Math.max(1, Math.round(cardH.value)))

function updateCardRect() {
  const el = cardHostRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  cardW.value = rect.width
  cardH.value = rect.height
}

onMounted(() => {
  updateCardRect()
  if (typeof ResizeObserver === 'undefined') return
  if (!cardHostRef.value) return
  ro = new ResizeObserver(() => updateCardRect())
  ro.observe(cardHostRef.value)
})

onBeforeUnmount(() => {
  ro?.disconnect()
  ro = null
})
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 12px; width: 100%;">
    <TxRadioGroup v-model="bg">
      <TxRadio value="blur">blur</TxRadio>
      <TxRadio value="glass">glass</TxRadio>
      <TxRadio value="mask">mask</TxRadio>
    </TxRadioGroup>

    <div v-if="bg === 'glass'" style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center;">
      <label style="display: inline-flex; gap: 8px; align-items: center; font-size: 13px;">
        <span style="opacity: 0.75;">glass blur</span>
        <TxSwitch v-model="glassBlur" />
      </label>

      <label v-if="glassBlur" style="display: inline-flex; gap: 8px; align-items: center; font-size: 13px;">
        <span style="opacity: 0.75;">blur</span>
        <input v-model.number="glassBlurAmount" type="range" min="0" max="40" step="1" />
        <span style="min-width: 30px; text-align: right; opacity: 0.75;">{{ glassBlurAmount }}</span>
      </label>

      <label style="display: inline-flex; gap: 8px; align-items: center; font-size: 13px;">
        <span style="opacity: 0.75;">overlay</span>
        <TxSwitch v-model="glassOverlay" />
      </label>

      <label v-if="glassOverlay" style="display: inline-flex; gap: 8px; align-items: center; font-size: 13px;">
        <span style="opacity: 0.75;">opacity</span>
        <input v-model.number="glassOverlayOpacity" type="range" min="0" max="0.6" step="0.02" />
        <span style="min-width: 42px; text-align: right; opacity: 0.75;">{{ glassOverlayOpacity.toFixed(2) }}</span>
      </label>
    </div>

    <div
      style="
        position: relative;
        height: 420px;
        border-radius: 16px;
        overflow: hidden;
        border: 1px solid rgba(0,0,0,0.08);
        background: #fafbfc;
      "
    >
      <div class="tx-card-bg-scroll">
        <article class="tx-card-bg-article">
          <div class="tx-card-bg-hero"></div>

          <h3 class="tx-card-bg-title">Behind content: Article layout</h3>
          <p class="tx-card-bg-meta">Dec 25, 2025 · 5 min read</p>

          <p class="tx-card-bg-p">
            This demo intentionally uses neutral text and image blocks to help you judge how
            blur / glass / mask behaves on the same background.
          </p>

          <div class="tx-card-bg-grid">
            <div class="tx-card-bg-img"></div>
            <div class="tx-card-bg-img is-light"></div>
          </div>

          <p class="tx-card-bg-p">
            Scroll the content behind. The card stays floating above, similar to a sticky overlay.
            Use the switch to change background.
          </p>

          <div class="tx-card-bg-grid">
            <div class="tx-card-bg-img is-wide"></div>
            <div class="tx-card-bg-img is-wide is-light"></div>
          </div>

          <p class="tx-card-bg-p">End.</p>
          <div style="height: 240px;"></div>
        </article>
      </div>

      <div class="tx-card-bg-overlay">
        <div ref="cardHostRef" class="tx-card-bg-card">
          <TxGlassSurface
            v-if="bg === 'glass'"
            :width="glassW"
            :height="glassH"
            :border-radius="18"
            :background-opacity="0"
            :blur="10"
            :saturation="1.06"
            :opacity="0.38"
            class="tx-card-bg-glass"
          />

          <TxCard
            variant="solid"
            :background="bg"
            shadow="soft"
            :radius="18"
            :padding="14"
            :glass-blur="glassBlur"
            :glass-blur-amount="glassBlurAmount"
            :glass-overlay="glassOverlay"
            :glass-overlay-opacity="glassOverlayOpacity"
            class="tx-card-bg-card__inner"
          >
            <template #header>
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
                <div style="font-weight: 700;">TxCard</div>
                <div style="font-size: 12px; opacity: 0.7;">bg={{ bg }}</div>
              </div>
            </template>

            <div style="display: flex; flex-direction: column; gap: 10px;">
              <div style="height: 12px; border-radius: 999px; background: rgba(0,0,0,0.10);"></div>
              <div style="height: 12px; width: 78%; border-radius: 999px; background: rgba(0,0,0,0.08);"></div>
              <div style="height: 12px; width: 64%; border-radius: 999px; background: rgba(0,0,0,0.08);"></div>
              <div style="display: flex; gap: 8px; margin-top: 6px;">
                <div style="width: 34px; height: 34px; border-radius: 12px; background: rgba(0,0,0,0.10); "></div>
                <div style="flex: 1; display: grid; gap: 6px;">
                  <div style="height: 10px; border-radius: 999px; background: rgba(0,0,0,0.10);"></div>
                  <div style="height: 10px; width: 70%; border-radius: 999px; background: rgba(0,0,0,0.08);"></div>
                </div>
              </div>
            </div>
          </TxCard>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tx-card-bg-scroll {
  position: absolute;
  inset: 0;
  overflow-y: auto;
}

.tx-card-bg-article {
  padding: 22px;
  line-height: 1.7;
}

.tx-card-bg-hero {
  height: 120px;
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(0,0,0,0.06), rgba(0,0,0,0.02));
  border: 1px solid rgba(0,0,0,0.06);
  margin-bottom: 14px;
}

.tx-card-bg-title {
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 700;
  color: rgba(0,0,0,0.86);
}

.tx-card-bg-meta {
  margin: 0 0 14px 0;
  font-size: 12px;
  color: rgba(0,0,0,0.56);
}

.tx-card-bg-p {
  margin: 0 0 14px 0;
  font-size: 13px;
  color: rgba(0,0,0,0.74);
}

.tx-card-bg-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin: 14px 0;
}

.tx-card-bg-img {
  height: 96px;
  border-radius: 12px;
  background: rgba(0,0,0,0.08);
  border: 1px solid rgba(0,0,0,0.06);
}

.tx-card-bg-img.is-light {
  background: rgba(0,0,0,0.05);
}

.tx-card-bg-img.is-wide {
  height: 120px;
}

.tx-card-bg-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 22px;
  pointer-events: none;
}

.tx-card-bg-card {
  position: relative;
  width: 100%;
  max-width: 320px;
  pointer-events: auto;
}

.tx-card-bg-glass {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.tx-card-bg-card__inner {
  position: relative;
  z-index: 1;
}
</style>
