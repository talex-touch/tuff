<script setup lang="ts">
import type { Component } from 'vue'
import { computed, defineAsyncComponent, onMounted, ref, shallowRef } from 'vue'
import './GalleryBaseSuite.css'
import { galleryText } from '../gallery-text'
import ClientOnly from '../GallerySpecimenGate.vue'

const props = defineProps<{
  docPath: (slug: string) => string
  cellLabel: (en: string, zh: string) => string
  localeKey: 'en' | 'zh'
}>()

const { t } = useI18n()

const galleryAmicroSpecimen = shallowRef<Component | null>(null)
const GalleryFusion = defineAsyncComponent(() => import('../GalleryFusion.vue'))
const GalleryFusionSurface = defineAsyncComponent(() => import('../GalleryFusionSurface.vue'))
const GalleryLiquidMenu = defineAsyncComponent(() => import('../GalleryLiquidMenu.vue'))
const GalleryTextMorph = defineAsyncComponent(() => import('../GalleryTextMorph.vue'))
const GalleryTransitionLanes = defineAsyncComponent(() => import('../GalleryTransitionLanes.vue'))

onMounted(() => {
  void import('../GalleryAmicroSpecimen.vue').then(({ default: component }) => {
    galleryAmicroSpecimen.value = component
  })
})

const text = computed(() => galleryText[props.localeKey])

type MotionCategoryKey
  = | 'motionButtons'
    | 'motionControls'
    | 'motionTransitions'
    | 'motionMorph'
    | 'motionText'
    | 'motionCards'
    | 'motionCarousels'
    | 'motionInteraction'
    | 'motionPhysics'
    | 'motionLoaders'
    | 'motionCharts'

const categoryOrder: Array<{ id: string, key: MotionCategoryKey }> = [
  { id: 'motion-cat-motionbuttons', key: 'motionButtons' },
  { id: 'motion-cat-motioncontrols', key: 'motionControls' },
  { id: 'motion-cat-motiontransitions', key: 'motionTransitions' },
  { id: 'motion-cat-motionmorph', key: 'motionMorph' },
  { id: 'motion-cat-motiontext', key: 'motionText' },
  { id: 'motion-cat-motioncards', key: 'motionCards' },
  { id: 'motion-cat-motioncarousels', key: 'motionCarousels' },
  { id: 'motion-cat-motioninteraction', key: 'motionInteraction' },
  { id: 'motion-cat-motionphysics', key: 'motionPhysics' },
  { id: 'motion-cat-motionloaders', key: 'motionLoaders' },
  { id: 'motion-cat-motioncharts', key: 'motionCharts' },
]

