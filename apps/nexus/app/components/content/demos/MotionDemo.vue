<script setup lang="ts">
import type { MotionVariant } from '@talex-touch/tuffex/motion'
import { MOTION_VARIANTS, TxMotion, useCanvasSetup, useIsMobile, useLoopFlag, useMousePosition, useReducedMotion, useScreenSize, useStagger, useWebHaptics } from '@talex-touch/tuffex/motion'
import { computed, ref, watch } from 'vue'
const { locale } = useI18n()
const copy = computed(() => locale.value === 'zh' ? {
  replay: '回放入场', enabled: '启用动态效果', global: '全局指针（移到页面后跟随）',
  filter: '筛选变体', all: '全部变体',
  pointer: '移动指针观察坐标', entrances: '7 个独立入场', hover: '4 个悬停交互', cursor: '3 个指针效果', scroll: '滚动进度、揭示与固定内容', helpers: '状态与辅助能力',
  click: '点击次数', selected: '选择', hint: '在下方容器内滚动，比较内容与固定面板。',
  titles: ['草稿', '复核', '发布'], descriptions: ['先整理调用方内容。', '检查模型与实际输入。', '由调用方提交发布操作。'],
  swap: '切换图标', mounted: '进入视口后挂载的内容', viewport: '视口', mobile: '窄屏', reduced: '减少动态效果', loop: '可见时循环次数', haptic: '请求触觉反馈', unsupported: '浏览器不支持 Vibration API', accepted: '浏览器接受请求；无法确认设备实际震动', rejected: '浏览器未接受请求',
} : {
  replay: 'Replay entrances', enabled: 'Enable motion', global: 'Global cursors (follow across the page)',
  filter: 'Filter variant', all: 'All variants',
  pointer: 'Move the pointer to inspect coordinates', entrances: '7 independent entrances', hover: '4 hover interactions', cursor: '3 cursor effects', scroll: 'Scroll progress, reveal and sticky content', helpers: 'State and supporting APIs',
  click: 'Clicks', selected: 'Selected', hint: 'Scroll inside the container to compare content and its sticky panel.',
  titles: ['Draft', 'Review', 'Publish'], descriptions: ['Arrange caller-provided content.', 'Inspect the model and actual inputs.', 'Let the caller submit the publishing action.'],
  swap: 'Swap icon', mounted: 'Content mounted after entering the viewport', viewport: 'Viewport', mobile: 'Narrow viewport', reduced: 'Reduced motion', loop: 'Visible loop count', haptic: 'Request haptic feedback', unsupported: 'Vibration API unavailable', accepted: 'Browser accepted the request; physical vibration is not confirmed', rejected: 'Browser rejected the request',
})
const host = ref<HTMLElement | null>(null)
const scrollHost = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const enabled = ref(true)
const globalCursors = ref(false)
const filter = ref<'all' | MotionVariant>('all')
function show(variant: MotionVariant) { return filter.value === 'all' || filter.value === variant }
const replay = ref(0)
const swapped = ref(false)
const clicks = ref(0)
const selected = ref('')
const scrollPercent = ref(0)
const stickyIndex = ref(0)
const visible = ref(false)
const hapticMessage = ref('')
const entranceVariants: MotionVariant[] = ['fade-in', 'fade-up', 'fade-down', 'slide-left', 'slide-right', 'scale-in', 'zoom-in']
const cursorVariants: MotionVariant[] = ['cursor-trail', 'spotlight', 'mouse-follow']
const items = computed(() => copy.value.titles.map((title, index) => ({ id: index, title, description: copy.value.descriptions[index] })))
const delays = useStagger(7, { from: 'center', staggerDelay: 45 })
const pointer = useMousePosition(host, enabled)
const size = useScreenSize()
const mobile = useIsMobile()
const reduced = useReducedMotion()
const loop = useLoopFlag(host, enabled, 2000)
const haptics = useWebHaptics()
const canvasSetup = useCanvasSetup(canvas, enabled)
function requestHaptic() {
  const result = haptics.trigger('light')
  hapticMessage.value = !result.supported ? copy.value.unsupported : result.accepted ? copy.value.accepted : copy.value.rejected
}
watch([canvasSetup.rect, enabled], () => {
  const element = canvas.value
  if (!element) return
  const context = element.getContext('2d')
  if (!context) return
  const rect = canvasSetup.rect.value
  context.setTransform(rect.dpr, 0, 0, rect.dpr, 0, 0)
  context.clearRect(0, 0, rect.width, rect.height)
  context.fillStyle = getComputedStyle(element).getPropertyValue('--tx-color-primary').trim() || getComputedStyle(element).color
  for (let index = 0; index < 8; index++) context.fillRect(8 + index * 24, rect.height / 2 - 4, 16, 8)
})
</script>

