<script setup lang="ts">
import type { DitherSeries, MonoChartData, MonoChartSeriesMode } from '@talex-touch/tuffex/charts'
import type { MotionControlValue } from '@tuffex-components/motion-control'
import type { MotionDockId, MotionDockItem } from '@tuffex-components/motion-dock'
import type { MotionFormValue } from '@tuffex-components/motion-form'
import type { MotionToggleValue } from '@tuffex-components/motion-toggle'
import { TxDitherChart, TxMonoChart } from '@talex-touch/tuffex/charts'
import { computed, ref } from 'vue'
import {
  TxButton,
  TxCardSpread,
  TxCarousel3D,
  TxFlipBook,
  TxMotion,
  TxMotionButton,
  TxMotionControl,
  TxMotionDock,
  TxMotionForm,
  TxMotionLoader,
  TxMotionMetric,
  TxMotionText,
  TxMotionToggle,
  TxMotionTransition,
  TxPhysicsMotion,
} from '#components'

const props = defineProps<{
  kind: 'motion-button' | 'card-spread' | 'carousel-3d' | 'flip-book' | 'motion-loader'
    | 'dither-chart' | 'mono-chart' | 'motion-text' | 'physics-motion' | 'motion-dock'
    | 'motion' | 'motion-toggle' | 'motion-transition' | 'motion-form' | 'motion-control'
    | 'motion-metric'
}>()
const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')
const copy = computed(() => zh.value
  ? {
      star: '标记项目', starred: '已标记项目', cards: '旅行照片', expand: '展开卡片', collapse: '收起卡片',
      carousel: '旅行照片轮播', previous: '上一项', next: '下一项', item: '照片', timeline: '拍摄时间线',
      book: '旅行手记', page: '章节', pages: ['出发', '山路', '湖畔', '归途'],
      pageContent: ['背包六点就收好了。', '雾从松林间散开。', '在湖边歇了很久。', '带回一袋松果。'],
      loader: '正在同步照片', pause: '暂停', resume: '继续', replay: '重放',
      chart: '每周输出', series: '输出', target: '目标', weeks: ['第一周', '第二周', '第三周', '第四周', '第五周'],
      growth: '社区增长', members: '新增成员', legend: '系列', months: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月'],
      period: '时间范围', total: '合计', cursor: '月份', less: '较少', more: '较多',
      single: '单序列', dual: '双序列', col: '列', row: '行', monotone: '单调曲线', natural: '自然曲线',
      showLine: '显示线条', hideLine: '隐藏线条', empty: '暂无数据',
      motionText: '雾散之后，湖面亮了起来', physics: '轨道万向环', dock: '项目 Dock', home: '首页', search: '搜索', settings: '设置',
      dockInstructions: '左右方向键移动焦点，Home 和 End 到首尾。按住 Alt 重排条目，Enter 或空格激活，Escape 取消拖动。',
      dockReordered: '已将 {label} 移到第 {position} 项，共 {total} 项。',
      hover: '悬停或聚焦卡片', hoverBody: '指针位置控制卡片倾斜。',
      toggle: '标记', toggleOn: '已标记', toggleOff: '未标记',
      transition: '切换场景', first: '清晨', second: '傍晚', firstBody: '雾还没散，湖面很静。', secondBody: '晚霞落在对岸的山上。',
      form: '项目名称', placeholder: '输入名称', formValue: '当前值',
      save: '收藏', saved: '已收藏', control: '收藏项目',
      metric: '阅读目标', metricDescription: '本月目标 100 页',
      cardTitles: ['山路', '湖畔', '松林', '海岸', '雪原'], cardDates: ['10/3', '10/4', '10/5', '10/6', '10/7'],
    }
  : {
      star: 'Mark project', starred: 'Project marked', cards: 'Trip photos', expand: 'Expand cards', collapse: 'Collapse cards',
      carousel: 'Trip photo carousel', previous: 'Previous', next: 'Next', item: 'Photo', timeline: 'Photo timeline',
      book: 'Travel journal', page: 'Chapter', pages: ['Depart', 'Trail', 'Lake', 'Home'],
      pageContent: ['Packed and out the door by six.', 'Mist lifting slowly off the pines.', 'A long, lazy lunch by the water.', 'Home with a bag of pine cones.'],
      loader: 'Syncing photos', pause: 'Pause', resume: 'Resume', replay: 'Replay',
      chart: 'Weekly output', series: 'Output', target: 'Target', weeks: ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5'],
      growth: 'Community growth', members: 'New members', legend: 'Series', months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'],
      period: 'Period', total: 'Total', cursor: 'Month', less: 'Less', more: 'More',
      single: 'Single series', dual: 'Dual series', col: 'Column', row: 'Row', monotone: 'Monotone', natural: 'Natural',
      showLine: 'Show line', hideLine: 'Hide line', empty: 'No data',
      motionText: 'The mist lifts and the lake lights up', physics: 'Orbital gimbal', dock: 'Project dock', home: 'Home', search: 'Search', settings: 'Settings',
      dockInstructions: 'Left and Right move focus; Home and End reach the ends. Hold Alt to reorder. Enter or Space activates; Escape cancels a drag.',
      dockReordered: 'Moved {label} to position {position} of {total}.',
      hover: 'Hover or focus the card', hoverBody: 'Pointer position controls the card tilt.',
      toggle: 'Mark', toggleOn: 'Marked', toggleOff: 'Not marked',
      transition: 'Switch scene', first: 'Morning', second: 'Evening', firstBody: 'Mist still on a quiet lake.', secondBody: 'Sunset on the far hills.',
      form: 'Project name', placeholder: 'Enter a name', formValue: 'Current value',
      save: 'Save', saved: 'Saved', control: 'Save project',
      metric: 'Reading goal', metricDescription: 'Monthly target: 100 pages',
      cardTitles: ['Trail', 'Lake', 'Pines', 'Coast', 'Snow'], cardDates: ['Oct 3', 'Oct 4', 'Oct 5', 'Oct 6', 'Oct 7'],
    })

