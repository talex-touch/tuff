<script setup lang="ts">
import './GalleryProSuite.css'
import type { Component } from 'vue'
import { hasDocument, hasWindow } from '@talex-touch/utils/env'
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { galleryText } from '../gallery-text'
// Every `<ClientOnly>` below is this gate, not Nuxt's: each one sits directly
// in a cell's stage. The gate mounts its specimen when the parent gallery's
// queue admits it, and the specimen wrapper adds the reset button.
import ClientOnly from '../GallerySpecimenGate.vue'
import { tileImage } from '../tile-image'

const props = defineProps<{
  docPath: (slug: string) => string
  cellLabel: (en: string, zh: string) => string
  localeKey: 'en' | 'zh'
  version: string
}>()

const { t } = useI18n()

const galleryAmicroSpecimen = shallowRef<Component | null>(null)
const GalleryDeviceMockup = defineAsyncComponent(() => import('../GalleryDeviceMockup.vue'))
const GalleryEdgeMarquee = defineAsyncComponent(() => import('../GalleryEdgeMarquee.vue'))
const GalleryFusion = defineAsyncComponent(() => import('../GalleryFusion.vue'))
const GalleryFusionSurface = defineAsyncComponent(() => import('../GalleryFusionSurface.vue'))
const GalleryLiquidMenu = defineAsyncComponent(() => import('../GalleryLiquidMenu.vue'))
const GalleryTextMorph = defineAsyncComponent(() => import('../GalleryTextMorph.vue'))
const GalleryTransitionLanes = defineAsyncComponent(() => import('../GalleryTransitionLanes.vue'))
const GalleryVirtualList = defineAsyncComponent(() => import('../GalleryVirtualList.vue'))
const GalleryImageGeneration = defineAsyncComponent(async () => {
  const { TxImageGeneration } = await import('@talex-touch/tuffex/image-generation')
  return TxImageGeneration
})

const text = computed(() => galleryText[props.localeKey])

type ProCategoryKey = 'advanced' | 'effects' | 'primitives'

const categoryMeta = computed<Record<ProCategoryKey, { label: string, desc: string, icon: string, count: number }>>(() => ({
  advanced: {
    label: t('docsSidebar.categories.advanced'),
    desc: props.localeKey === 'zh'
      ? '编辑器、命令面板、搜索面板、终端、虚拟列表、设备样机与动效复合控件'
      : 'Editors, command & search panels, terminal, virtual list, device mockup, and motion controls',
    icon: 'i-carbon-code',
    count: 11,
  },
  effects: {
    label: t('docsSidebar.categories.effects'),
    desc: props.localeKey === 'zh'
      ? '光效、液态金属、玻璃/触感表面、形态与文字变换及视觉过渡'
      : 'Glow beams, glass & touch surfaces, shape/icon/text morphs, and visual transitions',
    icon: 'i-carbon-flash',
    count: 27,
  },
  primitives: {
    label: t('docsSidebar.categories.primitives'),
    desc: props.localeKey === 'zh'
      ? '尺寸感知、锚点基座、表面基座、浮动层与尺寸过渡原语'
      : 'Auto-sizing, anchored overlays, base surfaces, floating wrappers, and resize boxes',
    icon: 'i-carbon-grid',
    count: 5,
  },
}))

const categoryList = computed(() =>
  (['advanced', 'effects', 'primitives'] as const).map(key => ({
    key,
    ...categoryMeta.value[key],
  })),
)

const activeCategory = ref<ProCategoryKey>('advanced')
let catObserver: IntersectionObserver | null = null
let manualLockUntil = 0
let realignTimer: number | null = null
const STICKY_LANDING_OFFSET = 178

function scrollToCategory(key: ProCategoryKey) {
  activeCategory.value = key
  if (!import.meta.client || !hasDocument())
    return
  const el = document.getElementById(`pro-cat-${key}`)
  if (!el)
    return
  manualLockUntil = Date.now() + 950
  if (realignTimer !== null) {
    window.clearTimeout(realignTimer)
    realignTimer = null
  }
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const scrollOnce = () => {
    const top = el.getBoundingClientRect().top + window.scrollY - STICKY_LANDING_OFFSET
    window.scrollTo({ top: Math.max(0, top), behavior: reduced ? 'auto' : 'smooth' })
  }
  scrollOnce()
  realignTimer = window.setTimeout(() => {
    realignTimer = null
    const delta = Math.abs(el.getBoundingClientRect().top - STICKY_LANDING_OFFSET)
    if (delta > 32)
      scrollOnce()
  }, 420)
}

onMounted(() => {
  void import('../GalleryAmicroSpecimen.vue').then(({ default: component }) => {
    galleryAmicroSpecimen.value = component
  })

  if (!hasWindow() || !('IntersectionObserver' in window))
    return
  const keys: ProCategoryKey[] = ['advanced', 'effects', 'primitives']
  const visible = new Set<ProCategoryKey>()
  catObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const key = entry.target.id.replace(/^pro-cat-/, '') as ProCategoryKey
        if (entry.isIntersecting)
          visible.add(key)
        else
          visible.delete(key)
      }
      if (Date.now() < manualLockUntil)
        return
      const firstVisible = keys.find(k => visible.has(k))
      if (firstVisible)
        activeCategory.value = firstVisible
    },
    { rootMargin: '-180px 0px -65% 0px', threshold: 0 },
  )
  for (const key of keys) {
    const el = document.getElementById(`pro-cat-${key}`)
    if (el)
      catObserver.observe(el)
  }
})

