<script setup lang="ts">
import type { DitherSeries } from '@talex-touch/tuffex/charts/src/dither-chart'
import type { MonoChartData, MonoChartSeriesMode } from '@talex-touch/tuffex/charts/src/mono-chart'
import type { MotionControlValue } from '@tuffex-components/motion-control'
import type { MotionDockId, MotionDockItem } from '@tuffex-components/motion-dock'
import type { MotionFormValue } from '@tuffex-components/motion-form'
import type { MotionTransitionVariant } from '@tuffex-components/motion-transition'
import { TxDitherChart } from '@talex-touch/tuffex/charts/src/dither-chart'
import { TxMonoChart } from '@talex-touch/tuffex/charts/src/mono-chart'
import { computed, ref } from 'vue'
import {
  TxButton,
  TxCardSpread,
  TxCarousel3D,
  TxDistortionWave,
  TxFlipBook,
  TxMotion,
  TxMotionButton,
  TxMotionControl,
  TxMotionDock,
  TxMotionForm,
  TxMotionLoader,
  TxMotionMetric,
  TxMotionText,
  TxMotionTransition,
  TxPhysicsMotion,
  TxPixelField,
  TxVoiceRing,
} from '#components'
import { tileImage } from './tile-image'

const props = defineProps<{
  kind: 'motion-button' | 'card-spread' | 'carousel-3d' | 'flip-book' | 'motion-loader'
    | 'dither-chart' | 'mono-chart' | 'motion-text' | 'physics-motion' | 'motion-dock'
    | 'motion' | 'motion-transition' | 'motion-form' | 'motion-control'
    | 'motion-metric' | 'distortion-wave' | 'voice-ring' | 'pixel-field'
}>()
const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')
const copy = computed(() => zh.value
  ? {
      star: '收藏项目', starred: '已收藏', like: '喜欢', liked: '已喜欢',
      cards: '旅行照片', expand: '展开卡片', collapse: '收起卡片',
      carousel: '旅行照片轮播', carouselRole: '轮播', previous: '上一项', next: '下一项', item: '照片', timeline: '拍摄时间线',
      book: '旅行手记', page: '章节', pages: ['出发', '山路', '湖畔', '归途'],
      pageContent: ['背包六点就收好了。', '雾从松林间散开。', '在湖边歇了很久。', '带回一袋松果。'],
      loader: '正在同步照片', pause: '暂停', resume: '继续', replay: '重放',
      chart: '每周输出', series: '输出', target: '目标', weeks: ['第一周', '第二周', '第三周', '第四周', '第五周'],
      growth: '社区增长', members: '新增成员', legend: '系列', months: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月'],
      period: '时间范围', total: '合计', less: '较少', more: '较多',
      single: '单序列', dual: '双序列', col: '列', row: '行', monotone: '单调曲线', natural: '自然曲线',
      showLine: '显示线条', hideLine: '隐藏线条', empty: '暂无数据',
      motionText: '雾散之后，湖面亮了起来', physics: '轨道万向环', dock: '应用栏', home: '首页', search: '搜索', files: '文件', calendar: '日历', settings: '设置',
      dockInstructions: '左右方向键移动焦点，Home 和 End 到首尾。按住 Alt 重排条目，Enter 或空格激活，Escape 取消拖动。',
      dockReordered: '已将 {label} 移到第 {position} 项，共 {total} 项。',
      hover: '悬停或聚焦卡片', hoverBody: '指针位置控制卡片倾斜。',
      transition: '触发转场',
      transitionVariants: [
        { id: 'spatial-door-portal' as MotionTransitionVariant, label: '空间双门' },
        { id: 'obsidian-liquid-wave' as MotionTransitionVariant, label: '液体波' },
        { id: 'radial-iris-mask' as MotionTransitionVariant, label: '径向光圈' },
        { id: 'perspective-flip-stage' as MotionTransitionVariant, label: '透视翻转' },
        { id: 'staggered-glass-curtain' as MotionTransitionVariant, label: '玻璃帘' },
      ],
      sceneTagA: '场景 01 · 晨雾', sceneTagB: '场景 02 · 暮色',
      first: '清晨湖畔', second: '山脊晚霞', firstBody: '雾还没散，湖面如镜。', secondBody: '余晖正落在对岸山脊。',
      form: '项目名称', placeholder: '输入名称', formValue: '当前值',
      save: '收藏', saved: '已收藏', control: '收藏项目',
      metric: '阅读目标', metricDescription: '本月目标 100 页',
      cardTitles: ['山路', '湖畔', '松林', '海岸', '雪原'], cardDates: ['10/3', '10/4', '10/5', '10/6', '10/7'],
      waveTrigger: '发射折射波', waveBefore: '确认转账', waveAfter: '已送达',
      voiceRingLabel: '语音光环', pixelFieldTitle: '视觉连续性', pixelFieldSub: '悬停或点击体验',
    }
  : {
      star: 'Bookmark', starred: 'Saved', like: 'Like', liked: 'Liked',
      cards: 'Trip photos', expand: 'Expand cards', collapse: 'Collapse cards',
      carousel: 'Trip photo carousel', carouselRole: 'carousel', previous: 'Previous', next: 'Next', item: 'Photo', timeline: 'Photo timeline',
      book: 'Travel journal', page: 'Chapter', pages: ['Depart', 'Trail', 'Lake', 'Home'],
      pageContent: ['Packed and out the door by six.', 'Mist lifting slowly off the pines.', 'A long, lazy lunch by the water.', 'Home with a bag of pine cones.'],
      loader: 'Syncing photos', pause: 'Pause', resume: 'Resume', replay: 'Replay',
      chart: 'Weekly output', series: 'Output', target: 'Target', weeks: ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5'],
      growth: 'Community growth', members: 'New members', legend: 'Series', months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'],
      period: 'Period', total: 'Total', less: 'Less', more: 'More',
      single: 'Single series', dual: 'Dual series', col: 'Column', row: 'Row', monotone: 'Monotone', natural: 'Natural',
      showLine: 'Show line', hideLine: 'Hide line', empty: 'No data',
      motionText: 'The mist lifts and the lake lights up', physics: 'Orbital gimbal', dock: 'App dock', home: 'Home', search: 'Search', files: 'Files', calendar: 'Calendar', settings: 'Settings',
      dockInstructions: 'Left and Right move focus; Home and End reach the ends. Hold Alt to reorder. Enter or Space activates; Escape cancels a drag.',
      dockReordered: 'Moved {label} to position {position} of {total}.',
      hover: 'Hover or focus the card', hoverBody: 'Pointer position controls the card tilt.',
      transition: 'Play transition',
      transitionVariants: [
        { id: 'spatial-door-portal' as MotionTransitionVariant, label: 'Doors' },
        { id: 'obsidian-liquid-wave' as MotionTransitionVariant, label: 'Wave' },
        { id: 'radial-iris-mask' as MotionTransitionVariant, label: 'Iris' },
        { id: 'perspective-flip-stage' as MotionTransitionVariant, label: 'Flip' },
        { id: 'staggered-glass-curtain' as MotionTransitionVariant, label: 'Curtain' },
      ],
      sceneTagA: 'SCENE 01 · DAWN', sceneTagB: 'SCENE 02 · DUSK',
      first: 'Morning Lake', second: 'Sunset Ridge', firstBody: 'Mist lingers over still water.', secondBody: 'Amber light crosses the far hills.',
      form: 'Project name', placeholder: 'Enter a name', formValue: 'Current value',
      save: 'Save', saved: 'Saved', control: 'Save project',
      metric: 'Reading goal', metricDescription: 'Monthly target: 100 pages',
      cardTitles: ['Trail', 'Lake', 'Pines', 'Coast', 'Snow'], cardDates: ['Oct 3', 'Oct 4', 'Oct 5', 'Oct 6', 'Oct 7'],
      waveTrigger: 'Trigger wave', waveBefore: 'Confirm transfer', waveAfter: 'Sent',
      voiceRingLabel: 'Voice ring', pixelFieldTitle: 'Visual Continuity', pixelFieldSub: 'Hover or click',
    })