const categoryMeta = computed<Record<MotionCategoryKey, { label: string, desc: string, icon: string, count: number }>>(() => ({
  motionButtons: {
    label: t('docsSidebar.categories.motionButtons'),
    desc: props.localeKey === 'zh' ? '13 类按钮微动效、计数与粒子反馈' : '13 button micro-interactions, counters, and bursts',
    icon: 'i-carbon-cursor-1',
    count: 1,
  },
  motionControls: {
    label: t('docsSidebar.categories.motionControls'),
    desc: props.localeKey === 'zh' ? '动效表单校验、交互胶囊与复合控件' : 'Animated form controls, pills, and compound inputs',
    icon: 'i-carbon-settings-adjust',
    count: 2,
  },
  motionTransitions: {
    label: t('docsSidebar.categories.motionTransitions'),
    desc: props.localeKey === 'zh' ? '双门液体波、色散折射波、错峰入场、翻转叠层与折页' : 'Portals, distortion waves, transitions, stagger, flip, and fold',
    icon: 'i-carbon-arrows-horizontal',
    count: 6,
  },
  motionMorph: {
    label: t('docsSidebar.categories.motionMorph'),
    desc: props.localeKey === 'zh' ? '容器形变、描边图标形变、液态与元球交融' : 'Shape morphing, stroke icon morphs, liquid, and metaball fusion',
    icon: 'i-carbon-shapes',
    count: 5,
  },
  motionText: {
    label: t('docsSidebar.categories.motionText'),
    desc: props.localeKey === 'zh' ? '字符动效、局部文本形变、变换与路径描边' : 'Text choreography, character morphs, transformers, and stroke paths',
    icon: 'i-carbon-text-font',
    count: 5,
  },
  motionCards: {
    label: t('docsSidebar.categories.motionCards'),
    desc: props.localeKey === 'zh' ? '弧形、扇形、印章与可抽出选择的卡片堆' : 'Arc, fan, stamp, and draggable pull-to-select card decks',
    icon: 'i-carbon-layers',
    count: 1,
  },
  motionCarousels: {
    label: t('docsSidebar.categories.motionCarousels'),
    desc: props.localeKey === 'zh' ? '弧线、CoverFlow、时间机器与双面翻页书' : 'Arc, CoverFlow, Time Machine, and draggable flip books',
    icon: 'i-carbon-carousel-horizontal',
    count: 2,
  },
  motionInteraction: {
    label: t('docsSidebar.categories.motionInteraction'),
    desc: props.localeKey === 'zh' ? '悬停倾斜、磁吸应用栏、像素粒子场与语音光环' : 'Tilt, pointer & scroll motion, app dock, pixel field, and voice ring',
    icon: 'i-carbon-touch-1',
    count: 4,
  },
  motionPhysics: {
    label: t('docsSidebar.categories.motionPhysics'),
    desc: props.localeKey === 'zh' ? '可抓取交互的弹簧与物理模拟场景' : 'Grabbable spring and physical simulation scenes',
    icon: 'i-carbon-chemistry',
    count: 1,
  },
  motionLoaders: {
    label: t('docsSidebar.categories.motionLoaders'),
    desc: props.localeKey === 'zh' ? '呼吸、轨道与骨架节奏的多样加载动效' : 'Breathing, orbital, and rhythmic loading scenes',
    icon: 'i-carbon-renew',
    count: 1,
  },
  motionCharts: {
    label: t('docsSidebar.categories.motionCharts'),
    desc: props.localeKey === 'zh' ? '像素抖动图表与多周期动效复合指标' : 'Dithered pixel charts and animated multi-period metrics',
    icon: 'i-carbon-chart-line-data',
    count: 2,
  },
}))

const copy = computed(() => (props.localeKey === 'zh'
  ? {
      online: '在线',
      syncing: '同步中',
      aboutTitle: 'Tuffex 是什么？',
      aboutBody: '一套服务 Talex Touch 生态的 Vue 组件库。',
      foldCardTitle: '折角预览',
      foldCardHint: '悬停或点击右下角掀开',
      foldUnderTitle: '底层已解锁',
      liquidToggle: '展开菜单',
      liquidItems: ['收藏', '夜间模式', '音乐'] as [string, string, string],
      transformerStages: [
        {
          title: '正在同步 148 个文件',
          desc: '支持多行自动换行与旧色残留模糊过渡，适合状态说明与摘要切换。',
          tone: 'primary' as const,
        },
        {
          title: 'v0.9.6 已发布就绪',
          desc: '主题色随状态平滑切换，新旧两层按模糊曲线交叉淡入淡出。',
          tone: 'success' as const,
        },
        {
          title: '索引缓存接近上限',
          desc: '长文案自动折行且不撑破容器，区别于单行逐字形变的 TextMorph。',
          tone: 'warning' as const,
        },
      ],
      next: '下一步',
      hoverMe: '悬停',
      morphCollapsed: '展开详情',
      morphTitle: 'Studio Buds',
      morphSub: '已连接 · 82%',
      morphClose: '收起',
      iconNext: '切换图标',
      textMorphLabel: '切换数值',
      textMorphItems: ['同步 12 项 · 98.4%', '同步 148 项 · 99.9%', '已完成 256 项 · 100%'],
      catNavLabel: '动效套件分类导航',
    }
  : {
      online: 'Online',
      syncing: 'Syncing',
      aboutTitle: 'What is Tuffex?',
      aboutBody: 'A Vue component family powering the Talex Touch ecosystem.',
      foldCardTitle: 'Corner Peel',
      foldCardHint: 'Hover or click corner to peel',
      foldUnderTitle: 'Underlay unlocked',
      liquidToggle: 'Toggle menu',
      liquidItems: ['Favorite', 'Night mode', 'Music'] as [string, string, string],
      transformerStages: [
        {
          title: 'Syncing 148 files',
          desc: 'Multi-line blur crossfade with color preservation for status copy.',
          tone: 'primary' as const,
        },
        {
          title: 'Published v0.9.6',
          desc: 'Old tone fades out softly while the new status blurs into focus.',
          tone: 'success' as const,
        },
        {
          title: 'Cache quota warning',
          desc: 'Wraps across lines cleanly, unlike single-line glyph TextMorph.',
          tone: 'warning' as const,
        },
      ],
      next: 'Next',
      hoverMe: 'hover me',
      morphCollapsed: 'Inspect card',
      morphTitle: 'Studio Buds',
      morphSub: 'Connected · 82%',
      morphClose: 'Collapse',
      iconNext: 'Morph icon',
      textMorphLabel: 'Next readout',
      textMorphItems: ['Synced 12 items · 98.4%', 'Synced 148 items · 99.9%', 'Done 256 items · 100%'],
      catNavLabel: 'Motion Suite category navigation',
    }))

