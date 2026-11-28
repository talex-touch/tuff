<script setup lang="ts">
import type {
  DeviceMockupFinish,
  DeviceMockupFrameStyle,
  DeviceMockupFraming,
  DeviceMockupGradientPreset,
  DeviceMockupPerspective,
  DeviceMockupPreset,
  DeviceMockupShadowVariant,
} from '@talex-touch/tuffex/device-mockup'
import type { TxSelectModelValue, TxSelectOption } from '@talex-touch/tuffex/select'
import { DEVICE_MOCKUP_GRADIENTS } from '@talex-touch/tuffex/device-mockup'
import { browserArc } from '@talex-touch/tuffex/device-mockup/presets/browser'
import { macbookPro14 } from '@talex-touch/tuffex/device-mockup/presets/desktop'
import { iphone17Pro } from '@talex-touch/tuffex/device-mockup/presets/ios'
import { pixelWatch3 } from '@talex-touch/tuffex/device-mockup/presets/watch'
import { computed, ref } from 'vue'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const DEVICES: readonly { id: string, label: string, preset: DeviceMockupPreset }[] = [
  { id: 'iphone-17-pro', label: 'iPhone', preset: iphone17Pro },
  { id: 'macbook-pro-14', label: 'MacBook', preset: macbookPro14 },
  { id: 'pixel-watch-3', label: 'Watch', preset: pixelWatch3 },
  { id: 'browser-arc', label: 'Arc', preset: browserArc },
]

const FRAME_SEGMENTS: readonly { id: DeviceMockupFrameStyle, en: string, zh: string }[] = [
  { id: 'default', en: 'Hardware', zh: '金属机身' },
  { id: 'liquid-glass', en: 'Liquid Glass', zh: '琉光玻璃' },
  { id: 'glass-dark', en: 'Glass', zh: '烟熏玻璃' },
  { id: 'outline', en: 'Outline', zh: '极简描边' },
  { id: 'frameless', en: 'Frameless', zh: '无边框' },
]

const PERSPECTIVE_SEGMENTS: readonly { id: DeviceMockupPerspective, en: string, zh: string }[] = [
  { id: 'flat', en: 'Flat', zh: '平面' },
  { id: 'tilt-left', en: 'Tilt Left', zh: '左倾' },
  { id: 'tilt-right', en: 'Tilt Right', zh: '右倾' },
  { id: 'isometric', en: 'Isometric', zh: '等距' },
  { id: 'angled-low', en: 'Low', zh: '仰视' },
]

const FINISHES: readonly { id: DeviceMockupFinish, swatch: string, en: string, zh: string }[] = [
  { id: 'obsidian', swatch: '#18181b', en: 'Obsidian', zh: '曜石黑' },
  { id: 'silver', swatch: '#d9dde3', en: 'Silver', zh: '星光银' },
  { id: 'titanium', swatch: '#bfb8ad', en: 'Titanium', zh: '原色钛' },
  { id: 'graphite', swatch: '#3f424a', en: 'Graphite', zh: '石墨灰' },
]

const BACKDROP_MOODS: readonly { id: DeviceMockupGradientPreset, en: string, zh: string }[] = [
  { id: 'aurora', en: 'Aurora', zh: '极光' },
  { id: 'sunset', en: 'Sunset', zh: '落日' },
  { id: 'ocean', en: 'Ocean', zh: '深海' },
  { id: 'peach', en: 'Peach', zh: '暖桃' },
  { id: 'graphite', en: 'Graphite', zh: '石墨棚拍' },
]

const activeDevice = ref<DeviceMockupPreset>(iphone17Pro)
const frameStyle = ref<DeviceMockupFrameStyle>('default')
const perspective = ref<DeviceMockupPerspective>('isometric')
const shadow = ref<DeviceMockupShadowVariant>('grounded')
const framing = ref<DeviceMockupFraming>('center')
const finish = ref<DeviceMockupFinish>('titanium')
const gradientPreset = ref<DeviceMockupGradientPreset>('aurora')
const screenGlare = ref(true)

