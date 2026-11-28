<script setup lang="ts">
import type { MotionTextItem, MotionTextRevealDirection, MotionTextTrigger, MotionTextVariant, TxMotionTextInstance } from '@talex-touch/tuffex/motion-text'
import { MOTION_TEXT_VARIANTS, TxMotionText } from '@talex-touch/tuffex/motion-text'
import { computed, ref } from 'vue'

const { locale } = useI18n()
const zh = computed(() => locale.value.startsWith('zh'))
const copy = computed(() => zh.value ? {
  title: '全部 45 个目录效果与 7 个源码 / registry 扩展', search: '筛选名称、分组或原始 ID',
  text: '文字（可换行）', replay: '回放', reset: '恢复原文', next: '下一个效果', pause: '暂停动态效果',
  selected: '当前效果', trigger: '触发方式', default: '源码默认', view: '进入可视区域', hover: '悬停 / 键盘聚焦', manual: '手动调用',
  hint: '逐个选择效果。字符使用完整字素，词使用 Intl.Segmenter；复制内容仍是完整原文。悬停类请移动到字 / 词上，或使用 Tab 聚焦。',
  values: '替换文字（TextMorph）', sample: '设计动效，保留原文 👩🏽‍💻 é', alternate: '中文、emoji 👨‍👩‍👧‍👦 与组合字符 ä\n第二行：Motion text',
  sequential: '逐字揭示', original: '只用原文字素', direction: '揭示方向', start: '从开头', end: '从末尾', center: '从中心',
  pool: '替换用字素',
  brackets: '焦点括号', blur: '其它项模糊量', chosen: '已选择', design: '设计', motion: '动效', physics: '物理', textItem: '文字',
  mediaSrc: '媒体 URL', mediaType: '媒体类型', image: '图片', video: '视频', slot: '改用 media 插槽',
  first: '创造', second: '体验', mediaAlt: '抽象彩色纹理', slotAlt: '彩色色块图形',
  error: '媒体无法加载，请检查 URL。', sources: '固定来源', catalog: '选择命名变体', noResults: '没有匹配的效果',
} : {
  title: 'All 45 catalog effects and 7 source / registry additions', search: 'Filter by name, group or original ID',
  text: 'Text (line breaks allowed)', replay: 'Replay', reset: 'Restore original', next: 'Next effect', pause: 'Pause motion',
  selected: 'Selected effect', trigger: 'Trigger', default: 'Source default', view: 'Enter viewport', hover: 'Hover / keyboard focus', manual: 'Manual API',
  hint: 'Select each effect. Characters are whole graphemes and words use Intl.Segmenter; copying retains the original. For hover effects, point at a character / word or focus with Tab.',
  values: 'Replace text (TextMorph)', sample: 'Design motion, 保留原文 👩🏽‍💻 é', alternate: 'Chinese, emoji 👨‍👩‍👧‍👦 and combining marks ä\nSecond line: Motion text',
  sequential: 'Sequential reveal', original: 'Original graphemes only', direction: 'Reveal direction', start: 'From start', end: 'From end', center: 'From center',
  pool: 'Replacement graphemes',
  brackets: 'Focus brackets', blur: 'Peer blur amount', chosen: 'Selected', design: 'Design', motion: 'Motion', physics: 'Physics', textItem: 'Text',
  mediaSrc: 'Media URL', mediaType: 'Media type', image: 'Image', video: 'Video', slot: 'Use the media slot',
  first: 'Crafting', second: 'experiences', mediaAlt: 'Abstract colorful texture', slotAlt: 'Color block graphic',
  error: 'Media could not load. Check the URL.', sources: 'Pinned source', catalog: 'Select a named variant', noResults: 'No matching effects',
})
const chineseNames: Record<MotionTextVariant, string> = {
  'txt-dia': '斜向遮罩揭示', 'txt-blur': '整段模糊揭示', 'txt-shimmer': '渐变微光', 'txt-typewriter': '打字与光标',
  'txt-reveal': '水平遮罩揭示', 'txt-fade-char': '字素淡入', 'txt-fade-word': '词淡入', 'txt-fade-text': '整段淡入',
  'txt-blurup-word': '词模糊上升', 'txt-blurup-char': '字素模糊上升', 'txt-stagger': '词错峰上升',
  'txt-slideup-char': '字素向上滑入', 'txt-slideup-word': '词向上滑入', 'txt-slideup-text': '整段向上滑入',
  'txt-slidedown-char': '字素向下滑入', 'txt-slidedown-word': '词向下滑入', 'txt-slideleft-char': '字素从右滑入', 'txt-slideright-char': '字素从左滑入',
  'txt-dropin-char': '字素弹簧下落', 'txt-riseup-word': '词弹簧升起', 'txt-bouncein-char': '字素弹跳缩放',
  'txt-scalein-char': '字素弹簧缩放', 'txt-scalein-word': '词缩放淡入', 'txt-scalein-text': '整段弹簧缩放',
  'txt-zoomin-text': '整段远处放大', 'txt-zoomout-text': '整段近处缩小', 'txt-flipy-char': '字素 Y 轴翻转', 'txt-flipx-char': '字素 X 轴翻转',
  'txt-rotatein-char': '字素旋转缩放', 'txt-swing-word': '词摆动', 'txt-stretchx-char': '字素横向拉伸', 'txt-stretchy-char': '字素纵向拉伸',
  'txt-skewx-char': '字素倾斜恢复', 'txt-trackingin-text': '宽字距收拢', 'txt-trackingout-text': '紧字距展开',
  'txt-spring-text': '文字悬停弹簧', 'txt-hoverlift-char': '字素悬停抬升', 'txt-hoverlift-word': '词悬停抬升',
  'txt-hoverscale-char': '字素悬停放大', 'txt-hoverscale-word': '词悬停放大', 'txt-float-char': '字素持续浮动', 'txt-float-word': '词持续浮动',
  'txt-pulse-char': '字素透明度脉冲', 'txt-pulse-word': '词透明度脉冲', 'txt-glow-text': '整段光晕',
  'registry-blur-text': 'Registry 字素模糊', 'character-stagger': 'Registry 字素错峰弹簧', 'text-reveal': 'Registry 逐行揭示', 'word-reveal': 'Registry 词缩放揭示',
  'scramble-hover': '悬停乱序揭示', 'media-between-text': '文字间媒体', 'focus-blur': '焦点与同级模糊',
}
const groupNames: Record<string, string> = {
  'Featured': '精选', 'Reveals': '揭示', 'Slide & Drop': '滑入与下落', 'Scale & Zoom': '缩放',
  '3D & Rotate': '3D 与旋转', 'Distortion & Spacing': '形变与间距', 'Hover & Interactive': '悬停交互',
  'Continuous': '持续动态', 'Registry': 'Registry 扩展', 'Source': '源码扩展',
}
const selected = ref<MotionTextVariant>('txt-dia')
const filter = ref('')
const draft = ref('Design motion, 设计动效 👩🏽‍💻 é')
const paused = ref(false)
const replayKey = ref(0)
const instance = ref<TxMotionTextInstance | null>(null)
const triggerChoice = ref<'default' | MotionTextTrigger>('default')
const sequential = ref(true)
const originalOnly = ref(true)
const characters = ref('!<>-_\\/[]{}—=+*^?#________')
const direction = ref<MotionTextRevealDirection>('start')
const showBrackets = ref(true)
const blurAmount = ref(4)
const useMediaSlot = ref(false)
const mediaType = ref<'image' | 'video'>('image')
const mediaSrc = ref('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=160&auto=format&fit=crop&q=80')
const mediaFailed = ref(false)
const chosen = ref('')
const triggerOverride = computed(() => triggerChoice.value === 'default' ? undefined : triggerChoice.value)
const selectedInfo = computed(() => MOTION_TEXT_VARIANTS.find(item => item.id === selected.value) ?? MOTION_TEXT_VARIANTS[0]!)
const variants = computed(() => MOTION_TEXT_VARIANTS.filter(item => {
  const haystack = `${item.id} ${item.name} ${item.group} ${chineseNames[item.id]} ${groupNames[item.group]}`.toLowerCase()
  return haystack.includes(filter.value.trim().toLowerCase())
}))
const groups = computed(() => [...new Set(variants.value.map(item => item.group))].map(group => ({
  name: zh.value ? groupNames[group] ?? group : group,
  entries: variants.value.filter(item => item.group === group),
})))
const items = computed<MotionTextItem[]>(() => [
  { id: 'design', label: copy.value.design }, { id: 'motion', label: copy.value.motion },
  { id: 'physics', label: copy.value.physics }, { id: 'text', label: copy.value.textItem },
])
const triggerOptions = computed(() => [
  { value: 'default', label: copy.value.default }, { value: 'in-view', label: copy.value.view },
  { value: 'hover', label: copy.value.hover }, { value: 'manual', label: copy.value.manual },
])
const directionOptions = computed(() => [
  { value: 'start', label: copy.value.start }, { value: 'end', label: copy.value.end }, { value: 'center', label: copy.value.center },
])
const mediaOptions = computed(() => [{ value: 'image', label: copy.value.image }, { value: 'video', label: copy.value.video }])
function choose(variant: MotionTextVariant): void {
  selected.value = variant
  replayKey.value++
  chosen.value = ''
  mediaFailed.value = false
}
function next(): void {
  const entries = variants.value
  if (!entries.length)
    return
  const index = entries.findIndex(item => item.id === selected.value)
  choose(entries[(index + 1) % entries.length]!.id)
}
function replaceText(): void {
  draft.value = draft.value === copy.value.alternate ? copy.value.sample : copy.value.alternate
}
function updateTrigger(value: unknown): void {
  if (value === 'default' || value === 'in-view' || value === 'hover' || value === 'manual')
    triggerChoice.value = value
}
function updateDirection(value: unknown): void {
  if (value === 'start' || value === 'end' || value === 'center')
    direction.value = value
}
function updateMediaType(value: unknown): void {
  if (value === 'image' || value === 'video')
    mediaType.value = value
}
function updateBlur(value: unknown): void {
  if (typeof value === 'number')
    blurAmount.value = value
}
</script>

