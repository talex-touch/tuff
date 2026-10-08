<script setup lang="ts">
import type { FlipBookPage, FlipBookSettings, TxFlipBookInstance } from '@talex-touch/tuffex/flip-book'
import { TxFlipBook } from '@talex-touch/tuffex/flip-book'
import { computed, ref, watch } from 'vue'

const { locale } = useI18n()
const copy = computed(() => locale.value === 'zh' ? {
  title: '原创纸上研究', previous: '上一页', next: '下一页', settings: '书页设置',
  padding: '图像留白', imageRadius: '图像圆角', creaseOpacity: '折痕不透明度',
  paperColor: '纸张颜色', shadowIntensity: '阴影范围', intro: '重放开场翻页',
  animate: '启用动画', compact: '紧凑版', loop: '循环翻页', current: '当前右页',
  core: 'Book：文字页', dither: 'DitherBook：自制插槽图形页',
  extracted: 'SimpleCompExtracted：宽屏书页与侧向导航',
  hint: '点击书页或前后按钮翻页。展开设置可修改真实留白、圆角、折痕、纸色和阴影。减少动态效果仍会立即完成翻页。',
  page: '纸页', prose: ['晨光从左侧照进来，纸面泛着暖白。', '铅笔先勾出山的轮廓，天空留白。', '水彩一层层叠上去，每层都等它干透。', '折痕处的阴影比想象中更深。', '最后一页留给潦草的笔记。', '合上本子，纸边已经起了毛。'],
  started: '翻页开始', ended: '翻页结束',
} : {
  title: 'Original paper studies', previous: 'Previous', next: 'Next', settings: 'Book settings',
  padding: 'Image padding', imageRadius: 'Image radius', creaseOpacity: 'Crease opacity',
  paperColor: 'Paper color', shadowIntensity: 'Shadow intensity', intro: 'Replay opening flips',
  animate: 'Animate', compact: 'Compact', loop: 'Loop pages', current: 'Current right page',
  core: 'Book: text pages', dither: 'DitherBook: original slotted drawings',
  extracted: 'SimpleCompExtracted: wide pages and side navigation',
  hint: 'Click pages or previous/next buttons to turn. The settings edit real padding, radius, crease, paper color and shadow. Reduced motion still completes every page turn immediately.',
  page: 'Page', prose: ['Morning light from the left warms the paper.', 'Pencil first: the ridge line, the sky left blank.', 'Watercolor in layers, each one left to dry.', 'The shadow in the crease runs deeper than expected.', 'The last page is saved for quick notes.', 'Closed again, the edges already soft with use.'],
  started: 'Flip started', ended: 'Flip completed',
})
const book = ref<TxFlipBookInstance | null>(null)
const current = ref(0)
const coreCurrent = ref(1)
const extractedCurrent = ref(0)
const extractedBook = ref<TxFlipBookInstance | null>(null)
const animated = ref(true)
const compact = ref(false)
const loop = ref(true)
const event = ref('')
const settings = ref<FlipBookSettings>({ padding: 10, imageRadius: 20, creaseOpacity: 11, paperColor: 'var(--tx-bg-color-overlay, var(--tx-bg-color))', shadowIntensity: 24 })
watch(compact, value => { settings.value = { ...settings.value, padding: value ? 6 : 10, imageRadius: value ? 8 : 20, shadowIntensity: value ? 10 : 24 } })
const pages = computed<FlipBookPage[]>(() => Array.from({ length: 6 }, (_, index) => ({ id: index, title: `${copy.value.page} ${index + 1}`, content: copy.value.prose[index] })))
const labels = computed(() => ({ previous: copy.value.previous, next: copy.value.next, settings: copy.value.settings, padding: copy.value.padding, imageRadius: copy.value.imageRadius, creaseOpacity: copy.value.creaseOpacity, paperColor: copy.value.paperColor, shadowIntensity: copy.value.shadowIntensity, intro: copy.value.intro }))
</script>