// This component is mounted inside DocsGallerySpecimen. Its models belong to
// the remounted subtree, so Reset restores the actual interactions, not just CSS.
const selected = ref(false)
const starCount = ref(128)
const liked = ref(false)
const likeCount = ref(42)
const cardIndex = ref(2)
const expanded = ref(true)
const carouselIndex = ref(2)
const bookIndex = ref(1)
const playing = ref(true)
const textReplay = ref(0)
const controlValue = ref<MotionControlValue>(false)
const formValue = ref<MotionFormValue>('')
const transitionKey = ref('one')
const transitionVariant = ref<MotionTransitionVariant>('spatial-door-portal')
const waveRevealed = ref(false)
const waveTriggerRef = ref<HTMLButtonElement | null>(null)
const dockOrder = ref<MotionDockId[]>(['home', 'search', 'files', 'calendar', 'settings'])
const dockActive = ref<MotionDockId>('home')
const monoMode = ref<MonoChartSeriesMode>('single')
const ditherKeys = ref(['members'])
const ditherCursor = ref<number | null>(null)
// Whole class names, so UnoCSS finds every icon in the source.
const dockIcons: Record<string, string> = {
  home: 'i-carbon-home', search: 'i-carbon-search', files: 'i-carbon-folder', calendar: 'i-carbon-calendar', settings: 'i-carbon-settings',
}
const dockItems = computed<MotionDockItem[]>({
  get: () => dockOrder.value.map(id => ({ id, label: copy.value[id as 'home' | 'search' | 'files' | 'calendar' | 'settings'] })),
  set: items => { dockOrder.value = items.map(item => item.id) },
})
const cardArtwork = [
  tileImage('#1e3a8a', '#60a5fa', '#e0f2fe', 2),
  tileImage('#0f766e', '#5eead4', '#fef9c3', 2),
  tileImage('#064e3b', '#34d399', '#ecfdf5', 2),
  tileImage('#9a3412', '#fb923c', '#ffedd5', 2),
  tileImage('#312e81', '#818cf8', '#eef2ff', 2),
]
const cards = computed(() => copy.value.cardTitles.map((title, index) => ({
  id: `card-${index}`,
  title,
  description: copy.value.cardDates[index],
  src: cardArtwork[index % cardArtwork.length],
})))
const pages = computed(() => copy.value.pages.map((title, index) => ({
  id: `page-${index}`, title, content: copy.value.pageContent[index],
})))
const monoData = computed<MonoChartData>(() => ({
  categories: copy.value.weeks,
  series: [
    { id: 'output', name: copy.value.series, data: [24, 48, 36, 62, 55].map((value, index) => ({ x: copy.value.weeks[index]!, value })) },
    { id: 'target', name: copy.value.target, data: [36, 40, 44, 48, 52].map((value, index) => ({ x: copy.value.weeks[index]!, value })) },
  ],
}))
// A growth chart takes its points and nothing else: `value` / `capacity` are
// gauge fields, and setting them here replaced the plotted sum in the header
// and legend with numbers the curve never showed. Nine points put the axis
// labels (first, quarters, last) on evenly spaced points.
const ditherSeries = computed<DitherSeries[]>(() => [
  { id: 'members', label: copy.value.members, change: '+15%', data: [18, 24, 21, 30, 36, 33, 42, 48, 55].map((value, index) => ({ label: copy.value.months[index]!, value })) },
])
const metricData = computed(() => ({
  title: copy.value.metric, description: copy.value.metricDescription, value: 66, target: 100,
}))