const shadowOptions = computed<TxSelectOption[]>(() => (zh.value
  ? [
      { value: 'none', label: '无阴影' },
      { value: 'soft', label: '柔和阴影' },
      { value: 'crisp', label: '锐利阴影' },
      { value: 'grounded', label: '着地阴影' },
      { value: 'elevated', label: '抬升阴影' },
      { value: 'dramatic', label: '戏剧阴影' },
      { value: 'ambient', label: '氛围光影' },
    ]
  : [
      { value: 'none', label: 'No shadow' },
      { value: 'soft', label: 'Soft' },
      { value: 'crisp', label: 'Crisp' },
      { value: 'grounded', label: 'Grounded' },
      { value: 'elevated', label: 'Elevated' },
      { value: 'dramatic', label: 'Dramatic' },
      { value: 'ambient', label: 'Ambient' },
    ]))

const framingOptions = computed<TxSelectOption[]>(() => (zh.value
  ? [
      { value: 'center', label: '居中构图' },
      { value: 'bleed-bottom', label: '底部出血' },
      { value: 'bleed-right', label: '右侧入画' },
      { value: 'bleed-left', label: '左侧入画' },
      { value: 'float', label: '悬浮居中' },
    ]
  : [
      { value: 'center', label: 'Center' },
      { value: 'bleed-bottom', label: 'Bleed Bottom' },
      { value: 'bleed-right', label: 'Bleed Right' },
      { value: 'bleed-left', label: 'Bleed Left' },
      { value: 'float', label: 'Float' },
    ]))

const isWideDevice = computed(() =>
  activeDevice.value.category === 'desktop' || activeDevice.value.category === 'browser',
)
const isCircleWatch = computed(() => activeDevice.value.shape === 'circle')

const copy = computed(() => (zh.value
  ? {
      frameAria: '边框风格',
      viewAria: '3D 视角',
      deviceAria: '预览机型',
      shadowAria: '阴影风格',
      framingAria: '构图方式',
      finishAria: '机身配色',
      backdropAria: '背景光效',
      glare: '反光',
      kicker: '空间音频 · 无损母带',
      albumTitle: '夜航序曲',
      albumArtist: 'Tuff Acoustics · 2026',
      live: 'LIVE',
      m1Label: '采样深度',
      m2Label: '动态范围',
      m3Label: '刷新率',
      upNext: '下一曲 · 极光海岸',
      watchTitle: '专注模式',
      watchMetric: '94%',
      watchSub: '已持续 42 分钟',
    }
  : {
      frameAria: 'Frame style',
      viewAria: '3D view',
      deviceAria: 'Preview device',
      shadowAria: 'Shadow style',
      framingAria: 'Framing mode',
      finishAria: 'Hardware finish',
      backdropAria: 'Backdrop mood',
      glare: 'Glare',
      kicker: 'SPATIAL AUDIO · LOSSLESS',
      albumTitle: 'Midnight Transit',
      albumArtist: 'Tuff Acoustics · 2026',
      live: 'LIVE',
      m1Label: 'Bit depth',
      m2Label: 'Dynamic',
      m3Label: 'Display',
      upNext: 'Up Next · Northern Horizon',
      watchTitle: 'Focus',
      watchMetric: '94%',
      watchSub: '42 min elapsed',
    }))

function onShadowChange(value: TxSelectModelValue): void {
  if (typeof value === 'string')
    shadow.value = value as DeviceMockupShadowVariant
}

function onFramingChange(value: TxSelectModelValue): void {
  if (typeof value === 'string')
    framing.value = value as DeviceMockupFraming
}
</script>