<template>
  <div class="flip-book-demo not-prose">
    <div class="flip-book-demo__toolbar">
      <label><input v-model="animated" type="checkbox">{{ copy.animate }}</label>
      <label><input v-model="compact" type="checkbox">{{ copy.compact }}</label>
      <label><input v-model="loop" type="checkbox">{{ copy.loop }}</label>
      <button type="button" :disabled="!animated" @click="book?.replayIntro()">
{{ copy.intro }}
</button>
      <label>{{ copy.current }} {{ current + 1 }} <input v-model.number="current" type="range" min="0" max="5" step="1"></label>
    </div>
    <p>{{ copy.hint }}</p>
    <section>
      <h3>{{ copy.dither }}</h3>
      <TxFlipBook ref="book" v-model="current" v-model:settings="settings" :pages="pages" :compact="compact" :animated="animated" :loop="loop" :labels="labels" :aria-label="copy.title" intro @flip-start="event = copy.started" @flip-end="event = copy.ended">
        <template #page="{ page, index }">
          <div class="flip-book-demo__drawing">
            <svg viewBox="0 0 180 180" role="img" :aria-label="page.title">
              <rect width="180" height="180" fill="var(--tx-fill-color-light)" />
              <g fill="none" stroke="var(--tx-text-color-primary)" stroke-width="1.5">
                <circle v-for="ring in 7" :key="ring" cx="90" cy="90" :r="12 + ring * (6 + index)" />
                <path :d="`M10 ${40 + index * 8}Q90 ${150 - index * 9}170 ${55 + index * 10}`" />
                <path d="M25 25L155 155M25 155L155 25" />
              </g>
              <g fill="var(--tx-text-color-primary)" opacity=".2"><circle v-for="dot in 20" :key="dot" :cx="12 + ((dot * 17 + index * 9) % 154)" :cy="12 + ((dot * 29 + index * 15) % 154)" r="1" /></g>
            </svg>
            <strong>{{ page.title }}</strong>
          </div>
        </template>
      </TxFlipBook>
      <output>{{ event }} · {{ copy.current }} {{ current + 1 }} / {{ pages.length }}</output>
    </section>
    <section>
      <h3>{{ copy.core }}</h3>
      <TxFlipBook v-model="coreCurrent" :pages="pages" mode="book" :animated="animated" :loop="loop" :labels="labels" :padding="14" :image-radius="8" :crease-opacity="20" size="sm" />
      <div class="flip-book-demo__toolbar">
<button type="button" @click="coreCurrent = Math.max(0, coreCurrent - 1)">
{{ copy.previous }}
</button><output>{{ coreCurrent + 1 }}</output><button type="button" @click="coreCurrent = Math.min(pages.length - 1, coreCurrent + 1)">
{{ copy.next }}
</button>
</div>
    </section>
    <section>
      <h3>{{ copy.extracted }}</h3>
      <TxFlipBook ref="extractedBook" v-model="extractedCurrent" :pages="pages" mode="extracted-book" :animated="animated" :loop="loop" :labels="labels" size="lg" intro />
      <div class="flip-book-demo__toolbar">
<button type="button" :disabled="!animated" @click="extractedBook?.replayIntro()">
{{ copy.intro }}
</button><output>{{ copy.current }} {{ extractedCurrent + 1 }}</output>
</div>
    </section>
  </div>
</template>

<style scoped>
.flip-book-demo { display: grid; gap: 20px; font-size: 13px; color: var(--tx-text-color-primary); }
.flip-book-demo__toolbar { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 12px; }
.flip-book-demo__toolbar label { display: flex; align-items: center; gap: 6px; }
.flip-book-demo__toolbar button { padding: 6px 10px; border: 0; border-radius: 8px; background: var(--tx-fill-color-light); color: inherit; font: inherit; cursor: pointer; }
.flip-book-demo__toolbar input[type='range'] { width: 120px; accent-color: var(--tx-color-primary); }
.flip-book-demo h3 { font-size: 14px; font-weight: 600; margin: 0 0 12px; }
.flip-book-demo p { margin: 0; line-height: 1.5; }
.flip-book-demo output { display: block; text-align: center; color: var(--tx-text-color-regular); }
.flip-book-demo__drawing { display: flex; height: 100%; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; gap: 8px; }
.flip-book-demo__drawing svg { width: 100%; min-height: 0; flex: 1; }
.flip-book-demo__drawing strong { font-size: 13px; font-weight: 500; padding-bottom: 6px; }
</style>