function toggleStar() {
  selected.value = !selected.value
  starCount.value += selected.value ? 1 : -1
}

function toggleLike() {
  liked.value = !liked.value
  likeCount.value += liked.value ? 1 : -1
}

function pickTransitionVariant(variant: MotionTransitionVariant) {
  transitionVariant.value = variant
  transitionKey.value = transitionKey.value === 'one' ? 'two' : 'one'
}
</script>

<template>
  <div class="gallery-amicro not-prose" :data-kind="props.kind">
    <div v-if="kind === 'motion-button'" class="gallery-amicro__btn-row">
      <TxMotionButton
        source-id="2"
        :label="copy.star"
        :active-label="copy.starred"
        :selected="selected"
        :count="starCount"
        burst
        size="sm"
        @click="toggleStar"
      />
      <TxMotionButton
        source-id="5"
        :label="copy.like"
        :active-label="copy.liked"
        :selected="liked"
        :count="likeCount"
        burst
        size="sm"
        @click="toggleLike"
      />
    </div>
    <TxCardSpread
      v-else-if="kind === 'card-spread'"
      v-model="cardIndex"
      v-model:expanded="expanded"
      :items="cards"
      variant="card-arc-5"
      size="sm"
      :aria-label="copy.cards"
      :expand-label="copy.expand"
      :collapse-label="copy.collapse"
    />
    <TxCarousel3D
      v-else-if="kind === 'carousel-3d'"
      v-model="carouselIndex"
      :items="cards"
      variant="card-cover-flow"
      size="md"
      :aria-label="copy.carousel"
      :aria-roledescription="copy.carouselRole"
      :previous-label="copy.previous"
      :next-label="copy.next"
      :item-label="copy.item"
      :timeline-label="copy.timeline"
    />
    <TxFlipBook
      v-else-if="kind === 'flip-book'"
      v-model="bookIndex"
      :pages="pages"
      compact
      :settings-panel="false"
      :padding="4"
      :aria-label="copy.book"
      :labels="{ previous: copy.previous, next: copy.next }"
    />
    <template v-else-if="kind === 'motion-loader'">
      <TxMotionLoader variant="apple-breathe" :playing="playing" size="sm" :label="copy.loader" :labels="{ loading: copy.loader, paused: copy.pause }" />
      <TxButton size="sm" @click="playing = !playing">
        {{ playing ? copy.pause : copy.resume }}
      </TxButton>
    </template>
    <TxDitherChart
      v-else-if="kind === 'dither-chart'"
      v-model:active-keys="ditherKeys"
      v-model:date-cursor="ditherCursor"
      variant="dither-growth"
      pattern="ordered"
      :series="ditherSeries"
      :title="copy.growth"
      :height="160"
      :labels="{ chart: copy.growth, series: copy.legend, period: copy.period, total: copy.total, less: copy.less, more: copy.more, empty: copy.empty }"
    />
    <TxMonoChart
      v-else-if="kind === 'mono-chart'"
      v-model:series-mode="monoMode"
      variant="mono-rounded-line"
      :data="monoData"
      :width="320"
      :height="160"
      compact
      :title="copy.chart"
      :aria-label="copy.chart"
      :labels="{ single: copy.single, dual: copy.dual, col: copy.col, row: copy.row, monotone: copy.monotone, natural: copy.natural, showLine: copy.showLine, hideLine: copy.hideLine, empty: copy.empty }"
    />
    <template v-else-if="kind === 'motion-text'">
      <TxMotionText variant="txt-blurup-word" :text="copy.motionText" :locale="locale" :replay-key="textReplay" size="sm" />
      <TxButton size="sm" @click="textReplay++">
        {{ copy.replay }}
      </TxButton>
    </template>
    <TxPhysicsMotion
      v-else-if="kind === 'physics-motion'"
      variant="anim-orbital-gimbal"
      trigger="auto"
      loop
      size="sm"
      :aria-label="copy.physics"
      :labels="{ replay: copy.replay, content: copy.physics }"
    />
    <TxMotionDock
      v-else-if="kind === 'motion-dock'"
      v-model:items="dockItems"
      v-model:active-id="dockActive"
      reorderable
      size="lg"
      :labels="{ dock: copy.dock, instructions: copy.dockInstructions, reordered: copy.dockReordered }"
    >
      <template #icon="{ item }">
        <span class="gallery-amicro__dock-icon" :class="dockIcons[item.id]" aria-hidden="true" />
      </template>
    </TxMotionDock>
    <TxMotion v-else-if="kind === 'motion'" variant="tilt-card" :max-tilt="14" :label="copy.hover" tabindex="0" class="gallery-amicro__tilt">
      <span class="gallery-amicro__tilt-body">
        <span class="i-carbon-cube gallery-amicro__glyph" aria-hidden="true" />
        <strong>{{ copy.hover }}</strong>
        <span>{{ copy.hoverBody }}</span>
      </span>
    </TxMotion>
    <template v-else-if="kind === 'motion-transition'">
      <div class="gallery-amicro__transition-chips" role="group" :aria-label="copy.transition">
        <button
          v-for="item in copy.transitionVariants"
          :key="item.id"
          type="button"
          class="gallery-amicro__chip"
          :class="{ 'is-active': transitionVariant === item.id }"
          @click="pickTransitionVariant(item.id)"
        >
          {{ item.label }}
        </button>
      </div>
      <TxMotionTransition :model-value="transitionKey" :variant="transitionVariant" mode="card" size="sm" :aria-label="copy.transition">
        <template #default="{ key }">
          <div class="gallery-amicro__transition" :class="key === 'one' ? 'is-dawn' : 'is-dusk'">
            <span class="gallery-amicro__scene-tag">{{ key === 'one' ? copy.sceneTagA : copy.sceneTagB }}</span>
            <strong>{{ key === 'one' ? copy.first : copy.second }}</strong>
            <span class="gallery-amicro__scene-desc">{{ key === 'one' ? copy.firstBody : copy.secondBody }}</span>
          </div>
        </template>
      </TxMotionTransition>
      <TxButton size="sm" @click="transitionKey = transitionKey === 'one' ? 'two' : 'one'">
        {{ copy.transition }}
      </TxButton>
    </template>
    <template v-else-if="kind === 'motion-form'">
      <TxMotionForm v-model="formValue" variant="floating-label-input" :label="copy.form" :placeholder="copy.placeholder" size="sm" />
      <output class="gallery-amicro__value">{{ copy.formValue }}: {{ formValue }}</output>
    </template>
    <TxMotionControl v-else-if="kind === 'motion-control'" v-model="controlValue" variant="yui-save-pill" :label="copy.control" :labels="{ control: copy.control, save: copy.save, saved: copy.saved }" size="sm" />
    <TxMotionMetric v-else-if="kind === 'motion-metric'" variant="m-progress-piano" :data="metricData" size="sm" />
    <TxDistortionWave
      v-else-if="kind === 'distortion-wave'"
      class="gallery-amicro__wave"
      :revealed="waveRevealed"
      :source="waveTriggerRef"
      type="vertical"
      palette="colorful"
      :corner-radius="14"
    >
      <div class="gallery-amicro__wave-face">
        <strong>{{ copy.waveBefore }}</strong>
        <span>$1,250.00</span>
      </div>
      <template #revealed>
        <div class="gallery-amicro__wave-face gallery-amicro__wave-face--done">
          <strong>{{ copy.waveAfter }}</strong>
          <span>$1,250.00</span>
        </div>
      </template>
      <template #overlay>
        <div class="gallery-amicro__wave-overlay">
          <button ref="waveTriggerRef" type="button" class="gallery-amicro__wave-btn" @click="waveRevealed = !waveRevealed">
            {{ copy.waveTrigger }}
          </button>
        </div>
      </template>
    </TxDistortionWave>
    <div v-else-if="kind === 'voice-ring'" class="gallery-amicro__voice-stage">
      <TxVoiceRing
        type="ring"
        state="listening"
        :size="148"
        :level="0.58"
        :direction="-0.35"
        theme="dark"
        :aria-label="copy.voiceRingLabel"
      />
    </div>
    <TxPixelField
      v-else-if="kind === 'pixel-field'"
      class="gallery-amicro__pixel"
      preset="leaf"
      palette="emerald"
      stage="obsidian"
      :pixel-size="2.6"
      :gap="1.5"
      :radius="14"
      :aria-label="copy.pixelFieldTitle"
    >
      <div class="gallery-amicro__pixel-copy">
        <strong>{{ copy.pixelFieldTitle }}</strong>
        <span>{{ copy.pixelFieldSub }}</span>
      </div>
    </TxPixelField>
  </div>