// This component is mounted inside DocsGallerySpecimen. Its models belong to
// the remounted subtree, so Reset restores the actual interactions, not just CSS.
const selected = ref(false)
const cardIndex = ref(0)
const expanded = ref(false)
const carouselIndex = ref(2)
const bookIndex = ref(1)
const playing = ref(true)
const textReplay = ref(0)
const toggleValue = ref<MotionToggleValue>(false)
const controlValue = ref<MotionControlValue>(false)
const formValue = ref<MotionFormValue>('')
const transitionKey = ref('one')
const dockOrder = ref<MotionDockId[]>(['home', 'search', 'settings'])
const dockActive = ref<MotionDockId>('home')
const monoMode = ref<MonoChartSeriesMode>('single')
const ditherKeys = ref(['members'])
const ditherCursor = ref<number | null>(null)
const dockItems = computed<MotionDockItem[]>({
  get: () => dockOrder.value.map(id => ({
    id,
    label: id === 'home' ? copy.value.home : id === 'search' ? copy.value.search : copy.value.settings,
  })),
  set: items => { dockOrder.value = items.map(item => item.id) },
})
const cards = computed(() => copy.value.cardTitles.map((title, index) => ({
  id: `card-${index}`, title, description: copy.value.cardDates[index],
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
</script>

<template>
  <div class="gallery-amicro not-prose" :data-kind="props.kind">
    <TxMotionButton
      v-if="kind === 'motion-button'"
      source-id="2"
      :label="copy.star"
      :active-label="copy.starred"
      :selected="selected"
      size="sm"
      @click="selected = !selected"
    />
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
      variant="card-cover-flow-mono"
      size="sm"
      :aria-label="copy.carousel"
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
      :labels="{ chart: copy.growth, series: copy.legend, period: copy.period, total: copy.total, cursor: copy.cursor, less: copy.less, more: copy.more, empty: copy.empty }"
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
      size="sm"
      :labels="{ dock: copy.dock, instructions: copy.dockInstructions, reordered: copy.dockReordered }"
    >
      <template #icon="{ item }">
<span class="gallery-amicro__dock-icon" :class="item.id === 'home' ? 'i-carbon-home' : item.id === 'search' ? 'i-carbon-search' : 'i-carbon-settings'" aria-hidden="true" />
</template>
    </TxMotionDock>
    <TxMotion v-else-if="kind === 'motion'" variant="tilt-card" :max-tilt="14" :label="copy.hover" tabindex="0" class="gallery-amicro__tilt">
      <span class="gallery-amicro__tilt-body">
        <span class="i-carbon-cube gallery-amicro__glyph" aria-hidden="true" />
        <strong>{{ copy.hover }}</strong>
        <span>{{ copy.hoverBody }}</span>
      </span>
    </TxMotion>
    <TxMotionToggle v-else-if="kind === 'motion-toggle'" v-model="toggleValue" variant="t-bookmark" :label="copy.toggle" :on-label="copy.toggleOn" :off-label="copy.toggleOff" size="sm" />
    <template v-else-if="kind === 'motion-transition'">
      <TxMotionTransition :model-value="transitionKey" variant="spatial-door-portal" mode="card" size="sm" :aria-label="copy.transition">
        <template #default="{ key }">
          <div class="gallery-amicro__transition">
<strong>{{ key === 'one' ? copy.first : copy.second }}</strong><span>{{ key === 'one' ? copy.firstBody : copy.secondBody }}</span>
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
.gallery-amicro > :deep(.tx-motion-transition),
.gallery-amicro > :deep(.tx-motion-form),
.gallery-amicro > :deep(.tx-dither-chart),
.gallery-amicro > :deep(.tx-mono-chart),
.gallery-amicro > :deep(.tx-motion-metric) {
  width: 100%;
  min-width: 0;
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
  font-size: 14px;
  font-weight: 500;
}
.gallery-amicro__tilt-body > span:not(.gallery-amicro__glyph),
.gallery-amicro__transition > span,
.gallery-amicro__value {
  color: var(--tx-text-color-regular);
  font-size: 12px;
}
.gallery-amicro__glyph {
  display: inline-flex;
  font-size: 28px;
}
.gallery-amicro__dock-icon {
  display: inline-flex;
  font-size: 22px;
}
.gallery-amicro__transition {
  display: flex;
  min-height: 136px;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
}
.gallery-amicro__value {
  align-self: stretch;
  overflow-wrap: anywhere;
  min-height: 18px;
}
</style>