onBeforeUnmount(() => {
  catObserver?.disconnect()
  catObserver = null
  if (realignTimer !== null && hasWindow()) {
    window.clearTimeout(realignTimer)
    realignTimer = null
  }
})

const copy = computed(() => (props.localeKey === 'zh'
  ? {
      categoryCount: (n: number) => `${n} 个组件`,
      installBody: 'pnpm add @talex-touch/tuffex',
      edit: '编辑',
      close: '关闭',
      releaseNotes: '发布说明',
      searchPlugins: '搜索插件…',
      newPlugin: '新建插件',
      importWorkflow: '导入工作流',
      virtualTitle: '插件注册表',
      virtualCount: (rendered: number, total: string) => `DOM 中 ${rendered} / ${total} 行`,
      aboutTitle: 'Tuffex 是什么？',
      aboutBody: '一套服务 Talex Touch 生态的 Vue 组件库。',
      foldCardTitle: '角标折页',
      foldCardHint: '悬停或点击右下角揭开',
      foldUnderTitle: '底层已展开',
      liquidToggle: '展开菜单',
      liquidItems: ['收藏', '夜间', '音乐'] as [string, string, string],
      searching: '检索中',
      next: '下一步',
      online: '在线',
      syncing: '同步中',
      hoverMe: '悬停试试',
      dividerSection: '锚点触发',
      flowVariants: [
        { value: 'corners' as const, label: 'corners' },
        { value: 'rim' as const, label: 'rim' },
        { value: 'aurora' as const, label: 'aurora' },
      ],
      iconNext: '切换图标',
      morphConnect: '连接设备',
      textMorphCaption: '按位滚动 · spring="snappy"',
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
      touchBase: 'Base',
      touchGlass: 'Glass',
      autoSizerCompact: '紧凑态',
      autoSizerExpanded: '展开态',
      autoSizerDetail: '容器宽高随内容自动平滑过渡。',
      autoSizerToggle: (expanded: boolean) => expanded ? '收起内容' : '展开内容',
      baseSurfaceModes: [
        { value: 'refraction' as const, label: 'refraction', desc: '琉光折射' },
        { value: 'glass' as const, label: 'glass', desc: '液态玻璃' },
        { value: 'acrylic' as const, label: 'acrylic', desc: '亚克力噪点' },
        { value: 'blur' as const, label: 'blur', desc: '背景模糊' },
        { value: 'mask' as const, label: 'mask', desc: '半透明遮罩' },
        { value: 'mica' as const, label: 'mica', desc: '云母微光' },
        { value: 'pure' as const, label: 'pure', desc: '纯色底板' },
      ],
      floatingTitle: '移动指针感知视差',
      floatingSub: '图层按 depth 正反向缓动',
      floatingChip: '前景 +1.05',
      floatingBack: '背景 -0.65',
      capsuleViewMore: '查看更多版本',
      capsuleBack: '返回',
      capsuleDownloadLabel: '下载',
      capsuleBuilds: [
        { id: 'mac-arm', name: 'macOS · Apple 芯片', meta: '.dmg · 126 MB', recommended: true },
        { id: 'win-x64', name: 'Windows · x64', meta: '.exe · 118 MB' },
      ],
      capsuleHistoryTitle: '历史版本',
      capsuleLatestLabel: '当前',
      capsuleNotesLabel: '更新日志',
      capsuleLatestNote: '同心圆角、树形预览与动效精调',
      capsuleFilters: [
        { value: 'all', label: '全部' },
        { value: 'beta', label: 'Beta' },
        { value: 'release', label: '正式版' },
        { value: 'nightly', label: 'Nightly' },
      ],
      capsuleHistoryEntries: [
        { id: 'v095', tag: 'v0.9.5', channel: 'RELEASE', tone: 'stable' as const, date: '11/18' },
        { id: 'v094', tag: 'v0.9.4', channel: 'BETA', tone: 'preview' as const, date: '11/11' },
        { id: 'v093', tag: 'v0.9.3', channel: 'NIGHTLY', tone: 'nightly' as const, date: '11/06' },
      ],
    }
  : {
      categoryCount: (n: number) => `${n} components`,
      installBody: 'pnpm add @talex-touch/tuffex',
      edit: 'Edit',
      close: 'Close',
      releaseNotes: 'Release notes',
      searchPlugins: 'Search plugins…',
      newPlugin: 'New plugin',
      importWorkflow: 'Import workflow',
      virtualTitle: 'Plugin registry',
      virtualCount: (rendered: number, total: string) => `${rendered} / ${total} rows in the DOM`,
      aboutTitle: 'What is Tuffex?',
      aboutBody: 'A Vue component library built for the Talex Touch ecosystem.',
      foldCardTitle: 'Corner Peel',
      foldCardHint: 'Hover or click corner to peel',
      foldUnderTitle: 'Underlay unlocked',
      liquidToggle: 'Toggle menu',
      liquidItems: ['Favorite', 'Night mode', 'Music'] as [string, string, string],
      searching: 'Searching',
      next: 'Next',
      online: 'Online',
      syncing: 'Syncing',
      hoverMe: 'hover me',
      dividerSection: 'Anchor trigger',
      flowVariants: [
        { value: 'corners' as const, label: 'corners' },
        { value: 'rim' as const, label: 'rim' },
        { value: 'aurora' as const, label: 'aurora' },
      ],
      iconNext: 'Next icon',
      morphConnect: 'Connect',
      textMorphCaption: 'place-value · spring="snappy"',
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
      touchBase: 'Base',
      touchGlass: 'Glass',
      autoSizerCompact: 'Compact',
      autoSizerExpanded: 'Expanded',
      autoSizerDetail: 'Width & height morph smoothly as inner content changes.',
      autoSizerToggle: (expanded: boolean) => expanded ? 'Collapse' : 'Expand',
      baseSurfaceModes: [
        { value: 'refraction' as const, label: 'refraction', desc: 'Filmic refraction' },
        { value: 'glass' as const, label: 'glass', desc: 'Liquid glass' },
        { value: 'acrylic' as const, label: 'acrylic', desc: 'Frosted acrylic' },
        { value: 'blur' as const, label: 'blur', desc: 'Backdrop blur' },
        { value: 'mask' as const, label: 'mask', desc: 'Translucent mask' },
        { value: 'mica' as const, label: 'mica', desc: 'Mica tint' },
        { value: 'pure' as const, label: 'pure', desc: 'Solid surface' },
      ],
      floatingTitle: 'Move pointer for parallax',
      floatingSub: 'Layers glide by positive & negative depth',
      floatingChip: 'Front +1.05',
      floatingBack: 'Back -0.65',
      capsuleViewMore: 'View more',
      capsuleBack: 'Back',
      capsuleDownloadLabel: 'Get',
      capsuleBuilds: [
        { id: 'mac-arm', name: 'macOS · Apple Silicon', meta: '.dmg · 126 MB', recommended: true },
        { id: 'win-x64', name: 'Windows · x64', meta: '.exe · 118 MB' },
      ],
      capsuleHistoryTitle: 'History',
      capsuleLatestLabel: 'Current',
      capsuleNotesLabel: 'Notes',
      capsuleLatestNote: 'Concentric radii & tree preview',
      capsuleFilters: [
        { value: 'all', label: 'All' },
        { value: 'beta', label: 'Beta' },
        { value: 'release', label: 'Release' },
        { value: 'nightly', label: 'Nightly' },
      ],
      capsuleHistoryEntries: [
        { id: 'v095', tag: 'v0.9.5', channel: 'RELEASE', tone: 'stable' as const, date: 'Nov 18' },
        { id: 'v094', tag: 'v0.9.4', channel: 'BETA', tone: 'preview' as const, date: 'Nov 11' },
        { id: 'v093', tag: 'v0.9.3', channel: 'NIGHTLY', tone: 'nightly' as const, date: 'Nov 06' },
      ],
    }))