<template>
  <section class="motion-text-demo not-prose">
    <p class="motion-text-demo__intro">
{{ copy.title }}
</p>
    <p class="motion-text-demo__help">
{{ copy.hint }}
</p>
    <div class="motion-text-demo__controls">
      <TxButton @click="replayKey++">
{{ copy.replay }}
</TxButton>
      <TxButton @click="instance?.reset()">
{{ copy.reset }}
</TxButton>
      <TxButton @click="next">
{{ copy.next }}
</TxButton>
      <TxButton @click="replaceText">
{{ copy.values }}
</TxButton>
      <TxSwitch v-model="paused" :label="copy.pause" />
    </div>
    <div class="motion-text-demo__field">
      <span>{{ copy.text }}</span>
      <TxTextarea v-model="draft" :aria-label="copy.text" :rows="2" />
    </div>
    <div class="motion-text-demo__field">
      <span>{{ copy.trigger }}</span>
      <TxSelect :model-value="triggerChoice" :options="triggerOptions" :aria-label="copy.trigger" @update:model-value="updateTrigger" />
    </div>
    <div v-if="selected === 'scramble-hover'" class="motion-text-demo__controls">
      <TxSwitch v-model="sequential" :label="copy.sequential" />
      <TxSwitch v-model="originalOnly" :label="copy.original" />
      <TxSelect :model-value="direction" :options="directionOptions" :aria-label="copy.direction" @update:model-value="updateDirection" />
      <TxInput v-if="!originalOnly" :model-value="characters" :aria-label="copy.pool" :placeholder="copy.pool" @update:model-value="characters = String($event)" />
    </div>
    <div v-if="selected === 'focus-blur'" class="motion-text-demo__controls">
      <TxSwitch v-model="showBrackets" :label="copy.brackets" />
      <div class="motion-text-demo__field">