const laneStates = computed<[string, string]>(() => [copy.value.online, copy.value.syncing])
const flipped = ref(false)
const flipTriggerRef = ref<{ $el?: HTMLElement } | null>(null)
const flipTriggerEl = computed(() => flipTriggerRef.value?.$el ?? null)
const foldGalleryPeeled = ref(false)

const morphExpanded = ref(false)
const morphIcons = ['play', 'pause', 'check', 'menu', 'close'] as const
const morphIconIndex = ref(0)
const currentMorphIcon = computed(() => morphIcons[morphIconIndex.value % morphIcons.length]!)

const textMorphIndex = ref(0)
const currentTextMorph = computed(() => copy.value.textMorphItems[textMorphIndex.value % copy.value.textMorphItems.length]!)

const logoModes = computed(() => [
  { value: 'once' as const, label: 'once' },
  { value: 'breathe' as const, label: 'breathe' },
  { value: 'hover' as const, label: copy.value.hoverMe },
])
</script>

<template>
  <div class="docs-gallery__motion">
    <nav class="docs-gallery__cat-nav not-prose" :aria-label="copy.catNavLabel">
      <a
        v-for="cat in categoryOrder"
        :key="cat.id"
        class="docs-gallery__cat-pill"
        :href="`#${cat.id}`"
      >
        <span :class="categoryMeta[cat.key].icon" class="docs-gallery__cat-pill-icon" aria-hidden="true" />
        <span>{{ categoryMeta[cat.key].label }}</span>
        <span class="docs-gallery__cat-pill-count">{{ categoryMeta[cat.key].count }}</span>
      </a>
    </nav>

    <!-- 1. MotionButtons -->
    <section id="motion-cat-motionbuttons" class="docs-gallery__cat-section">
      <header class="docs-gallery__cat-head not-prose">
        <div class="docs-gallery__cat-meta">
          <span class="docs-gallery__cat-title-wrap">
            <span :class="categoryMeta.motionButtons.icon" class="docs-gallery__cat-icon" aria-hidden="true" />
            <h3 class="docs-gallery__cat-title">{{ categoryMeta.motionButtons.label }}</h3>
          </span>
          <span class="docs-gallery__cat-desc">{{ categoryMeta.motionButtons.desc }}</span>
        </div>
        <span class="docs-gallery__cat-count">{{ categoryMeta.motionButtons.count }}</span>
      </header>
      <div class="docs-gallery__grid">
        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('motion-button')">
            {{ cellLabel('MotionButton', '动效按钮') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <component :is="galleryAmicroSpecimen" v-if="galleryAmicroSpecimen" kind="motion-button" />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>
      </div>
    </section>

    <!-- 2. MotionControls -->
    <section id="motion-cat-motioncontrols" class="docs-gallery__cat-section">
      <header class="docs-gallery__cat-head not-prose">
        <div class="docs-gallery__cat-meta">
          <span class="docs-gallery__cat-title-wrap">
            <span :class="categoryMeta.motionControls.icon" class="docs-gallery__cat-icon" aria-hidden="true" />
            <h3 class="docs-gallery__cat-title">{{ categoryMeta.motionControls.label }}</h3>
          </span>
          <span class="docs-gallery__cat-desc">{{ categoryMeta.motionControls.desc }}</span>
        </div>
        <span class="docs-gallery__cat-count">{{ categoryMeta.motionControls.count }}</span>
      </header>
      <div class="docs-gallery__grid">
        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('motion-control')">
            {{ cellLabel('MotionControl', '复合控件') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <component :is="galleryAmicroSpecimen" v-if="galleryAmicroSpecimen" kind="motion-control" />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('motion-form')">
            {{ cellLabel('MotionForm', '动效表单') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <component :is="galleryAmicroSpecimen" v-if="galleryAmicroSpecimen" kind="motion-form" />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>
      </div>
    </section>

    <!-- 3. MotionTransitions -->
    <section id="motion-cat-motiontransitions" class="docs-gallery__cat-section">
      <header class="docs-gallery__cat-head not-prose">
        <div class="docs-gallery__cat-meta">
          <span class="docs-gallery__cat-title-wrap">
            <span :class="categoryMeta.motionTransitions.icon" class="docs-gallery__cat-icon" aria-hidden="true" />
            <h3 class="docs-gallery__cat-title">{{ categoryMeta.motionTransitions.label }}</h3>
          </span>
          <span class="docs-gallery__cat-desc">{{ categoryMeta.motionTransitions.desc }}</span>
        </div>
        <span class="docs-gallery__cat-count">{{ categoryMeta.motionTransitions.count }}</span>
      </header>
      <div class="docs-gallery__grid">
        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('motion-transition')">
            {{ cellLabel('MotionTransition', '动效转场') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 232px">
            <ClientOnly>
              <component :is="galleryAmicroSpecimen" v-if="galleryAmicroSpecimen" kind="motion-transition" />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('distortion-wave')">
            {{ cellLabel('DistortionWave', '折射波转场') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 232px">
            <ClientOnly>
              <component :is="galleryAmicroSpecimen" v-if="galleryAmicroSpecimen" kind="distortion-wave" />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('transition')">
            {{ cellLabel('Transition', '过渡') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 154px">
            <ClientOnly>
              <GalleryTransitionLanes :states="laneStates" />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('stagger')">
            {{ cellLabel('Stagger', '错峰入场') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <TxStagger class="docs-gallery__stagger" name="docs-gallery-stagger" :duration="420" :delay-step="70">
                <div v-for="item in text.staggerItems" :key="item.icon" class="docs-gallery__tile docs-gallery__stagger-item">
                  <span :class="item.icon" aria-hidden="true" />
                  {{ item.label }}
                </div>
              </TxStagger>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('flip-overlay')">
            {{ cellLabel('FlipOverlay', '翻转叠层') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <TxButton ref="flipTriggerRef" @click="flipped = true">
                {{ copy.aboutTitle }}
              </TxButton>
              <TxFlipOverlay
                v-model="flipped"
                :source="flipTriggerEl"
                :header-title="copy.aboutTitle"
                :card-style="{ width: 'min(92vw, 340px)' }"
              >
                <p class="docs-gallery__flip-body">
                  {{ copy.aboutBody }}
                </p>
              </TxFlipOverlay>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('fold-page')">
            {{ cellLabel('FoldPage', '折页') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 150px">
            <ClientOnly>
              <div class="docs-gallery__fold">
                <TxFoldCorner v-model="foldGalleryPeeled" corner="bottom-right" size="sm" :radius="14">
                  <template #default>
                    <div class="docs-gallery__fold-sheet">
                      <span class="docs-gallery__fold-title">{{ copy.foldCardTitle }}</span>
                      <span class="docs-gallery__fold-hint">{{ copy.foldCardHint }}</span>
                    </div>
                  </template>
                  <template #under>
                    <div class="docs-gallery__fold-under">
                      <span class="docs-gallery__fold-title">{{ copy.foldUnderTitle }}</span>
                    </div>
                  </template>
                </TxFoldCorner>
              </div>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>
      </div>
    </section>

    <!-- 4. MotionMorph -->
    <section id="motion-cat-motionmorph" class="docs-gallery__cat-section">
      <header class="docs-gallery__cat-head not-prose">
        <div class="docs-gallery__cat-meta">
          <span class="docs-gallery__cat-title-wrap">
            <span :class="categoryMeta.motionMorph.icon" class="docs-gallery__cat-icon" aria-hidden="true" />
            <h3 class="docs-gallery__cat-title">{{ categoryMeta.motionMorph.label }}</h3>
          </span>
          <span class="docs-gallery__cat-desc">{{ categoryMeta.motionMorph.desc }}</span>
        </div>
        <span class="docs-gallery__cat-count">{{ categoryMeta.motionMorph.count }}</span>
      </header>
      <div class="docs-gallery__grid">
        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('morph')">
            {{ cellLabel('Morph', '形变容器') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <TxMorph
                :morph-key="morphExpanded ? 'card' : 'pill'"
                :radius="morphExpanded ? 16 : 999"
                :fill="morphExpanded ? 'var(--tx-fill-color-light)' : 'var(--tx-color-primary)'"
                :inset="morphExpanded ? 12 : 0"
              >
                <button
                  v-if="!morphExpanded"
                  type="button"
                  class="docs-gallery__motion-morph-pill"
                  @click="morphExpanded = true"
                >
                  {{ copy.morphCollapsed }}
                </button>
                <div v-else class="docs-gallery__motion-morph-card">
                  <div class="docs-gallery__motion-morph-meta">
                    <strong>{{ copy.morphTitle }}</strong>
                    <span>{{ copy.morphSub }}</span>
                  </div>
                  <TxButton size="sm" @click="morphExpanded = false">
                    {{ copy.morphClose }}
                  </TxButton>
                </div>
              </TxMorph>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('icon-morph')">
            {{ cellLabel('IconMorph', '图标形变') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <div class="docs-gallery__stack docs-gallery__stack--center">
                <button
                  type="button"
                  class="docs-gallery__icon-morph-trigger"
                  :aria-label="copy.iconNext"
                  @click="morphIconIndex++"
                >
                  <TxIconMorph :icon="currentMorphIcon" :size="28" />
                </button>
                <TxButton size="sm" @click="morphIconIndex++">
                  {{ copy.iconNext }} · {{ currentMorphIcon }}
                </TxButton>
              </div>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('liquid')">
            {{ cellLabel('Liquid', '液态') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 132px">
            <ClientOnly>
              <GalleryLiquidMenu :toggle-label="copy.liquidToggle" :item-labels="copy.liquidItems" />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('fusion')">
            {{ cellLabel('Fusion', '融合') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <GalleryFusion />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('fusion-surface')">
            {{ cellLabel('FusionSurface', '融合表面') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 128px">
            <ClientOnly>
              <GalleryFusionSurface />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>
      </div>
    </section>

    <!-- 5. MotionText -->
    <section id="motion-cat-motiontext" class="docs-gallery__cat-section">
      <header class="docs-gallery__cat-head not-prose">
        <div class="docs-gallery__cat-meta">
          <span class="docs-gallery__cat-title-wrap">
            <span :class="categoryMeta.motionText.icon" class="docs-gallery__cat-icon" aria-hidden="true" />
            <h3 class="docs-gallery__cat-title">{{ categoryMeta.motionText.label }}</h3>
          </span>
          <span class="docs-gallery__cat-desc">{{ categoryMeta.motionText.desc }}</span>
        </div>
        <span class="docs-gallery__cat-count">{{ categoryMeta.motionText.count }}</span>
      </header>
      <div class="docs-gallery__grid">
        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('motion-text')">
            {{ cellLabel('MotionText', '文字动效') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <component :is="galleryAmicroSpecimen" v-if="galleryAmicroSpecimen" kind="motion-text" />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('text-morph')">
            {{ cellLabel('TextMorph', '文本形变') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <div class="docs-gallery__stack docs-gallery__stack--center">
                <div class="docs-gallery__text-morph-readout">
                  <TxTextMorph :text="currentTextMorph" numbers />
                </div>
                <TxButton size="sm" @click="textMorphIndex++">
                  {{ copy.textMorphLabel }}
                </TxButton>
              </div>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('text-transformer')">
            {{ cellLabel('TextTransformer', '文字变换') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <GalleryTextMorph :stages="copy.transformerStages" :next-label="copy.next" />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('keyframe-stroke-text')">
            {{ cellLabel('KeyframeStrokeText', '描边文字') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <TxKeyframeStrokeText
                text="Talex Touch"
                stroke-color="var(--tx-color-primary)"
                fill-color="var(--tx-text-color-primary)"
                :stroke-width="1.5"
                :font-size="44"
                :duration-ms="2400"
              />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('tuff-logo-stroke')">
            {{ cellLabel('TuffLogoStroke', 'Logo 描边') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <div class="docs-gallery__row docs-gallery__row--loose">
                <div v-for="mode in logoModes" :key="mode.value" class="docs-gallery__meter">
                  <TxTuffLogoStroke :size="64" :mode="mode.value" :aria-label="text.logoStroke" />
                  <span class="docs-gallery__meter-text">{{ mode.label }}</span>
                </div>
              </div>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>
      </div>
    </section>

    <!-- 6. MotionCards -->
    <section id="motion-cat-motioncards" class="docs-gallery__cat-section">
      <header class="docs-gallery__cat-head not-prose">
        <div class="docs-gallery__cat-meta">
          <span class="docs-gallery__cat-title-wrap">
            <span :class="categoryMeta.motionCards.icon" class="docs-gallery__cat-icon" aria-hidden="true" />
            <h3 class="docs-gallery__cat-title">{{ categoryMeta.motionCards.label }}</h3>
          </span>
          <span class="docs-gallery__cat-desc">{{ categoryMeta.motionCards.desc }}</span>
        </div>
        <span class="docs-gallery__cat-count">{{ categoryMeta.motionCards.count }}</span>
      </header>
      <div class="docs-gallery__grid">
        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('card-spread')">
            {{ cellLabel('CardSpread', '卡片展开') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 264px">
            <ClientOnly>
              <component :is="galleryAmicroSpecimen" v-if="galleryAmicroSpecimen" kind="card-spread" />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>
      </div>
    </section>

    <!-- 7. MotionCarousels -->
    <section id="motion-cat-motioncarousels" class="docs-gallery__cat-section">
      <header class="docs-gallery__cat-head not-prose">
        <div class="docs-gallery__cat-meta">
          <span class="docs-gallery__cat-title-wrap">
            <span :class="categoryMeta.motionCarousels.icon" class="docs-gallery__cat-icon" aria-hidden="true" />
            <h3 class="docs-gallery__cat-title">{{ categoryMeta.motionCarousels.label }}</h3>
          </span>
          <span class="docs-gallery__cat-desc">{{ categoryMeta.motionCarousels.desc }}</span>
        </div>
        <span class="docs-gallery__cat-count">{{ categoryMeta.motionCarousels.count }}</span>
      </header>
      <div class="docs-gallery__grid">
        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('carousel-3d')">
            {{ cellLabel('Carousel3D', '三维轮播') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 300px; --docs-gallery-specimen-narrow: 332px">
            <ClientOnly>
              <component :is="galleryAmicroSpecimen" v-if="galleryAmicroSpecimen" kind="carousel-3d" />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('flip-book')">
            {{ cellLabel('FlipBook', '翻页书') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 253px">
            <ClientOnly>
              <component :is="galleryAmicroSpecimen" v-if="galleryAmicroSpecimen" kind="flip-book" />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>
      </div>
    </section>

    <!-- 8. MotionInteraction -->
    <section id="motion-cat-motioninteraction" class="docs-gallery__cat-section">
      <header class="docs-gallery__cat-head not-prose">
        <div class="docs-gallery__cat-meta">
          <span class="docs-gallery__cat-title-wrap">
            <span :class="categoryMeta.motionInteraction.icon" class="docs-gallery__cat-icon" aria-hidden="true" />
            <h3 class="docs-gallery__cat-title">{{ categoryMeta.motionInteraction.label }}</h3>
          </span>
          <span class="docs-gallery__cat-desc">{{ categoryMeta.motionInteraction.desc }}</span>
        </div>
        <span class="docs-gallery__cat-count">{{ categoryMeta.motionInteraction.count }}</span>
      </header>
      <div class="docs-gallery__grid">
        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('motion')">
            {{ cellLabel('Motion', '悬停与滚动') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 150px">
            <ClientOnly>
              <component :is="galleryAmicroSpecimen" v-if="galleryAmicroSpecimen" kind="motion" />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('motion-dock')">
            {{ cellLabel('MotionDock', '动态应用栏') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <component :is="galleryAmicroSpecimen" v-if="galleryAmicroSpecimen" kind="motion-dock" />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('pixel-field')">
            {{ cellLabel('PixelField', '像素粒子场') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 220px">
            <ClientOnly>
              <component :is="galleryAmicroSpecimen" v-if="galleryAmicroSpecimen" kind="pixel-field" />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('voice-ring')">
            {{ cellLabel('VoiceRing', '语音光环') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 196px">
            <ClientOnly>
              <component :is="galleryAmicroSpecimen" v-if="galleryAmicroSpecimen" kind="voice-ring" />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>
      </div>
    </section>

    <!-- 9. MotionPhysics -->
    <section id="motion-cat-motionphysics" class="docs-gallery__cat-section">
      <header class="docs-gallery__cat-head not-prose">
        <div class="docs-gallery__cat-meta">
          <span class="docs-gallery__cat-title-wrap">
            <span :class="categoryMeta.motionPhysics.icon" class="docs-gallery__cat-icon" aria-hidden="true" />
            <h3 class="docs-gallery__cat-title">{{ categoryMeta.motionPhysics.label }}</h3>
          </span>
          <span class="docs-gallery__cat-desc">{{ categoryMeta.motionPhysics.desc }}</span>
        </div>
        <span class="docs-gallery__cat-count">{{ categoryMeta.motionPhysics.count }}</span>
      </header>
      <div class="docs-gallery__grid">
        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('physics-motion')">
            {{ cellLabel('PhysicsMotion', '物理动效') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 128px">
            <ClientOnly>
              <component :is="galleryAmicroSpecimen" v-if="galleryAmicroSpecimen" kind="physics-motion" />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>
      </div>
    </section>

    <!-- 10. MotionLoaders -->
    <section id="motion-cat-motionloaders" class="docs-gallery__cat-section">
      <header class="docs-gallery__cat-head not-prose">
        <div class="docs-gallery__cat-meta">
          <span class="docs-gallery__cat-title-wrap">
            <span :class="categoryMeta.motionLoaders.icon" class="docs-gallery__cat-icon" aria-hidden="true" />
            <h3 class="docs-gallery__cat-title">{{ categoryMeta.motionLoaders.label }}</h3>
          </span>
          <span class="docs-gallery__cat-desc">{{ categoryMeta.motionLoaders.desc }}</span>
        </div>
        <span class="docs-gallery__cat-count">{{ categoryMeta.motionLoaders.count }}</span>
      </header>
      <div class="docs-gallery__grid">
        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('motion-loader')">
            {{ cellLabel('MotionLoader', '加载动效') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 139px">
            <ClientOnly>
              <component :is="galleryAmicroSpecimen" v-if="galleryAmicroSpecimen" kind="motion-loader" />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>
      </div>
    </section>

    <!-- 11. MotionCharts -->
    <section id="motion-cat-motioncharts" class="docs-gallery__cat-section">
      <header class="docs-gallery__cat-head not-prose">
        <div class="docs-gallery__cat-meta">
          <span class="docs-gallery__cat-title-wrap">
            <span :class="categoryMeta.motionCharts.icon" class="docs-gallery__cat-icon" aria-hidden="true" />
            <h3 class="docs-gallery__cat-title">{{ categoryMeta.motionCharts.label }}</h3>
          </span>
          <span class="docs-gallery__cat-desc">{{ categoryMeta.motionCharts.desc }}</span>
        </div>
        <span class="docs-gallery__cat-count">{{ categoryMeta.motionCharts.count }}</span>
      </header>
      <div class="docs-gallery__grid">
        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('dither-chart')">
            {{ cellLabel('DitherChart', '抖动图表') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 331px">
            <ClientOnly>
              <component :is="galleryAmicroSpecimen" v-if="galleryAmicroSpecimen" kind="dither-chart" />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('motion-metric')">
            {{ cellLabel('MotionMetric', '复合指标') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <component :is="galleryAmicroSpecimen" v-if="galleryAmicroSpecimen" kind="motion-metric" />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>
      </div>
    </section>
  </div>
</template>

<style scoped>
.docs-gallery__motion-morph-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 36px;
  padding: 0 18px;
  border: 0;
  border-radius: inherit;
  background: transparent;
  color: #ffffff;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.docs-gallery__motion-morph-card {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 224px;
  color: var(--tx-text-color-primary);
}

.docs-gallery__motion-morph-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.docs-gallery__motion-morph-meta strong {
  font-size: 13.5px;
  font-weight: 600;
}

.docs-gallery__motion-morph-meta span {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}

.docs-gallery__icon-morph-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border: 0;
  border-radius: 16px;
  background: var(--tx-fill-color-light);
  box-shadow: inset 0 0 0 1px var(--tx-border-color);
  color: var(--tx-text-color-primary);
  cursor: pointer;
  transition: background-color 160ms ease, transform 140ms ease;
}

.docs-gallery__icon-morph-trigger:hover {
  background: var(--tx-fill-color);
}

.docs-gallery__icon-morph-trigger:active {
  transform: scale(0.95);
}

.docs-gallery__text-morph-readout {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 6px 14px;
  border-radius: 10px;
  background: var(--tx-fill-color-light);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter);
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--tx-text-color-primary);
}
</style>