const galleryTiles = [
  { id: 'a', url: tileImage('#1e3a8a', '#60a5fa', '#e0f2fe', 8), en: 'Dawn ridge', zh: '山脊晨光' },
  { id: 'b', url: tileImage('#064e3b', '#4ade80', '#fef9c3', 8), en: 'Pine valley', zh: '松谷' },
  { id: 'c', url: tileImage('#7c2d12', '#fbbf24', '#fff7ed', 8), en: 'Dune pass', zh: '沙丘垭口' },
]
const galleryItems = computed(() => galleryTiles.map(({ id, url, en, zh }) => ({ id, url, name: props.localeKey === 'zh' ? zh : en })))
const blurFeed = computed(() => [...galleryItems.value, ...galleryItems.value])

const manifestSample = ref('{\n  "id": "com.talex.clipboard",\n  "enabled": true,\n  "accent": "#409eff",\n  "sdkapi": 260713,\n  "features": ["history", "pin"]\n}')
const terminalLines = computed(() => [
  '\x1B[32mTuffEx TxTerminal\x1B[0m',
  props.localeKey === 'zh' ? 'ANSI 颜色 · 中文日志 ✓' : 'ANSI colors · Unicode logs ✓',
  props.localeKey === 'zh' ? '只读显示，无进程' : 'Read-only display, no process',
])
const markdownDraft = ref(props.localeKey === 'zh'
  ? '## 发布说明\n\n- **更快的** CoreBox 搜索\n- 每个插件一个*权限*面板\n'
  : '## Release notes\n\n- **Faster** CoreBox search\n- A *permissions* panel per plugin\n')