<span>{{ copy.blur }}</span><TxSlider :model-value="blurAmount" :min="0" :max="8" :step="1" :aria-label="copy.blur" @update:model-value="updateBlur" />
</div>
    </div>
    <div v-if="selected === 'media-between-text'" class="motion-text-demo__fields">
      <div class="motion-text-demo__field">
<span>{{ copy.mediaSrc }}</span><TxInput :model-value="mediaSrc" :aria-label="copy.mediaSrc" @update:model-value="mediaSrc = String($event); mediaFailed = false" />
</div>
      <div class="motion-text-demo__field">
<span>{{ copy.mediaType }}</span><TxSelect :model-value="mediaType" :options="mediaOptions" :aria-label="copy.mediaType" @update:model-value="updateMediaType" />
</div>
      <TxSwitch v-model="useMediaSlot" :label="copy.slot" />
    </div>
    <div class="motion-text-demo__stage">
      <TxMotionText
        ref="instance" :variant="selected" :text="draft" :locale="locale" :paused="paused" :replay-key="replayKey"
        :trigger="triggerOverride" :sequential="sequential" :reveal-direction="direction" :use-original-chars-only="originalOnly"
        :characters="characters"
        :first-text="copy.first" :second-text="copy.second" :media-src="mediaSrc" :media-type="mediaType" :media-alt="copy.mediaAlt"
        :items="items" :show-brackets="showBrackets" :blur-amount="blurAmount"
        @select="chosen = $event.label" @media-error="mediaFailed = true"
      >
        <template v-if="useMediaSlot" #media="{ open }">
          <svg viewBox="0 0 70 40" role="img" :aria-label="copy.slotAlt">
            <rect width="70" height="40" fill="var(--tx-color-primary-light-9)" />
            <path d="M0 40 32 0h18L18 40Z" fill="var(--tx-color-primary)" />
            <circle :cx="open ? 54 : 42" cy="20" r="9" fill="var(--tx-color-success)" />
          </svg>
        </template>
      </TxMotionText>
    </div>
    <p class="motion-text-demo__selected">
