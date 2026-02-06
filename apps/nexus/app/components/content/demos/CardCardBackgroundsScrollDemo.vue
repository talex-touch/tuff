<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const bg = ref('')
const glassBlur = ref('')
const glassBlurAmount = ref('')
const glassH = ref('')
const glassOverlay = ref('')
const glassOverlayOpacity = ref('')
const glassW = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
      <div style="display: flex; flex-direction: column; gap: 12px; width: 100%;">
        <TxRadioGroup v-model="bg">
          <TxRadio value="blur">
            blur
          </TxRadio>
          <TxRadio value="glass">
            glass
          </TxRadio>
          <TxRadio value="mask">
            mask
          </TxRadio>
        </TxRadioGroup>

        <div v-if="bg === 'glass'" style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center;">
          <label style="display: inline-flex; gap: 8px; align-items: center; font-size: 13px;">
            <span style="opacity: 0.75;">glass blur</span>
            <TxSwitch v-model="glassBlur" />
          </label>

          <label v-if="glassBlur" style="display: inline-flex; gap: 8px; align-items: center; font-size: 13px;">
            <span style="opacity: 0.75;">blur</span>
            <input v-model.number="glassBlurAmount" type="range" min="0" max="40" step="1">
            <span style="min-width: 30px; text-align: right; opacity: 0.75;">{{ glassBlurAmount }}</span>
          </label>

          <label style="display: inline-flex; gap: 8px; align-items: center; font-size: 13px;">
            <span style="opacity: 0.75;">overlay</span>
            <TxSwitch v-model="glassOverlay" />
          </label>

          <label v-if="glassOverlay" style="display: inline-flex; gap: 8px; align-items: center; font-size: 13px;">
            <span style="opacity: 0.75;">opacity</span>
            <input v-model.number="glassOverlayOpacity" type="range" min="0" max="0.6" step="0.02">
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
              <div class="tx-card-bg-hero" />

              <h3 class="tx-card-bg-title">
                Behind content: Article layout
              </h3>
              <p class="tx-card-bg-meta">
                Dec 25, 2025 · 5 min read
              </p>

              <p class="tx-card-bg-p">
                This demo intentionally uses neutral text and image blocks to help you judge how
                blur / glass / mask behaves on the same background.
              </p>

              <div class="tx-card-bg-grid">
                <div class="tx-card-bg-img" />
                <div class="tx-card-bg-img is-light" />
              </div>

              <p class="tx-card-bg-p">
                Scroll the content behind. The card stays floating above, similar to a sticky overlay.
                Use the switch to change background.
              </p>

              <div class="tx-card-bg-grid">
                <div class="tx-card-bg-img is-wide" />
                <div class="tx-card-bg-img is-wide is-light" />
              </div>

              <p class="tx-card-bg-p">
                End.
              </p>
              <div style="height: 240px;" />
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
                    <div style="font-weight: 700;">
                      TxCard
                    </div>
                    <div style="font-size: 12px; opacity: 0.7;">
                      bg={{ bg }}
                    </div>
                  </div>
                </template>

                <div style="display: flex; flex-direction: column; gap: 10px;">
                  <div style="height: 12px; border-radius: 999px; background: rgba(0,0,0,0.10);" />
                  <div style="height: 12px; width: 78%; border-radius: 999px; background: rgba(0,0,0,0.08);" />
                  <div style="height: 12px; width: 64%; border-radius: 999px; background: rgba(0,0,0,0.08);" />
                  <div style="display: flex; gap: 8px; margin-top: 6px;">
                    <div style="width: 34px; height: 34px; border-radius: 12px; background: rgba(0,0,0,0.10); " />
                    <div style="flex: 1; display: grid; gap: 6px;">
                      <div style="height: 10px; border-radius: 999px; background: rgba(0,0,0,0.10);" />
                      <div style="height: 10px; width: 70%; border-radius: 999px; background: rgba(0,0,0,0.08);" />
                    </div>
                  </div>
                </div>
              </TxCard>
            </div>
          </div>
        </div>
      </div>
  </div>
  <div v-else>
      <div style="display: flex; flex-direction: column; gap: 12px; width: 100%;">
        <TxRadioGroup v-model="bg">
          <TxRadio value="blur">
            blur
          </TxRadio>
          <TxRadio value="glass">
            glass
          </TxRadio>
          <TxRadio value="mask">
            mask
          </TxRadio>
        </TxRadioGroup>

        <div v-if="bg === 'glass'" style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center;">
          <label style="display: inline-flex; gap: 8px; align-items: center; font-size: 13px;">
            <span style="opacity: 0.75;">glass blur</span>
            <TxSwitch v-model="glassBlur" />
          </label>

          <label v-if="glassBlur" style="display: inline-flex; gap: 8px; align-items: center; font-size: 13px;">
            <span style="opacity: 0.75;">blur</span>
            <input v-model.number="glassBlurAmount" type="range" min="0" max="40" step="1">
            <span style="min-width: 30px; text-align: right; opacity: 0.75;">{{ glassBlurAmount }}</span>
          </label>

          <label style="display: inline-flex; gap: 8px; align-items: center; font-size: 13px;">
            <span style="opacity: 0.75;">overlay</span>
            <TxSwitch v-model="glassOverlay" />
          </label>

          <label v-if="glassOverlay" style="display: inline-flex; gap: 8px; align-items: center; font-size: 13px;">
            <span style="opacity: 0.75;">opacity</span>
            <input v-model.number="glassOverlayOpacity" type="range" min="0" max="0.6" step="0.02">
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
              <div class="tx-card-bg-hero" />

              <h3 class="tx-card-bg-title">
                Behind content: Article layout
              </h3>
              <p class="tx-card-bg-meta">
                Dec 25, 2025 · 5 min read
              </p>

              <p class="tx-card-bg-p">
                This demo intentionally uses neutral text and image blocks to help you judge how
                blur / glass / mask behaves on the same background.
              </p>

              <div class="tx-card-bg-grid">
                <div class="tx-card-bg-img" />
                <div class="tx-card-bg-img is-light" />
              </div>

              <p class="tx-card-bg-p">
                Scroll the content behind. The card stays floating above, similar to a sticky overlay.
                Use the switch to change background.
              </p>

              <div class="tx-card-bg-grid">
                <div class="tx-card-bg-img is-wide" />
                <div class="tx-card-bg-img is-wide is-light" />
              </div>

              <p class="tx-card-bg-p">
                End.
              </p>
              <div style="height: 240px;" />
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
                    <div style="font-weight: 700;">
                      TxCard
                    </div>
                    <div style="font-size: 12px; opacity: 0.7;">
                      bg={{ bg }}
                    </div>
                  </div>
                </template>

                <div style="display: flex; flex-direction: column; gap: 10px;">
                  <div style="height: 12px; border-radius: 999px; background: rgba(0,0,0,0.10);" />
                  <div style="height: 12px; width: 78%; border-radius: 999px; background: rgba(0,0,0,0.08);" />
                  <div style="height: 12px; width: 64%; border-radius: 999px; background: rgba(0,0,0,0.08);" />
                  <div style="display: flex; gap: 8px; margin-top: 6px;">
                    <div style="width: 34px; height: 34px; border-radius: 12px; background: rgba(0,0,0,0.10); " />
                    <div style="flex: 1; display: grid; gap: 6px;">
                      <div style="height: 10px; border-radius: 999px; background: rgba(0,0,0,0.10);" />
                      <div style="height: 10px; width: 70%; border-radius: 999px; background: rgba(0,0,0,0.08);" />
                    </div>
                  </div>
                </div>
              </TxCard>
            </div>
          </div>
        </div>
      </div>
  </div>
</template>