const markdownOpen = ref(false)
const paletteOpen = ref(false)
const paletteItems = computed(() => [
  { id: 'new', title: copy.value.newPlugin, icon: 'i-carbon-add', shortcut: '⌘N' },
  { id: 'import', title: copy.value.importWorkflow, icon: 'i-carbon-download' },
])
const searchPanelValue = ref('')
const flipped = ref(false)
const foldGalleryPeeled = ref(false)
const resizeWide = ref(false)
const flipTriggerRef = ref<{ $el?: HTMLElement } | null>(null)
const flipTriggerEl = computed(() => flipTriggerRef.value?.$el ?? null)
const autoSizerRef = ref<{
  size?: { width?: number, height?: number }
  action?: (fn: () => void) => Promise<unknown>
} | null>(null)
const autoSizerExpanded = ref(false)
const autoSizerLabel = computed(() => {
  const size = autoSizerRef.value?.size
  if (!size?.width)
    return '—'
  return `${Math.round(size.width)} × ${Math.round(size.height ?? 0)}`
})
function toggleAutoSizer() {
  const sizer = autoSizerRef.value
  if (sizer?.action) {
    void sizer.action(() => {
      autoSizerExpanded.value = !autoSizerExpanded.value
    })
    return
  }
  autoSizerExpanded.value = !autoSizerExpanded.value
}
const laneStates = computed<[string, string]>(() => [copy.value.online, copy.value.syncing])
const logoModes = computed(() => [
  { value: 'once' as const, label: 'once' },
  { value: 'breathe' as const, label: 'breathe' },
  { value: 'hover' as const, label: copy.value.hoverMe },
])

/* ── Interactive Pro Effects & Primitives specimens ── */
const morphIcons = ['menu', 'close', 'play', 'pause', 'check'] as const
const morphIconIndex = ref(0)
const activeMorphIcon = computed(() => morphIcons[morphIconIndex.value] ?? 'menu')
function cycleMorphIcon() {
  morphIconIndex.value = (morphIconIndex.value + 1) % morphIcons.length
}

const morphStates = ['idle', 'loading', 'done'] as const
const morphStateIndex = ref(0)
const activeMorphState = computed(() => morphStates[morphStateIndex.value] ?? 'idle')
const activeMorphFill = computed(() => {
  if (activeMorphState.value === 'loading')
    return 'var(--tx-fill-color)'
  if (activeMorphState.value === 'done')
    return 'var(--tx-color-success)'
  return 'var(--tx-color-primary)'
})
function cycleMorphState() {
  morphStateIndex.value = (morphStateIndex.value + 1) % morphStates.length
}

const baseSurfaceMode = ref<'refraction' | 'glass' | 'acrylic' | 'blur' | 'mask' | 'mica' | 'pure'>('refraction')
const activeBaseSurfaceMeta = computed(() =>
  copy.value.baseSurfaceModes.find(item => item.value === baseSurfaceMode.value) ?? copy.value.baseSurfaceModes[0]!,
)