<template>
  <div ref="host" class="motion-demo not-prose">
    <div class="motion-demo__controls">
      <button type="button" @click="replay++">
{{ copy.replay }}
</button>
      <label><input v-model="enabled" type="checkbox"> {{ copy.enabled }}</label>
      <label><input v-model="globalCursors" type="checkbox"> {{ copy.global }}</label>
      <label>{{ copy.filter }} <select v-model="filter"><option value="all">{{ copy.all }}</option><option v-for="variant in MOTION_VARIANTS" :key="variant" :value="variant">{{ variant }}</option></select></label>
    </div>
    <h3>{{ copy.entrances }}</h3>
    <div class="motion-demo__grid">
      <TxMotion v-for="(variant, index) in entranceVariants" v-show="show(variant)" :key="variant" :variant="variant" :enabled="enabled" :state-key="replay" :delay="delays[index]" class="motion-demo__tile">
<span class="motion-demo__sample">{{ variant }}</span>
</TxMotion>
    </div>
    <h3>{{ copy.hover }}</h3>
    <TxMotion v-show="show('card-hover')" variant="card-hover" :items="items" :enabled="enabled" @select="item => selected = item.title" />
    <div class="motion-demo__grid motion-demo__grid--hover">
      <TxMotion v-show="show('tilt-card')" variant="tilt-card" :enabled="enabled" class="motion-demo__tile">
<span class="motion-demo__sample">tilt-card</span>
</TxMotion>
      <TxMotion v-show="show('magnetic-button')" variant="magnetic-button" :enabled="enabled" :label="`magnetic-button ${copy.click}`" @click="clicks++">
magnetic-button
</TxMotion>
      <TxMotion v-show="show('glow-button')" variant="glow-button" :enabled="enabled" :label="`glow-button ${copy.click}`" @click="clicks++">
glow-button
</TxMotion>
    </div>
    <output>{{ copy.click }}: {{ clicks }} · {{ copy.selected }}: {{ selected }}</output>
    <h3>{{ copy.cursor }}</h3>
    <div class="motion-demo__grid">
      <TxMotion v-for="variant in cursorVariants" v-show="show(variant)" :key="variant" :variant="variant" :enabled="enabled" :global="variant !== 'spotlight' && globalCursors" :cursor-size="12" class="motion-demo__pointer">
        <template #default="{ pointer: position }">
<span>{{ variant }}</span><small>{{ Math.round(position.elementX) }}, {{ Math.round(position.elementY) }}</small>
</template>
        <template #cursor>
<span class="motion-demo__follow">+</span>
</template>
      </TxMotion>
    </div>
    <h3>{{ copy.scroll }}</h3>
    <p>{{ copy.hint }}</p>
    <TxMotion v-show="show('progress-indicator')" variant="progress-indicator" :label="copy.scroll" :scroll-container="scrollHost" :enabled="enabled" @progress="value => scrollPercent = Math.round(value * 100)" />
    <output>{{ scrollPercent }}% · sticky-reveal: {{ stickyIndex + 1 }}</output>
    <div ref="scrollHost" class="motion-demo__scroll" tabindex="0" :aria-label="copy.scroll">
      <div class="motion-demo__spacer">
{{ copy.hint }}
</div>
      <TxMotion v-show="show('scroll-reveal')" variant="scroll-reveal" :scroll-container="scrollHost" :enabled="enabled" :state-key="replay" :once="false" class="motion-demo__tile">
<span class="motion-demo__sample">scroll-reveal</span>
</TxMotion>
      <TxMotion v-show="show('in-view')" variant="in-view" :scroll-container="scrollHost" :enabled="enabled" :once="false" root-margin="0px" class="motion-demo__lazy" @visible-change="value => visible = value">
<span>{{ copy.mounted }}</span>
</TxMotion>
      <TxMotion v-show="show('sticky-reveal')" variant="sticky-reveal" :scroll-container="scrollHost" :items="items" :enabled="enabled" :sticky-top="8" @active-change="value => stickyIndex = value">
        <template #visual="{ item, index }">