<span>{{ copy.selected }} · </span><code>{{ selectedInfo.id }}</code> {{ zh ? chineseNames[selectedInfo.id] : selectedInfo.name }}
</p>
    <p v-if="chosen" class="motion-text-demo__help" role="status">
{{ copy.chosen }}: {{ chosen }}
</p>
    <p v-if="mediaFailed" class="motion-text-demo__error" role="status">
{{ copy.error }}
</p>
    <details class="motion-text-demo__sources">
<summary>{{ copy.sources }}</summary><code v-for="source in selectedInfo.sourceRefs" :key="source">{{ source }}</code>
</details>
    <TxInput :model-value="filter" :placeholder="copy.search" :aria-label="copy.search" @update:model-value="filter = String($event)" />
    <div class="motion-text-demo__catalog" :aria-label="copy.catalog">
      <div v-for="group in groups" :key="group.name" class="motion-text-demo__group">
        <h3>{{ group.name }}</h3>
        <div class="motion-text-demo__variants">
          <button
            v-for="item in group.entries" :key="item.id" type="button" :aria-pressed="selected === item.id"
            :class="{ 'is-selected': selected === item.id }" @click="choose(item.id)"
          >
            <span>{{ zh ? chineseNames[item.id] : item.name }}</span><code>{{ item.id }}</code>
          </button>
        </div>
      </div>
      <p v-if="!variants.length" class="motion-text-demo__help">
{{ copy.noResults }}
</p>
    </div>
  </section>
</template>

<style scoped>
.motion-text-demo { display: grid; gap: 14px; color: var(--tx-text-color-primary); font-size: 14px; }
.motion-text-demo__intro { margin: 0; font-weight: 500; }
.motion-text-demo__help { margin: 0; color: var(--tx-text-color-regular); font-size: 13px; line-height: 1.6; }
.motion-text-demo__controls { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
.motion-text-demo__field { display: grid; gap: 6px; min-width: 160px; font-size: 13px; }
.motion-text-demo__fields { display: grid; gap: 10px; }
.motion-text-demo__stage { min-height: 128px; padding: 24px; display: grid; place-items: center; overflow: auto; background: var(--tx-fill-color-light); box-shadow: inset 0 0 0 1px var(--tx-border-color); border-radius: 12px; }
.motion-text-demo__selected { margin: 0; font-size: 13px; }
.motion-text-demo__selected code, .motion-text-demo__sources code { font-size: 0.9em; }
.motion-text-demo__sources { font-size: 12px; color: var(--tx-text-color-regular); }
.motion-text-demo__sources summary { cursor: pointer; }
.motion-text-demo__sources code { display: block; padding-top: 4px; overflow-wrap: anywhere; }
.motion-text-demo__error { margin: 0; color: var(--tx-text-color-primary); font-size: 13px; }
.motion-text-demo__catalog, .motion-text-demo__group { display: grid; gap: 10px; }
.motion-text-demo__group h3 { margin: 0; font-size: 13px; font-weight: 500; }
.motion-text-demo__variants { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 6px; }
.motion-text-demo__variants button { display: grid; gap: 3px; padding: 8px 10px; border: 0; border-radius: 6px; text-align: start; color: var(--tx-text-color-regular); background: var(--tx-fill-color-light); font: inherit; font-size: 13px; cursor: pointer; }
.motion-text-demo__variants button.is-selected { color: var(--tx-text-color-primary); box-shadow: inset 0 0 0 1px var(--tx-color-primary); background: var(--tx-color-primary-light-9); }
.motion-text-demo__variants button:hover { color: var(--tx-text-color-primary); }
.motion-text-demo__variants button:focus-visible { outline: 2px solid var(--tx-color-primary); outline-offset: 2px; }
.motion-text-demo__variants code { font-size: 11px; }
</style>