const textMorphTotal = ref(1204.5)
const activeTextMorph = computed(() =>
  `$${textMorphTotal.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
)
function stepTextMorph(delta: number) {
  textMorphTotal.value = Math.max(0, Math.round((textMorphTotal.value + delta) * 100) / 100)
}
</script>

<template>
  <div class="docs-gallery__pro-suite">
    <nav class="docs-gallery__cat-nav not-prose" aria-label="Pro Suite categories">
      <a
        v-for="cat in categoryList"
        :key="cat.key"
        :href="`#pro-cat-${cat.key}`"
        class="docs-gallery__cat-pill"
        :class="{ 'is-active': activeCategory === cat.key }"
        @click.prevent="scrollToCategory(cat.key)"
      >
        <span :class="cat.icon" class="docs-gallery__cat-pill-icon" aria-hidden="true" />
        <span>{{ cat.label }}</span>
        <span class="docs-gallery__cat-pill-count">{{ cat.count }}</span>
      </a>
    </nav>

    <!-- ── 1. Advanced (11) ── -->
    <section id="pro-cat-advanced" class="docs-gallery__cat-section">
      <header class="docs-gallery__cat-head not-prose">
        <div class="docs-gallery__cat-meta">
          <span class="docs-gallery__cat-title-wrap">
            <span :class="categoryMeta.advanced.icon" class="docs-gallery__cat-icon" aria-hidden="true" />
            <h3 class="docs-gallery__cat-title">{{ categoryMeta.advanced.label }}</h3>
          </span>
          <span class="docs-gallery__cat-desc">{{ categoryMeta.advanced.desc }}</span>
        </div>
        <span class="docs-gallery__cat-count">{{ copy.categoryCount(categoryMeta.advanced.count) }}</span>
      </header>
      <div class="docs-gallery__grid">
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

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('version-capsule')">
            {{ cellLabel('VersionCapsule', '版本胶囊') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <TxVersionCapsule
                :version="`v${props.version}`"
                channel="BETA"
                tone="preview"
                :view-more-label="copy.capsuleViewMore"
                :back-label="copy.capsuleBack"
                v-bind="text.versionCapsule"
              >
                <template #download="{ close }">
                  <TxVersionDownloadPanel
                    :builds="copy.capsuleBuilds"
                    builds-label=""
                    :download-label="copy.capsuleDownloadLabel"
                    @select="close"
                  />
                </template>
                <template #history="{ close }">
                  <TxVersionHistoryPanel
                    :title="copy.capsuleHistoryTitle"
                    :latest-label="copy.capsuleLatestLabel"
                    :notes-label="copy.capsuleNotesLabel"
                    :filters="copy.capsuleFilters"
                    :latest="{
                      id: 'latest',
                      tag: `v${props.version}`,
                      channel: 'BETA',
                      tone: 'preview',
                      date: localeKey === 'zh' ? '11/28' : 'Nov 28',
                      note: copy.capsuleLatestNote,
                    }"
                    :entries="copy.capsuleHistoryEntries"
                    @select="close"
                  />
                </template>
              </TxVersionCapsule>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('code-editor')">
            {{ cellLabel('CodeEditor', '代码编辑器') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 135px">
            <ClientOnly>
              <div class="docs-gallery__block docs-gallery__block--wide docs-gallery__editor">
                <TxCodeEditor v-model="manifestSample" language="json" view-mode-toggle />
              </div>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('command-palette')">
            {{ cellLabel('CommandPalette', '命令面板') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <TxButton icon="i-carbon-search" @click="paletteOpen = true">
                ⌘K
              </TxButton>
              <TxCommandPalette v-model="paletteOpen" :commands="paletteItems" />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('markdown-editor')">
            {{ cellLabel('MarkdownEditor', 'Markdown 编辑器') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <div class="docs-gallery__block docs-gallery__doc docs-gallery__md-card">
                <div class="docs-gallery__doc-bar">
                  <span class="docs-gallery__grow">release-notes.md</span>
                  <TxButton size="sm" icon="i-carbon-edit" @click="markdownOpen = true">
                    {{ copy.edit }}
                  </TxButton>
                </div>
                <pre class="docs-gallery__md-source">{{ markdownDraft }}</pre>
              </div>
              <TxModal v-model="markdownOpen" :title="copy.releaseNotes" :close-label="copy.close" width="min(92vw, 640px)">
                <TxMarkdownEditor v-model="markdownDraft" :min-height="220" :max-height="360" />
              </TxModal>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('search-panel')">
            {{ cellLabel('SearchPanel', '搜索面板') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <div class="docs-gallery__block">
                <TxSearchPanel v-model="searchPanelValue" :items="text.searchPanelItems" :placeholder="copy.searchPlugins" v-bind="text.searchPanel" />
              </div>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('terminal')">
            {{ cellLabel('Terminal', '终端显示') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <div class="docs-gallery__block docs-gallery__block--wide" style="height: 176px">
                <TxTerminal
                  read-only
                  :lines="terminalLines"
                  :labels="{ ariaLabel: text.terminal }"
                />
              </div>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('virtual-list')">
            {{ cellLabel('VirtualList', '虚拟列表') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 160px">
            <ClientOnly>
              <GalleryVirtualList :title="copy.virtualTitle" :count-label="copy.virtualCount" :names="text.plugins" />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('device-mockup')">
            {{ cellLabel('DeviceMockup', '设备样机') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 168px">
            <ClientOnly>
              <GalleryDeviceMockup />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>
      </div>
    </section>

    <!-- ── 2. Effects (27) ── -->
    <section id="pro-cat-effects" class="docs-gallery__cat-section">
      <header class="docs-gallery__cat-head not-prose">
        <div class="docs-gallery__cat-meta">
          <span class="docs-gallery__cat-title-wrap">
            <span :class="categoryMeta.effects.icon" class="docs-gallery__cat-icon" aria-hidden="true" />
            <h3 class="docs-gallery__cat-title">{{ categoryMeta.effects.label }}</h3>
          </span>
          <span class="docs-gallery__cat-desc">{{ categoryMeta.effects.desc }}</span>
        </div>
        <span class="docs-gallery__cat-count">{{ copy.categoryCount(categoryMeta.effects.count) }}</span>
      </header>
      <div class="docs-gallery__grid">
        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('glow-text')">
            {{ cellLabel('GlowText', '扫光') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <div class="docs-gallery__stack docs-gallery__stack--center">
                <TxGlowText
                  class="docs-gallery__glow"
                  tag="span"
                  mode="text-clip"
                  :duration-ms="2400"
                  :band-size="42"
                  :opacity="1"
                  color="var(--docs-accent)"
                >
                  Tuffex
                </TxGlowText>
                <TxGlowText
                  class="docs-gallery__glow-card"
                  tag="div"
                  :duration-ms="2600"
                  :band-size="44"
                  :opacity="0.72"
                  :radius="12"
                  color="color-mix(in srgb, var(--docs-accent) 45%, #ffffff)"
                >
                  {{ copy.installBody }}
                </TxGlowText>
              </div>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('border-beam')">
            {{ cellLabel('BorderBeam', '流光边框') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <TxBorderBeam size="md" color-variant="ocean" theme="auto">
                <div class="docs-gallery__beam-card">
                  @talex-touch/tuffex
                </div>
              </TxBorderBeam>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('metal-fx')">
            {{ cellLabel('MetalFx', '液态金属') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <div class="docs-gallery__stack docs-gallery__stack--center">
                <TxMetalFx preset="chromatic" theme="auto" :border-radius="12">
                  <span style="display: inline-flex; align-items: center; height: 32px; padding: 0 14px; border-radius: 12px; font-size: 13px">{{ text.upgrade }}</span>
                </TxMetalFx>
                <TxMetalBadge>New</TxMetalBadge>
              </div>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('voice-beam')">
            {{ cellLabel('VoiceBeam', '语音光束') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <TxVoiceBeam color-variant="ocean" theme="auto" :border-radius="14">
                <div class="docs-gallery__beam-card">
                  {{ text.askAnything }}
                </div>
              </TxVoiceBeam>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('image-generation')">
            {{ cellLabel('ImageGeneration', '生图占位') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 120px">
            <ClientOnly>
              <GalleryImageGeneration preset="pixels-organic">
                <div style="width: 180px; height: 120px; border-radius: 14px" />
              </GalleryImageGeneration>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('flow-light')">
            {{ cellLabel('FlowLight', '流光层') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <div class="docs-gallery__flow-grid">
                <div v-for="item in copy.flowVariants" :key="item.value" class="docs-gallery__flow-panel">
                  <TxFlowLight :variant="item.value" />
                  <span>{{ item.label }}</span>
                </div>
              </div>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('corner-overlay')">
            {{ cellLabel('CornerOverlay', '角标叠层') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <div class="docs-gallery__row docs-gallery__row--loose">
                <figure class="docs-gallery__corner" style="--i: 0">
                  <TxCornerOverlay placement="top-left" :offset-x="-6" :offset-y="-6">
                    <img class="docs-gallery__corner-thumb" :src="galleryItems[0]!.url" alt="">
                    <template #overlay>
                      <span class="docs-gallery__corner-ring"><TxBadge value="NEW" variant="primary" /></span>
                    </template>
                  </TxCornerOverlay>
                  <figcaption>top-left</figcaption>
                </figure>
                <figure class="docs-gallery__corner" style="--i: 1">
                  <TxCornerOverlay placement="top-right" :offset-x="-6" :offset-y="-6">
                    <TxAvatar name="Kiri" shape="rounded" size="large" />
                    <template #overlay>
                      <span class="docs-gallery__corner-ring"><TxBadge :value="12" variant="error" /></span>
                    </template>
                  </TxCornerOverlay>
                  <figcaption>top-right</figcaption>
                </figure>
                <figure class="docs-gallery__corner" style="--i: 2">
                  <TxCornerOverlay placement="bottom-left" :offset-x="-5" :offset-y="-5">
                    <TxIconChip :size="48" tone="red" label="PDF" />
                    <template #overlay>
                      <span class="docs-gallery__corner-ring docs-gallery__corner-check"><TxIcon name="check-circle" /></span>
                    </template>
                  </TxCornerOverlay>
                  <figcaption>bottom-left</figcaption>
                </figure>
                <figure class="docs-gallery__corner" style="--i: 3">
                  <TxCornerOverlay placement="bottom-right" :offset-x="1" :offset-y="1">
                    <TxAvatar name="Talex" size="large" />
                    <template #overlay>
                      <span class="docs-gallery__dot" style="background: var(--tx-color-success)" />
                    </template>
                  </TxCornerOverlay>
                  <figcaption>bottom-right</figcaption>
                </figure>
              </div>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('edge-fade-mask')">
            {{ cellLabel('EdgeFadeMask', '边缘渐隐') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <GalleryEdgeMarquee :names="text.plugins" />
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

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('glass-surface')">
            {{ cellLabel('GlassSurface', '玻璃表面') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <div class="docs-gallery__block docs-gallery__glass-stage">
                <div class="docs-gallery__glass-scene" aria-hidden="true">
                  <span v-for="orb in 5" :key="orb" class="docs-gallery__glass-orb" />
                </div>
                <TxGlassSurface :width="200" :height="88" :border-radius="12" :background-opacity="0.06">
                  <span class="docs-gallery__glass-label">GlassSurface</span>
                </TxGlassSurface>
              </div>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('touch-surface')">
            {{ cellLabel('TouchSurface', '触感表面') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <div class="docs-gallery__block docs-gallery__glass-stage docs-gallery__touch-stage">
                <div class="docs-gallery__glass-scene" aria-hidden="true">
                  <span v-for="orb in 5" :key="orb" class="docs-gallery__glass-orb" />
                </div>
                <div class="docs-gallery__touch-row">
                  <TxTouchSurface class="docs-gallery__touch-card docs-gallery__touch-card--base" :radius="12" :overlay-opacity="0.24">
                    {{ copy.touchBase }}
                  </TxTouchSurface>
                  <TxTouchSurface surface="glass" class="docs-gallery__touch-card" :width="118" :height="54" :border-radius="12" :background-opacity="0.08">
                    {{ copy.touchGlass }}
                  </TxTouchSurface>
                </div>
              </div>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('gradient-border')">
            {{ cellLabel('GradientBorder', '渐变描边') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <div class="docs-gallery__block">
                <TxGradientBorder :border-radius="16" :border-width="2" :padding="2" :animation-duration="6">
                  <div class="docs-gallery__gb-card">
                    <strong>{{ copy.aboutTitle }}</strong>
                    <span>{{ copy.aboutBody }}</span>
                  </div>
                </TxGradientBorder>
              </div>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('gradual-blur')">
            {{ cellLabel('GradualBlur', '渐进模糊') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <div class="docs-gallery__block docs-gallery__blur-card">
                <div class="docs-gallery__blur-feed">
                  <figure v-for="(shot, index) in blurFeed" :key="index" class="docs-gallery__blur-shot">
                    <img :src="shot.url" alt="">
                    <figcaption>{{ shot.name }}</figcaption>
                  </figure>
                </div>
                <TxGradualBlur
                  position="bottom"
                  height="64px"
                  :strength="2.5"
                  :div-count="6"
                  curve="bezier"
                  exponential
                  :z-index="1"
                />
              </div>
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
                  class="docs-gallery__morph-trigger"
                  :aria-label="copy.iconNext"
                  @click="cycleMorphIcon"
                >
                  <TxIconMorph :icon="activeMorphIcon" spring="snappy" :size="22" />
                </button>
                <TxButton size="sm" @click="cycleMorphIcon">
                  {{ activeMorphIcon }}
                </TxButton>
              </div>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('morph')">
            {{ cellLabel('Morph', '形态变换') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <TxMorph
                :morph-key="activeMorphState"
                :radius="activeMorphState === 'idle' ? 10 : 19"
                :fill="activeMorphFill"
              >
                <button
                  type="button"
                  class="docs-gallery__morph-btn"
                  :class="{
                    'is-compact': activeMorphState === 'loading',
                    'is-done': activeMorphState === 'done',
                  }"
                  :aria-label="activeMorphState === 'done' ? 'Done' : activeMorphState === 'loading' ? 'Loading' : undefined"
                  @click="cycleMorphState"
                >
                  <TxSpinner v-if="activeMorphState === 'loading'" :size="16" />
                  <span v-else-if="activeMorphState === 'done'" class="i-carbon-checkmark" aria-hidden="true" />
                  <span v-else>{{ copy.morphConnect }}</span>
                </button>
              </TxMorph>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('text-morph')">
            {{ cellLabel('TextMorph', '文字形变') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <div class="docs-gallery__stack docs-gallery__stack--center">
                <div class="docs-gallery__text-morph-stage">
                  <TxTextMorph :text="activeTextMorph" spring="snappy" />
                </div>
                <span class="docs-gallery__text-morph-caption">{{ copy.textMorphCaption }}</span>
                <div class="docs-gallery__row">
                  <TxButton size="sm" @click="stepTextMorph(-114.25)">
                    -$114.25
                  </TxButton>
                  <TxButton size="sm" @click="stepTextMorph(114.25)">
                    +$114.25
                  </TxButton>
                </div>
              </div>
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
          <NuxtLink class="docs-gallery__label" :to="docPath('outline-border')">
            {{ cellLabel('OutlineBorder', '描边边框') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <div class="docs-gallery__row docs-gallery__row--loose">
                <div class="docs-gallery__meter">
                  <TxOutlineBorder :ring-width="2" ring-color="var(--tx-color-primary)" :offset="3">
                    <TxAvatar name="Talex" :size="44" />
                  </TxOutlineBorder>
                  <span class="docs-gallery__meter-text">ring-offset</span>
                </div>
                <div class="docs-gallery__meter">
                  <TxOutlineBorder variant="ring" :ring-width="2" ring-color="var(--tx-color-success)">
                    <TxAvatar name="Kiri" :size="44" />
                  </TxOutlineBorder>
                  <span class="docs-gallery__meter-text">ring</span>
                </div>
                <div class="docs-gallery__meter">
                  <TxOutlineBorder
                    variant="border"
                    shape="rect"
                    :border-radius="15"
                    :border-width="2"
                    :padding="3"
                    border-color="var(--tx-color-warning)"
                  >
                    <TxAvatar name="Ame" :size="40" shape="rounded" />
                  </TxOutlineBorder>
                  <span class="docs-gallery__meter-text">border</span>
                </div>
                <div class="docs-gallery__meter">
                  <TxOutlineBorder clip-mode="mask" clip-shape="hexagon" variant="border" :border-width="0">
                    <TxAvatar name="Louis" :size="48" shape="square" />
                  </TxOutlineBorder>
                  <span class="docs-gallery__meter-text">mask</span>
                </div>
              </div>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('prism-glow')">
            {{ cellLabel('PrismGlow', '棱镜光') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <TxPrismGlow class="docs-gallery__prism-card">
                {{ copy.searching }}…
              </TxPrismGlow>
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

    <!-- ── 3. Primitives (5) ── -->
    <section id="pro-cat-primitives" class="docs-gallery__cat-section">
      <header class="docs-gallery__cat-head not-prose">
        <div class="docs-gallery__cat-meta">
          <span class="docs-gallery__cat-title-wrap">
            <span :class="categoryMeta.primitives.icon" class="docs-gallery__cat-icon" aria-hidden="true" />
            <h3 class="docs-gallery__cat-title">{{ categoryMeta.primitives.label }}</h3>
          </span>
          <span class="docs-gallery__cat-desc">{{ categoryMeta.primitives.desc }}</span>
        </div>
        <span class="docs-gallery__cat-count">{{ copy.categoryCount(categoryMeta.primitives.count) }}</span>
      </header>
      <div class="docs-gallery__grid">
        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('auto-sizer')">
            {{ cellLabel('AutoSizer', '自适应尺寸') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 136px">
            <ClientOnly>
              <div class="docs-gallery__stack docs-gallery__stack--center">
                <TxAutoSizer
                  ref="autoSizerRef"
                  inline
                  :width="true"
                  :height="true"
                  :duration-ms="320"
                  easing="cubic-bezier(0.22, 1, 0.36, 1)"
                  outer-class="docs-gallery__autosizer-frame"
                >
                  <div
                    class="docs-gallery__autosizer-card"
                    :class="{ 'is-expanded': autoSizerExpanded }"
                    @click="toggleAutoSizer"
                  >
                    <div class="docs-gallery__autosizer-head">
                      <span class="docs-gallery__autosizer-title">
                        {{ autoSizerExpanded ? copy.autoSizerExpanded : copy.autoSizerCompact }}
                      </span>
                      <code class="docs-gallery__autosizer-dim">{{ autoSizerLabel }}</code>
                    </div>
                    <p v-if="autoSizerExpanded" class="docs-gallery__autosizer-body">
                      {{ copy.autoSizerDetail }}
                    </p>
                  </div>
                </TxAutoSizer>
                <TxButton
                  size="sm"
                  :icon="autoSizerExpanded ? 'i-carbon-minimize' : 'i-carbon-maximize'"
                  @click="toggleAutoSizer"
                >
                  {{ copy.autoSizerToggle(autoSizerExpanded) }}
                </TxButton>
              </div>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('base-anchor')">
            {{ cellLabel('BaseAnchor', '锚点基座') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <TxTooltip :content="copy.aboutTitle" trigger="click">
                <TxButton>{{ copy.dividerSection }}</TxButton>
              </TxTooltip>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('base-surface')">
            {{ cellLabel('BaseSurface', '表面基座') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 196px">
            <ClientOnly>
              <div class="docs-gallery__stack docs-gallery__stack--center docs-gallery__block">
                <div class="docs-gallery__glass-stage docs-gallery__surface-stage">
                  <div class="docs-gallery__glass-scene" aria-hidden="true">
                    <span v-for="orb in 5" :key="orb" class="docs-gallery__glass-orb" />
                  </div>
                  <TxBaseSurface
                    preset="card"
                    :mode="baseSurfaceMode"
                    refraction-renderer="svg"
                    :refraction-glass-opacity="0.72"
                    :radius="12"
                    :blur="12"
                    :opacity="0.62"
                    class="docs-gallery__surface-card"
                  >
                    <div class="docs-gallery__surface-card-inner">
                      <strong>{{ activeBaseSurfaceMeta.label }}</strong>
                      <span>{{ activeBaseSurfaceMeta.desc }}</span>
                    </div>
                  </TxBaseSurface>
                </div>
                <div class="docs-gallery__surface-modes" role="tablist" aria-label="BaseSurface modes">
                  <button
                    v-for="item in copy.baseSurfaceModes"
                    :key="item.value"
                    type="button"
                    role="tab"
                    class="docs-gallery__surface-mode-btn"
                    :class="{ 'is-active': baseSurfaceMode === item.value }"
                    :aria-selected="baseSurfaceMode === item.value"
                    @click="baseSurfaceMode = item.value"
                  >
                    {{ item.label }}
                  </button>
                </div>
              </div>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('floating')">
            {{ cellLabel('Floating', '浮动层') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 156px">
            <ClientOnly>
              <div class="docs-gallery__block docs-gallery__floating-box">
                <TxFloating class-name="docs-gallery__floating-stage" :sensitivity="1.1" :easing-factor="0.1">
                  <TxFloatingElement class-name="docs-gallery__floating-back" :depth="-0.65">
                    <span>{{ copy.floatingBack }}</span>
                  </TxFloatingElement>
                  <TxFloatingElement class-name="docs-gallery__floating-card" :depth="0.3">
                    <strong>{{ copy.floatingTitle }}</strong>
                    <span>{{ copy.floatingSub }}</span>
                  </TxFloatingElement>
                  <TxFloatingElement class-name="docs-gallery__floating-chip" :depth="1.05">
                    <span class="i-carbon-cursor-1" aria-hidden="true" />
                    <span>{{ copy.floatingChip }}</span>
                  </TxFloatingElement>
                </TxFloating>
              </div>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('resize-box')">
            {{ cellLabel('ResizeBox', '尺寸过渡') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <div class="docs-gallery__stack docs-gallery__stack--center">
                <TxResizeBox :width="resizeWide ? 200 : 110">
                  <div class="docs-gallery__tile docs-gallery__overlay-body">
                    {{ resizeWide ? 200 : 110 }}px
                  </div>
                </TxResizeBox>
                <TuffSwitch v-model="resizeWide" :aria-label="text.widen" />
              </div>
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