<template>
  <div class="not-prose dm-styles-demo">
    <div class="dm-styles-demo__stage">
      <TxDeviceMockup
        :device="activeDevice"
        :frame-style="frameStyle"
        :finish="finish"
        :perspective="perspective"
        :shadow="shadow"
        :framing="framing"
        :screen-glare="screenGlare"
        interactive-tilt
        animated
        status-bar-theme="dark"
        browser-theme="dark"
        backdrop="mesh"
        :gradient-preset="gradientPreset"
        backdrop-noise
        fit="contain"
        :max-height="390"
        :stage-padding="32"
        browser-url="https://tuff.tagzxia.com/studio"
        browser-title="Tuff Acoustics"
      >
        <div
          class="dm-editorial"
          :class="{
            'is-wide': isWideDevice,
            'is-circle': isCircleWatch,
          }"
        >
          <template v-if="isCircleWatch">
            <div class="dm-editorial__watch">
              <span class="dm-editorial__watch-label">{{ copy.watchTitle }}</span>
              <div class="dm-editorial__watch-dial">
                <strong>{{ copy.watchMetric }}</strong>
              </div>
              <small>{{ copy.watchSub }}</small>
            </div>
          </template>

          <template v-else>
            <header class="dm-editorial__top">
              <span class="dm-editorial__kicker">{{ copy.kicker }}</span>
              <span class="dm-editorial__live">{{ copy.live }}</span>
            </header>

            <div class="dm-editorial__main">
              <div class="dm-editorial__artwork">
                <div class="dm-editorial__orb dm-editorial__orb--a" aria-hidden="true" />
                <div class="dm-editorial__orb dm-editorial__orb--b" aria-hidden="true" />
                <div class="dm-editorial__wave" aria-hidden="true">
                  <span /><span /><span /><span /><span /><span /><span />
                </div>
                <div class="dm-editorial__art-foot">
                  <strong>{{ copy.albumTitle }}</strong>
                  <span>{{ copy.albumArtist }}</span>
                </div>
              </div>

              <div class="dm-editorial__details">
                <div class="dm-editorial__stats">
                  <div class="dm-editorial__stat">
                    <small>{{ copy.m1Label }}</small>
                    <strong>24-bit</strong>
                  </div>
                  <div class="dm-editorial__stat">
                    <small>{{ copy.m2Label }}</small>
                    <strong>118 dB</strong>
                  </div>
                  <div class="dm-editorial__stat">
                    <small>{{ copy.m3Label }}</small>
                    <strong>120 Hz</strong>
                  </div>
                </div>

                <div class="dm-editorial__progress">
                  <div class="dm-editorial__track">
                    <span class="dm-editorial__fill" />
                  </div>
                  <div class="dm-editorial__times">
                    <span>02:14</span>
                    <span>04:38</span>
                  </div>
                </div>

                <div class="dm-editorial__queue">
                  <i class="i-carbon-play" aria-hidden="true" />
                  <span>{{ copy.upNext }}</span>
                </div>
              </div>
            </div>

            <footer class="dm-editorial__dock" aria-hidden="true">
              <span class="is-on"><i class="i-carbon-home" /></span>
              <span><i class="i-carbon-layers" /></span>
              <span><i class="i-carbon-cube" /></span>
              <span><i class="i-carbon-color-palette" /></span>
            </footer>
          </template>
        </div>
      </TxDeviceMockup>
    </div>

    <div class="dm-styles-demo__bar">
      <div class="dm-styles-demo__row">
        <div class="dm-styles-demo__seg-group" role="group" :aria-label="copy.frameAria">
          <button
            v-for="item in FRAME_SEGMENTS"
            :key="item.id"
            type="button"
            class="dm-styles-demo__seg"
            :class="{ 'is-active': frameStyle === item.id }"
            :aria-pressed="frameStyle === item.id"
            @click="frameStyle = item.id"
          >
            {{ zh ? item.zh : item.en }}
          </button>
        </div>

        <div class="dm-styles-demo__seg-group" role="group" :aria-label="copy.viewAria">
          <button
            v-for="item in PERSPECTIVE_SEGMENTS"
            :key="item.id"
            type="button"
            class="dm-styles-demo__seg"
            :class="{ 'is-active': perspective === item.id }"
            :aria-pressed="perspective === item.id"
            @click="perspective = item.id"
          >
            {{ zh ? item.zh : item.en }}
          </button>
        </div>
      </div>

      <div class="dm-styles-demo__row dm-styles-demo__row--compact">
        <div class="dm-styles-demo__seg-group" role="group" :aria-label="copy.deviceAria">
          <button
            v-for="item in DEVICES"
            :key="item.id"
            type="button"
            class="dm-styles-demo__seg"
            :class="{ 'is-active': activeDevice.id === item.id }"
            :aria-pressed="activeDevice.id === item.id"
            @click="activeDevice = item.preset"
          >
            {{ item.label }}
          </button>
        </div>

        <div class="dm-styles-demo__select-group">
          <div class="dm-styles-demo__select-box">
            <TxSelect
              :model-value="shadow"
              :options="shadowOptions"
              :searchable="false"
              :aria-label="copy.shadowAria"
              @update:model-value="onShadowChange"
            />
          </div>
          <div class="dm-styles-demo__select-box">
            <TxSelect
              :model-value="framing"
              :options="framingOptions"
              :searchable="false"
              :aria-label="copy.framingAria"
              @update:model-value="onFramingChange"
            />
          </div>
        </div>

        <div class="dm-styles-demo__swatch-bar">
          <div class="dm-styles-demo__swatches" role="group" :aria-label="copy.finishAria">
            <button
              v-for="item in FINISHES"
              :key="item.id"
              type="button"
              class="dm-styles-demo__swatch"
              :class="{ 'is-active': finish === item.id }"
              :style="{ background: item.swatch }"
              :title="zh ? item.zh : item.en"
              :aria-label="zh ? item.zh : item.en"
              :aria-pressed="finish === item.id"
              @click="finish = item.id"
            />
          </div>

          <span class="dm-styles-demo__divider" aria-hidden="true" />

          <div class="dm-styles-demo__swatches" role="group" :aria-label="copy.backdropAria">
            <button
              v-for="mood in BACKDROP_MOODS"
              :key="mood.id"
              type="button"
              class="dm-styles-demo__swatch"
              :class="{ 'is-active': gradientPreset === mood.id }"
              :style="{ background: DEVICE_MOCKUP_GRADIENTS[mood.id].css }"
              :title="zh ? mood.zh : mood.en"
              :aria-label="zh ? mood.zh : mood.en"
              :aria-pressed="gradientPreset === mood.id"
              @click="gradientPreset = mood.id"
            />
          </div>
        </div>

        <TxSwitch v-model="screenGlare" size="small" :label="copy.glare" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.dm-styles-demo {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.dm-styles-demo__stage {
  min-height: 400px;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter);
}

