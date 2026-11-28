<script setup lang="ts">
import { computed, ref } from 'vue'
import ConceptFigure from './ConceptFigure.vue'

/**
 * The same two cards on a pure black and a #141414 canvas. The cards follow the article's
 * ladder, a container and a raised card, and cast the dark theme's elevation-4 and -5 shadows
 * from `variables.scss` with the opacity on a slider. A shadow is translucent black laid over
 * whatever is under it, so where it falls on #000000 it changes nothing: its luminance equals
 * the canvas's. All colours are fixed, so both canvases show whatever theme the page is in;
 * contrast and luminance are WCAG 2.1, computed live.
 */

type Rgb = [number, number, number]
type TextTone = 'white' | 'primary'

function hex(value: string): Rgb {
  const digits = value.replace('#', '')
  return [0, 2, 4].map(i => Number.parseInt(digits.slice(i, i + 2), 16)) as Rgb
}

function linear(channel: number) {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function luminance([r, g, b]: Rgb) {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

function contrast(a: Rgb, b: Rgb) {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

const CANVASES = ['#000000', '#141414']
// The article's ladder: --tx-bg-color-overlay and --tx-fill-color-light in the dark theme.
const CONTAINER = '#1d1e1f'
const RAISED = '#262727'
const TEXT: Record<TextTone, string> = { white: '#ffffff', primary: '#e5eaf3' }
/** The shadow opacity of the dark theme's --tx-elevation-5. */
const DEFAULT_STRENGTH = 54

const { locale } = useI18n()

const strength = ref(DEFAULT_STRENGTH)
const textTone = ref<TextTone>('white')

const copy = computed(() => locale.value === 'zh'
  ? {
      label: (canvas: string) => `${canvas} 画布上的容器层卡片与高亮层卡片`,
      canvas: '底板',
      container: '容器',
      raised: '高亮',
      strength: '投影不透明度',
      text: '文字颜色',
      white: '纯白',
      primary: '暗色主文字',
      textContrast: (canvas: string) => `${canvas} · 文字对比度`,
      shadow: (canvas: string) => `${canvas} · 投影亮度 vs 底板亮度`,
      caption: '两块画布都是固定色值，不随页面主题变化。卡片按文中阶梯着色（容器层 #1d1e1f、高亮层 #262727），投影沿用 TuffEx 暗色 elevation-4 / -5 的偏移与模糊，只把不透明度交给滑杆。投影是盖在下层之上的半透明黑：#000000 已经不能更暗，投影亮度等于底板亮度，拉满也看不见，只剩高亮层卡片落在容器上的那一段；#141414 留有亮度余量，投影才沉得下去。对比度与亮度都按 WCAG 2.1 相对亮度实时计算。',
    }
  : {
      label: (canvas: string) => `A container card and an elevated card on a ${canvas} canvas`,
      canvas: 'Canvas',
      container: 'Container',
      raised: 'Elevated',
      strength: 'Shadow opacity',
      text: 'Text colour',
      white: 'Pure white',
      primary: 'Dark primary text',
      textContrast: (canvas: string) => `${canvas} · text contrast`,
      shadow: (canvas: string) => `${canvas} · shadow vs canvas luminance`,
      caption: 'Both canvases are fixed colours, whatever theme this page is in. The cards follow the article\'s ladder (container #1d1e1f, elevated #262727) and cast the dark theme\'s elevation-4 and -5 shadows, with only their opacity on the slider. A shadow is translucent black laid over what is beneath it: #000000 cannot get any darker, so the shadow\'s luminance equals the canvas\'s and it stays invisible even at 100%; only the part the elevated card throws onto the container shows. #141414 leaves luminance to take away, so the shadow can sink below it. Contrast and luminance are WCAG 2.1 relative luminance, computed live.',
    })

const alpha = computed(() => strength.value / 100)
const containerShadow = computed(() => `4px 8px 24px rgba(0, 0, 0, ${alpha.value})`)
const raisedShadow = computed(() => `6px 14px 40px rgba(0, 0, 0, ${alpha.value})`)

const stats = computed(() => CANVASES.map((canvas) => {
  const bg = hex(canvas)
  // Black at `alpha` over the canvas, composited on the encoded values as the browser does.
  const shadow = bg.map(channel => channel * (1 - alpha.value)) as Rgb
  const canvasL = luminance(bg)
  const shadowL = luminance(shadow)
  return {
    canvas,
    text: contrast(hex(TEXT[textTone.value]), bg),
    canvasL,
    shadowL,
    sinks: shadowL < canvasL,
    drop: canvasL > 0 ? (canvasL - shadowL) / canvasL : 0,
  }
}))

function formatStrength(value: number) {
  return `${Math.round(value)}%`
}

function shadowValue(stat: { canvasL: number, shadowL: number, sinks: boolean, drop: number }) {
  const relation = stat.sinks ? '<' : '='
  const verdict = stat.sinks ? `✓ −${Math.round(stat.drop * 100)}%` : '✗'
  return `${stat.shadowL.toFixed(4)} ${relation} ${stat.canvasL.toFixed(4)} ${verdict}`
}

function resetDemo() {
  strength.value = DEFAULT_STRENGTH
  textTone.value = 'white'
}

defineExpose({ resetDemo })
</script>

<template>
  <ConceptFigure class="dkc-root" stage="plain" :caption="copy.caption">
    <div class="cfig-split dkc">
      <div
        v-for="canvas in CANVASES"
        :key="canvas"
        class="dkc-canvas"
        role="img"
        :aria-label="copy.label(canvas)"
        :style="{ background: canvas, color: TEXT[textTone] }"
      >
        <div class="dkc-canvas__label">
          <span>{{ copy.canvas }}</span>
          <span class="cfig-mono">{{ canvas }}</span>
        </div>
        <div class="dkc-scene">
          <div class="dkc-card is-container" :style="{ background: CONTAINER, boxShadow: containerShadow }">
            <span class="dkc-card__role">{{ copy.container }}</span>
            <span class="dkc-card__hex cfig-mono">{{ CONTAINER }}</span>
            <span class="dkc-card__bar" />
            <span class="dkc-card__bar is-short" />
          </div>
          <div class="dkc-card is-raised" :style="{ background: RAISED, boxShadow: raisedShadow }">
            <span class="dkc-card__role">{{ copy.raised }}</span>
            <span class="dkc-card__hex cfig-mono">{{ RAISED }}</span>
          </div>
        </div>
      </div>
    </div>

    <template #controls>
      <label class="cfig-control dkc-slider">
        <span class="cfig-control__label">{{ copy.strength }}</span>
        <TxSlider v-model="strength" :min="0" :max="100" :step="1" show-value :format-value="formatStrength" :aria-label="copy.strength" />
      </label>
      <div class="cfig-control">
        <span class="cfig-control__label">{{ copy.text }}</span>
        <TxRadioGroup v-model="textTone">
          <TxRadio value="white">
            {{ copy.white }} {{ TEXT.white }}
          </TxRadio>
          <TxRadio value="primary">
            {{ copy.primary }} {{ TEXT.primary }}
          </TxRadio>
        </TxRadioGroup>
      </div>
    </template>

    <template #readout>
      <span v-for="stat in stats" :key="`text-${stat.canvas}`" class="cfig-stat">
        <span class="cfig-stat__label">{{ copy.textContrast(stat.canvas) }}</span>
        <span class="cfig-stat__value">{{ stat.text.toFixed(2) }}:1</span>
      </span>
      <span v-for="stat in stats" :key="`shadow-${stat.canvas}`" class="cfig-stat" :class="stat.sinks ? 'is-pass' : 'is-fail'">
        <span class="cfig-stat__label">{{ copy.shadow(stat.canvas) }}</span>
        <span class="cfig-stat__value">{{ shadowValue(stat) }}</span>
      </span>
    </template>
  </ConceptFigure>
</template>

<style scoped>
.dkc {
  padding: 12px;
}

.dkc-canvas {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  overflow: hidden;
  padding: 14px 14px 26px;
  border-radius: 12px;
}

.dkc-canvas__label {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  font-size: 12px;
  font-weight: 500;
}

.dkc-scene {
  position: relative;
  height: 150px;
}

.dkc-card {
  position: absolute;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 10px;
}

.dkc-card.is-container {
  top: 0;
  left: 0;
  width: 72%;
  height: 112px;
}

.dkc-card.is-raised {
  top: 62px;
  right: 0;
  width: 50%;
  height: 76px;
}

.dkc-card__role {
  font-size: 12px;
  font-weight: 500;
}

.dkc-card__hex {
  font-size: 11px;
  opacity: 0.66;
}

.dkc-card__bar {
  width: 70%;
  height: 6px;
  border-radius: 3px;
  background: currentColor;
  opacity: 0.14;
}

.dkc-card__bar.is-short {
  width: 42%;
}

.dkc-slider {
  flex: 1 1 260px;
}
</style>