</template>

<style scoped>
.gallery-amicro {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: min(320px, 100%);
  min-width: 0;
  color: var(--tx-text-color-primary);
  font-size: 13px;
}
.gallery-amicro__btn-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 10px;
}
.gallery-amicro > :deep(.tx-motion-transition),
.gallery-amicro > :deep(.tx-motion-form),
.gallery-amicro > :deep(.tx-dither-chart),
.gallery-amicro > :deep(.tx-mono-chart),
.gallery-amicro > :deep(.tx-motion-metric) {
  width: 100%;
  min-width: 0;
}
.gallery-amicro > :deep(.tx-motion-transition .tx-motion-transition__view) {
  padding: 0;
}
/* TxMotion's own `display: block` ties a lone class and loads later, and the
   slot sits two spans deep: the card centres one wrapper, which stacks the rest. */
.gallery-amicro > .gallery-amicro__tilt {
  display: grid;
  place-items: center;
  width: 100%;
  min-height: 150px;
  padding: 16px;
  box-sizing: border-box;
  border-radius: 14px;
  background: var(--tx-bg-color-overlay, var(--tx-bg-color));
  box-shadow: inset 0 0 0 1px var(--tx-border-color);
  text-align: center;
}
.gallery-amicro__tilt-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.gallery-amicro__tilt:focus-visible {
  outline: 2px solid var(--tx-color-primary);
  outline-offset: 3px;
}
.gallery-amicro__tilt strong,
.gallery-amicro__transition strong {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.gallery-amicro__tilt-body > span:not(.gallery-amicro__glyph),
.gallery-amicro__value {
  color: var(--tx-text-color-regular);
  font-size: 12px;
}
.gallery-amicro__glyph {
  display: inline-flex;
  font-size: 28px;
}
/* 1em, so the glyph keeps to the dock's tile as it magnifies. */
.gallery-amicro__dock-icon {
  display: inline-flex;
}
.gallery-amicro__transition-chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
}
.gallery-amicro__chip {
  height: 24px;
  padding: 0 9px;
  border: 0;
  border-radius: 999px;
  background: var(--tx-fill-color-light);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter);
  color: var(--tx-text-color-regular);
  font: inherit;
  font-size: 11.5px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 160ms ease, color 160ms ease, box-shadow 160ms ease;
}
.gallery-amicro__chip:hover {
  background: var(--tx-fill-color);
  color: var(--tx-text-color-primary);
}
.gallery-amicro__chip.is-active {
  background: color-mix(in srgb, var(--tx-color-primary) 12%, var(--tx-bg-color));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-color-primary) 42%, transparent);
  color: var(--tx-color-primary);
}
.gallery-amicro__transition {
  display: flex;
  min-height: 160px;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
  padding: 18px 20px;
  box-sizing: border-box;
  color: #f8fafc;
}
.gallery-amicro__transition.is-dawn {
  background: linear-gradient(135deg, #1d4ed8 0%, #0ea5e9 58%, #38bdf8 100%);
}
.gallery-amicro__transition.is-dusk {
  background: linear-gradient(135deg, #4c1d95 0%, #c026d3 54%, #fb923c 100%);
}
.gallery-amicro__scene-tag {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  opacity: 0.84;
}
.gallery-amicro__scene-desc {
  font-size: 12.5px;
  color: rgba(248, 250, 252, 0.88);
}
.gallery-amicro__value {
  align-self: stretch;
  overflow-wrap: anywhere;
  min-height: 18px;
}
.gallery-amicro__wave {
  width: 100%;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: inset 0 0 0 1px var(--tx-border-color);
}
.gallery-amicro__wave-face {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 20px 16px 60px;
  background: var(--tx-bg-color-overlay, var(--tx-bg-color));
}
.gallery-amicro__wave-face--done {
  background: var(--tx-color-success-light-9, var(--tx-bg-color));
}
.gallery-amicro__wave-face strong {
  font-size: 14px;
  font-weight: 600;
}
.gallery-amicro__wave-face span {
  font-size: 12px;
  color: var(--tx-text-color-regular);
}
.gallery-amicro__wave-overlay {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 12px;
  box-sizing: border-box;
  pointer-events: none;
}
.gallery-amicro__wave-btn {
  padding: 6px 14px;
  border: 0;
  border-radius: 999px;
  background: var(--tx-text-color-primary);
  color: var(--tx-bg-color);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  pointer-events: auto;
}
.gallery-amicro__voice-stage {
  display: grid;
  place-items: center;
  width: 100%;
  height: 176px;
  border-radius: 14px;
  background: #0b0c0f;
  overflow: hidden;
}
.gallery-amicro__pixel {
  width: 100%;
  min-height: 196px;
  cursor: pointer;
}
.gallery-amicro__pixel-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 14px;
  color: #f4f6f8;
  pointer-events: none;
}
.gallery-amicro__pixel-copy strong {
  font-size: 13px;
  font-weight: 500;
}
.gallery-amicro__pixel-copy span {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.56);
}
</style>