.dm-styles-demo__bar {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dm-styles-demo__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.dm-styles-demo__row--compact {
  justify-content: flex-start;
  gap: 10px 14px;
}

.dm-styles-demo__seg-group {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 3px;
  padding: 3px;
  border-radius: 11px;
  background: var(--tx-fill-color-light);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter);
}

.dm-styles-demo__seg {
  appearance: none;
  border: 0;
  height: 28px;
  padding: 0 10px;
  border-radius: 8px;
  background: transparent;
  color: var(--tx-text-color-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.dm-styles-demo__seg:hover {
  color: var(--tx-text-color-primary);
}

.dm-styles-demo__seg.is-active {
  background: var(--tx-bg-color);
  color: var(--tx-text-color-primary);
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.08),
    inset 0 0 0 1px var(--tx-border-color-lighter);
}

.dm-styles-demo__seg:focus-visible,
.dm-styles-demo__swatch:focus-visible {
  outline: 2px solid var(--tx-color-primary);
  outline-offset: 2px;
}

.dm-styles-demo__select-group {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.dm-styles-demo__select-box {
  width: 132px;
}

.dm-styles-demo__select-box :deep(.tuff-select) {
  width: 100%;
}

.dm-styles-demo__swatch-bar {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.dm-styles-demo__divider {
  width: 1px;
  height: 14px;
  background: var(--tx-border-color);
  opacity: 0.7;
}

.dm-styles-demo__swatches {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.dm-styles-demo__swatch {
  appearance: none;
  border: 0;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px var(--tx-border-color);
}

.dm-styles-demo__swatch.is-active {
  box-shadow:
    0 0 0 2px var(--tx-bg-color),
    0 0 0 3.5px var(--tx-color-primary);
}

/* Full-bleed editorial screen filling 100% of phone, desktop, watch, and browser */
.dm-editorial {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 72px 24px 30px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  background:
    radial-gradient(circle at 82% 14%, rgba(56, 189, 248, 0.16), transparent 44%),
    radial-gradient(circle at 18% 82%, rgba(129, 140, 248, 0.14), transparent 48%),
    linear-gradient(180deg, #0b0e17 0%, #101422 55%, #090b12 100%);
  color: #f8fafc;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
}

.dm-editorial.is-wide {
  padding: 58px 64px 48px;
  gap: 32px;
}

.dm-editorial.is-wide .dm-editorial__kicker {
  font-size: 20px;
}

.dm-editorial.is-wide .dm-editorial__live {
  padding: 7px 18px;
  font-size: 18px;
}

.dm-editorial.is-wide .dm-editorial__artwork {
  padding: 44px;
  border-radius: 34px;
}

.dm-editorial.is-wide .dm-editorial__orb--a {
  width: 380px;
  height: 380px;
}

.dm-editorial.is-wide .dm-editorial__orb--b {
  width: 400px;
  height: 400px;
}

.dm-editorial.is-wide .dm-editorial__wave {
  gap: 10px;
  height: 74px;
}

.dm-editorial.is-wide .dm-editorial__wave span {
  width: 9px;
}

.dm-editorial.is-wide .dm-editorial__wave span:nth-child(1) { height: 28px; }
.dm-editorial.is-wide .dm-editorial__wave span:nth-child(2) { height: 52px; }
.dm-editorial.is-wide .dm-editorial__wave span:nth-child(3) { height: 74px; }
.dm-editorial.is-wide .dm-editorial__wave span:nth-child(4) { height: 44px; }
.dm-editorial.is-wide .dm-editorial__wave span:nth-child(5) { height: 62px; }
.dm-editorial.is-wide .dm-editorial__wave span:nth-child(6) { height: 36px; }
.dm-editorial.is-wide .dm-editorial__wave span:nth-child(7) { height: 24px; }

.dm-editorial.is-wide .dm-editorial__art-foot {
  gap: 10px;
}

.dm-editorial.is-wide .dm-editorial__art-foot strong {
  font-size: 52px;
}

.dm-editorial.is-wide .dm-editorial__art-foot span {
  font-size: 24px;
}

.dm-editorial.is-wide .dm-editorial__details {
  gap: 28px;
  justify-content: center;
}

.dm-editorial.is-wide .dm-editorial__stats {
  gap: 18px;
}

.dm-editorial.is-wide .dm-editorial__stat {
  padding: 26px 24px;
  border-radius: 22px;
  gap: 10px;
}

.dm-editorial.is-wide .dm-editorial__stat small {
  font-size: 19px;
}

.dm-editorial.is-wide .dm-editorial__stat strong {
  font-size: 32px;
}

.dm-editorial.is-wide .dm-editorial__progress {
  gap: 14px;
}

.dm-editorial.is-wide .dm-editorial__track {
  height: 10px;
}

.dm-editorial.is-wide .dm-editorial__times {
  font-size: 20px;
}

.dm-editorial.is-wide .dm-editorial__queue {
  padding: 24px 28px;
  border-radius: 22px;
  gap: 16px;
  font-size: 24px;
}

.dm-editorial.is-wide .dm-editorial__dock {
  padding: 14px 32px;
  border-radius: 30px;
  font-size: 30px;
}

.dm-editorial.is-wide .dm-editorial__dock span {
  width: 66px;
  height: 50px;
  border-radius: 16px;
}

.dm-editorial.is-circle {
  padding: 18px;
  align-items: center;
  justify-content: center;
}

.dm-editorial__watch {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
}

.dm-editorial__watch-label {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #93c5fd;
}

.dm-editorial__watch-dial {
  width: 96px;
  height: 96px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at 35% 30%, rgba(56, 189, 248, 0.28), rgba(15, 23, 42, 0.85));
  box-shadow: inset 0 0 0 3px rgba(96, 165, 250, 0.65);
}

.dm-editorial__watch-dial strong {
  font-size: 28px;
  font-weight: 600;
  color: #ffffff;
}

.dm-editorial__watch small {
  font-size: 11px;
  color: #94a3b8;
}

.dm-editorial__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.dm-editorial__kicker {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: #94a3b8;
}

.dm-editorial__live {
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(56, 189, 248, 0.16);
  box-shadow: inset 0 0 0 1px rgba(125, 211, 252, 0.3);
  color: #7dd3fc;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
}

.dm-editorial__main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.dm-editorial.is-wide .dm-editorial__main {
  display: grid;
  grid-template-columns: 1.15fr 1fr;
  gap: 28px;
  align-items: stretch;
}

.dm-editorial__artwork {
  position: relative;
  flex: 1;
  min-height: 220px;
  padding: 24px;
  border-radius: 22px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background:
    linear-gradient(145deg, #172554 0%, #312e81 48%, #0e7490 100%);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.16);
}

.dm-editorial__orb {
  position: absolute;
  border-radius: 999px;
  pointer-events: none;
}

.dm-editorial__orb--a {
  width: 210px;
  height: 210px;
  top: -54px;
  right: -40px;
  background: radial-gradient(circle, rgba(125, 211, 252, 0.48), transparent 68%);
}

.dm-editorial__orb--b {
  width: 220px;
  height: 220px;
  bottom: -70px;
  left: -45px;
  background: radial-gradient(circle, rgba(196, 181, 253, 0.36), transparent 68%);
}

.dm-editorial__wave {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: flex-end;
  gap: 5px;
  height: 36px;
}

.dm-editorial__wave span {
  width: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.78);
}

.dm-editorial__wave span:nth-child(1) { height: 14px; }
.dm-editorial__wave span:nth-child(2) { height: 26px; }
.dm-editorial__wave span:nth-child(3) { height: 36px; }
.dm-editorial__wave span:nth-child(4) { height: 22px; }
.dm-editorial__wave span:nth-child(5) { height: 30px; }
.dm-editorial__wave span:nth-child(6) { height: 18px; }
.dm-editorial__wave span:nth-child(7) { height: 12px; }

.dm-editorial__art-foot {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dm-editorial__art-foot strong {
  font-size: 26px;
  font-weight: 600;
  line-height: 1.15;
  color: #ffffff;
}

.dm-editorial__art-foot span {
  font-size: 13px;
  color: rgba(241, 245, 249, 0.76);
}

.dm-editorial__details {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 16px;
}

.dm-editorial__stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.dm-editorial__stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.055);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.085);
}

.dm-editorial__stat small {
  font-size: 11px;
  color: #94a3b8;
}

.dm-editorial__stat strong {
  font-size: 16px;
  font-weight: 600;
  color: #f8fafc;
}

.dm-editorial__progress {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.dm-editorial__track {
  height: 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  overflow: hidden;
}

.dm-editorial__fill {
  display: block;
  width: 52%;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #38bdf8, #a78bfa);
}

.dm-editorial__times {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #94a3b8;
}

.dm-editorial__queue {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.05);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
  font-size: 13px;
  color: #e2e8f0;
}

.dm-editorial__dock {
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 8px 16px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.06);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.09);
  color: #94a3b8;
  font-size: 16px;
}

.dm-editorial__dock span {
  width: 34px;
  height: 28px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.dm-editorial__dock span.is-on {
  background: rgba(56, 189, 248, 0.2);
  color: #7dd3fc;
}

@media (max-width: 640px) {
  .dm-styles-demo__stage {
    min-height: 320px;
  }

  .dm-styles-demo__select-box {
    width: 120px;
  }
}
</style>