<div class="motion-demo__visual">
<strong>{{ index + 1 }}</strong><span>{{ item.title }}</span>
</div>
</template>
      </TxMotion>
    </div>
    <h3>{{ copy.helpers }}</h3>
    <button v-show="show('icon-swap')" type="button" class="motion-demo__swap" @click="swapped = !swapped">
<TxMotion variant="icon-swap" :enabled="enabled" :state-key="swapped">
<svg v-if="swapped" viewBox="0 0 24 24" aria-hidden="true"><path d="m4 12 5 5L20 6" /></svg><svg v-else viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="13" height="13" rx="2" /><path d="M16 7V4H4v12h3" /></svg>
</TxMotion>{{ copy.swap }}
</button>
    <dl><dt>useMousePosition</dt><dd>{{ copy.pointer }}: {{ Math.round(pointer.elementX) }}, {{ Math.round(pointer.elementY) }}</dd><dt>useScreenSize / useIsMobile</dt><dd>{{ copy.viewport }}: {{ size.width }} × {{ size.height }} · {{ copy.mobile }}: {{ mobile }}</dd><dt>useReducedMotion / useLoopFlag</dt><dd>{{ copy.reduced }}: {{ reduced }} · {{ copy.loop }}: {{ loop }}</dd><dt>InViewRender</dt><dd>{{ visible }}</dd><dt>useCanvasSetup</dt><dd>{{ canvasSetup.rect.value.width }} × {{ canvasSetup.rect.value.height }} · DPR {{ canvasSetup.rect.value.dpr }} · active {{ canvasSetup.active.value }}</dd></dl>
    <canvas ref="canvas" class="motion-demo__canvas" aria-hidden="true" />
    <button type="button" @click="requestHaptic">
{{ copy.haptic }}
</button><output>{{ hapticMessage }}</output>
  </div>
</template>

<style scoped>
.motion-demo { display: grid; gap: 14px; color: var(--tx-text-color-primary); font-size: 14px; }
.motion-demo h3 { margin: 12px 0 0; font-size: 16px; font-weight: 600; }
.motion-demo p { margin: 0; color: var(--tx-text-color-regular); }
.motion-demo__controls { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.motion-demo button { appearance: none; border: 0; border-radius: 8px; background: var(--tx-fill-color-light); color: var(--tx-text-color-primary); padding: 7px 12px; box-shadow: inset 0 0 0 1px var(--tx-border-color); font: inherit; cursor: pointer; }
.motion-demo button:focus-visible, .motion-demo__scroll:focus-visible { outline: 2px solid var(--tx-color-primary); outline-offset: 3px; }
.motion-demo__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(150px, 100%), 1fr)); gap: 12px; align-items: center; }
.motion-demo__tile { border-radius: 12px; background: var(--tx-fill-color-light); box-shadow: inset 0 0 0 1px var(--tx-border-color); }
.motion-demo__sample { display: flex; min-height: 84px; align-items: center; justify-content: center; }
.motion-demo__pointer { padding: 20px; min-height: 110px; border-radius: 12px; background: var(--tx-fill-color-light); box-shadow: inset 0 0 0 1px var(--tx-border-color); }
.motion-demo__pointer small { display: block; margin-top: 12px; }
.motion-demo__follow { display: block; padding: 3px 7px; }
.motion-demo__scroll { overflow: auto; height: 280px; padding: 16px; border-radius: 12px; box-shadow: inset 0 0 0 1px var(--tx-border-color); }
.motion-demo__spacer { min-height: 220px; display: flex; align-items: center; }
.motion-demo__lazy { min-height: 80px; padding: 16px; }
.motion-demo__visual { display: grid; gap: 12px; text-align: center; }
.motion-demo__visual strong { font-size: 32px; font-weight: 600; }
.motion-demo__swap { display: flex; align-items: center; gap: 8px; width: fit-content; }
.motion-demo__swap svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; }
.motion-demo dl { display: grid; grid-template-columns: minmax(110px, 1fr) 2fr; gap: 8px 16px; margin: 0; font-size: 13px; }
.motion-demo dt { font-weight: 500; }
.motion-demo dd { margin: 0; overflow-wrap: anywhere; }
.motion-demo__canvas { width: 100%; height: 48px; color: var(--tx-color-primary); }
.motion-demo output { color: var(--tx-text-color-regular); font-size: 13px; }
@media (max-width: 600px) { .motion-demo dl { grid-template-columns: 1fr; } }
</style>
