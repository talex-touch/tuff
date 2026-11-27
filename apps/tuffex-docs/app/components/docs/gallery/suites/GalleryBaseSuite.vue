<script setup lang="ts">
import type { Component } from 'vue'
import type { FileUploaderFile } from '@tuffex-components/file-uploader'
import type { ImageUploaderFile } from '@tuffex-components/image-uploader'
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import {
  TxBlankSlate,
  TxEmpty,
  TxEmptyState,
  TxErrorState,
  TxGuideState,
  TxLayoutSkeleton,
  TxLoadingState,
  TxNoData,
  TxNoSelection,
  TxOfflineState,
  TxPermissionState,
  TxSearchEmpty,
} from '#components'
import { useSelectionAnchor } from '@talex-touch/tuffex/selection-actions'
import { toast } from '@talex-touch/tuffex/utils'
import { galleryText } from '../gallery-text'
// Every `<ClientOnly>` below is this gate, not Nuxt's: each one sits directly
// in a cell's stage. The gate mounts its specimen when the parent gallery's queue
// admits it, and the specimen wrapper adds the reset button that remounts it so
// its entrance can be watched again.
import ClientOnly from '../GallerySpecimenGate.vue'
import { tileImage } from '../tile-image'

const props = defineProps<{
  docPath: (slug: string) => string
  cellLabel: (en: string, zh: string) => string
  localeKey: 'en' | 'zh'
}>()

const GalleryImageGallery = defineAsyncComponent(() => import('../GalleryImageGallery.vue'))
const GalleryImagePreview = defineAsyncComponent(() => import('../GalleryImagePreview.vue'))

const text = computed(() => galleryText[props.localeKey])

const copy = computed(() => (props.localeKey === 'zh'
  ? {
      suiteBase: '基础',
      suitePro: '进阶',
      suiteAi: 'AI',
      createPlugin: '新建插件',
      typeSomething: '输入点什么…',
      searchPlugins: '搜索插件…',
      password: '输入密码',
      selectChannel: '选择发布通道',
      channels: [
        { value: 'stable', label: '稳定版' },
        { value: 'beta', label: '测试版' },
        { value: 'snapshot', label: '快照版' },
      ],
      autoSync: '自动同步',
      autoSyncDesc: '有新版本时自动拉取插件更新',
      resetAlerts: '恢复已关闭的警示',
      partial: '部分选中',
      syncing: '同步中',
      dividerSection: '分组',
      formName: '名称',
      formEmail: '邮箱',
      contextHint: '右键此处',
      selectionHint: '选中这段文字试试。',
      toastSaved: '已保存',
      toastSavedBody: '草稿已同步到云端。',
      toastStack: '堆三条',
      toastUndo: '撤销',
      toastDeleted: '已删除 1 项',
      add: '添加',
      translate: '翻译',
      newPlugin: '新建插件',
      importWorkflow: '导入工作流',
      delete: '删除',
      dialogTitle: '删除插件？',
      dialogMessage: '该操作无法撤销。',
      confirm: '确认',
      online: '在线',
      reviewing: '审阅中',
      failed: '失败',
      aboutTitle: 'Tuffex 是什么？',
      close: '关闭',
      closeDrawer: '关闭抽屉',
      toastRegion: '通知',
      toastDismiss: '关闭通知',
      aboutBody: '一套服务 Talex Touch 生态的 Vue 组件库。',
      installTitle: '如何安装？',
      installBody: 'pnpm add @talex-touch/tuffex',
      periods: [
        { value: 'day', label: '日' },
        { value: 'week', label: '周' },
        { value: 'month', label: '月' },
      ],
      tags: [
        { label: '稳定版', color: 'var(--tx-color-success)' },
        { label: '测试版', color: 'var(--tx-color-warning)' },
      ],
      closableTag: '可关闭',
      steps: ['下载', '安装', '完成'],
      working: '处理中',
      searching: '检索中',
      edit: '编辑',
    }
  : {
      suiteBase: 'Basics',
      suitePro: 'Pro',
      suiteAi: 'AI',
      createPlugin: 'Create Plugin',
      typeSomething: 'Type something...',
      searchPlugins: 'Search plugins...',
      password: 'Password',
      selectChannel: 'Select channel',
      channels: [
        { value: 'stable', label: 'Stable' },
        { value: 'beta', label: 'Beta' },
        { value: 'snapshot', label: 'Snapshot' },
      ],
      autoSync: 'Auto sync',
      autoSyncDesc: 'Pull plugin updates as they are released',
      resetAlerts: 'Restore the dismissed alerts',
      partial: 'Partial',
      syncing: 'Syncing',
      dividerSection: 'Section',
      formName: 'Name',
      formEmail: 'Email',
      contextHint: 'Right-click here',
      selectionHint: 'Select this text to see the actions.',
      toastSaved: 'Saved',
      toastSavedBody: 'Your draft is synced to the cloud.',
      toastStack: 'Stack 3',
      toastUndo: 'Undo',
      toastDeleted: 'Deleted 1 item',
      add: 'Add',
      translate: 'Translate',
      newPlugin: 'New plugin',
      importWorkflow: 'Import workflow',
      delete: 'Delete',
      dialogTitle: 'Delete plugin?',
      dialogMessage: 'This action cannot be undone.',
      confirm: 'Confirm',
      online: 'Online',
      reviewing: 'Reviewing',
      failed: 'Failed',
      aboutTitle: 'What is Tuffex?',
      close: 'Close',
      closeDrawer: 'Close drawer',
      toastRegion: 'Notifications',
      toastDismiss: 'Dismiss notification',
      aboutBody: 'A Vue component family powering the Talex Touch ecosystem.',
      installTitle: 'How to install?',
      installBody: 'pnpm add @talex-touch/tuffex',
      periods: [
        { value: 'day', label: 'Day' },
        { value: 'week', label: 'Week' },
        { value: 'month', label: 'Month' },
      ],
      tags: [
        { label: 'Stable', color: 'var(--tx-color-success)' },
        { label: 'Beta', color: 'var(--tx-color-warning)' },
      ],
      closableTag: 'Closable',
      steps: ['Download', 'Install', 'Done'],
      working: 'Working',
      searching: 'Searching',
      edit: 'Edit',
    }))

const inputValue = ref('')
const searchValue = ref('tuffex')
const passwordValue = ref('talex-touch')
const channel = ref('')
const multiChannel = ref<string[]>(['stable', 'beta'])
const switchOn = ref(true)
const switchOff = ref(false)
const syncChecked = ref(true)
const pinnedTip = ref(true)
const sliderValue = ref(62)
const deleteOpen = ref(false)
const aboutOpen = ref<string[]>([])
const period = ref('week')
const periodStd = ref('day')
const rating = ref(4)
const page = ref(2)
const pageSize = ref(10)
const avatarNames = ['Talex', 'Kiri', 'Ame', 'Louis']

const avatarVariants = [
  { name: 'Talex', shape: 'circle' as const, tone: 'var(--tx-color-success)' },
  { name: 'Kiri', shape: 'rounded' as const, tone: 'var(--tx-color-warning)' },
  { name: 'Ame', shape: 'square' as const, tone: 'var(--tx-text-color-secondary)' },
]

/*
 * ProgressBar specimen. A pinned percentage is a screenshot of a progress bar,
 * not a progress bar: the fill never eases, the tip glow never travels and the
 * shimmer has nothing to run over. The determinate bar walks a short loop
 * instead. Wrapping remounts it through `progressCycle`, because a fresh
 * element starts at its width rather than easing all the way back down — the
 * loop must never play in reverse.
 */
const PROGRESS_STEPS = [8, 26, 44, 63, 81, 94, 100]
const progressStep = ref(0)
const progressCycle = ref(0)
const progressPercent = computed(() => PROGRESS_STEPS[progressStep.value] ?? 0)
const progressDetail = computed(() => `${(progressPercent.value * 0.024).toFixed(1)} MB / 2.4 MB`)
const progressSegments = computed(() => [
  { value: 56, color: 'var(--tx-color-success)', label: copy.value.channels[0]?.label },
  { value: 30, color: 'var(--tx-color-primary)', label: copy.value.channels[1]?.label },
  { value: 14, color: 'var(--tx-color-warning)', label: copy.value.channels[2]?.label },
])
const progressVisible = ref(false)
let progressReducedMotion = false
let progressTimer: ReturnType<typeof setInterval> | null = null

function stopProgressTimer() {
  if (progressTimer) {
    clearInterval(progressTimer)
    progressTimer = null
  }
}

// The bar moves only while the tab is on screen; a hidden page would otherwise wake once a second.
function onProgressVisibilityChange(visible: boolean) {
  progressVisible.value = visible
  syncProgressTimer()
}

function syncProgressTimer() {
  if (!import.meta.client || typeof document === 'undefined' || progressReducedMotion || document.hidden || !progressVisible.value) {
    stopProgressTimer()
    return
  }
  if (progressTimer)
    return
  progressTimer = setInterval(() => {
    const next = progressStep.value + 1
    if (next >= PROGRESS_STEPS.length) {
      progressStep.value = 0
      progressCycle.value += 1
    }
    else {
      progressStep.value = next
    }
  }, 1000)
}

onMounted(() => {
  // A bar that never settles is exactly what reduced motion asks us not to
  // ship, so those viewers get one mid-run frame and no timer.
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    progressReducedMotion = true
    progressStep.value = 3
    return
  }

  syncProgressTimer()
  document.addEventListener('visibilitychange', syncProgressTimer)
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', syncProgressTimer)
  stopProgressTimer()
})

/* IconChip specimen: the full tone ramp in both variants, so the cell shows
   what the tone/variant pair does rather than four chips of one kind. */
const iconChipTones = [
  { tone: 'red' as const, label: 'PDF' },
  { tone: 'orange' as const, label: 'ZIP' },
  { tone: 'green' as const, label: 'CSV' },
  { tone: 'accent' as const, label: 'DOC' },
  { tone: 'ink' as const, label: 'TS' },
  { tone: 'neutral' as const, label: 'TXT' },
]

/* ── Form band state. Every specimen is live, so each needs its own model. ── */
const cascaderValue = ref<string[]>([])
const dateValue = ref('2026-02-16')
const flatRadioValue = ref('auto')
const flatRadioViewValue = ref('grid')
const flatRadioAlertValues = ref(['mention', 'reply'])

// The Alert specimen is dismissible, so the cell needs a way back — otherwise a
// visitor who tries the close button is left with an empty cell for the rest of
// the session.
const alertsVisible = reactive({ success: true, error: true })
const alertsDismissed = computed(() =>
  Number(!alertsVisible.success) + Number(!alertsVisible.error))

function resetAlerts(): void {
  alertsVisible.success = true
  alertsVisible.error = true
}
const flatSelectValue = ref('json')
const blockInputValue = ref('')
const numberValue = ref(60)
const pickerValue = ref<(string | number)[]>(['nightly'])
const scrubWidth = ref(324)
const scrubHeight = ref(192)
const scrubRotation = ref(12.5)
const scrubOpacity = ref(80)
const sensitiveValue = ref('sk_live_a1b2c3d4e5f6')
const searchText = ref('')
const searchSelectValue = ref('')
const segmentValue = ref(1)
const segments = [
  { value: 0, label: 'S' },
  { value: 1, label: 'M' },
  { value: 2, label: 'L' },
  { value: 3, label: 'XL' },
]
const tagValues = ref(['stable', 'beta'])
const textareaValue = ref('')
const treeSelectValue = ref<string | number>('')
const uploadFiles = ref<FileUploaderFile[]>([])
const uploadImages = ref<ImageUploaderFile[]>([])
const formModel = ref({ name: '', email: '' })

/* ── Layout band. The structural components have nothing of their own to
   render, so each one lays out the same neutral tiles: what the specimen shows
   is the arrangement, not the contents. ── */
const layoutTiles = [1, 2, 3, 4, 5, 6]
const splitRatio = ref(0.42)
const blockSwitch = ref(true)

/* ── Navigation + feedback band. Overlay components have no resting appearance,
   so those specimens show the trigger and open for real on click — the same
   shape the Dialog cell above already uses. ── */
const navTab = ref('home')
const tabBarItems = computed(() => [
  { value: 'home', label: copy.value.suiteBase, iconClass: 'i-carbon-home' },
  { value: 'search', label: copy.value.searching, iconClass: 'i-carbon-search', badge: 3 },
  { value: 'profile', label: copy.value.formName, iconClass: 'i-carbon-user' },
])
const breadcrumbItems = computed(() => [
  { label: 'Tuffex', href: '/', icon: 'i-carbon-home' },
  { label: copy.value.suiteBase },
  { label: copy.value.dividerSection },
])
const modalOpen = ref(false)
const drawerOpen = ref(false)
const popoverOpen = ref(false)
const overlayLoading = ref(true)
const tabsActive = ref('')
const TABS_VARIANTS = ['line', 'pill', 'block', 'outline', 'dot'] as const
const tabsVariant = ref<(typeof TABS_VARIANTS)[number]>('pill')
const tabsVariantNote = computed(() => {
  const notes = props.localeKey === 'zh'
    ? {
        line: '细线压在导航与内容的分隔线上，长度对齐标签。',
        pill: '凸起面，和 TabBar 的胶囊、FlatRadio 的滑块是同一种材质。',
        block: '主色浅染，不投影，放在卡片里也安静。',
        outline: '一圈主色描边，向内画，不占布局。',
        dot: '标签下的小圆点，密集导航里最安静的标记。',
      }
    : {
        line: 'A rule resting on the divider, as long as the label.',
        pill: 'A raised surface — the same body as TabBar\'s pill and FlatRadio\'s thumb.',
        block: 'A tint of the primary colour. No shadow, so it stays quiet on a card.',
        outline: 'A primary ring, drawn inward so it never adds to the box.',
        dot: 'A small mark under the label — the quietest of the five.',
      }
  return notes[tabsVariant.value]
})
const selectionRootRef = ref<HTMLElement | null>(null)
const selectionBarRef = ref<{ el: HTMLElement | null } | null>(null)
// `ignore` is not optional in practice: clicking into the bar's own prompt field
// collapses the document selection, and without this the anchor reads that as
// the reader clearing their selection and drops the snapshot — so the bar
// dismissed itself the moment anyone tried to use it.
const { selection: selectionPayload } = useSelectionAnchor({
  root: selectionRootRef,
  ignore: () => [selectionBarRef.value?.el ?? null],
})

const TOAST_VARIANTS = ['success', 'warning', 'danger'] as const

function fireToast() {
  toast({ title: copy.value.toastSaved, description: copy.value.toastSavedBody, variant: 'success' })
}

function fireToastStack() {
  TOAST_VARIANTS.forEach((variant, i) => {
    globalThis.setTimeout(() => {
      toast({ title: copy.value.toastSaved, description: copy.value.toastSavedBody, variant })
    }, i * 140)
  })
}

function fireToastAction() {
  toast({
    title: copy.value.toastDeleted,
    variant: 'default',
    action: { label: copy.value.toastUndo },
  })
}

/* ── Data display band in base suite. ── */
// One plugin record. The homepage is empty on purpose: the item renders the
// list's `—` placeholder there rather than a blank value.
const descriptionFields = computed(() => (props.localeKey === 'zh'
  ? [
      { label: '插件', value: '剪贴板历史' },
      { label: '版本', value: '2.4.1' },
      { label: '通道', value: '稳定版' },
      { label: '主页', value: '' },
    ]
  : [
      { label: 'Plugin', value: 'Clipboard history' },
      { label: 'Version', value: '2.4.1' },
      { label: 'Channel', value: 'Stable' },
      { label: 'Homepage', value: '' },
    ]))
const filterChip = ref('all')
const filterChipItems = computed(() => [
  { value: 'all', label: copy.value.suiteBase, count: 91 },
  { value: 'beta', label: copy.value.reviewing, count: 12, dot: 'var(--tx-color-warning)' },
])
const galleryTiles = [
  { id: 'a', url: tileImage('#1e3a8a', '#60a5fa', '#e0f2fe', 8), en: 'Dawn ridge', zh: '山脊晨光' },
  { id: 'b', url: tileImage('#064e3b', '#4ade80', '#fef9c3', 8), en: 'Pine valley', zh: '松谷' },
  { id: 'c', url: tileImage('#7c2d12', '#fbbf24', '#fff7ed', 8), en: 'Dune pass', zh: '沙丘垭口' },
]
const galleryItems = computed(() => galleryTiles.map(({ id, url, en, zh }) => ({ id, url, name: props.localeKey === 'zh' ? zh : en })))
// Keyed rather than labelled: the list reorders this ref in place, so labels
// come from a locale lookup (`text.sortableList.itemLabel`) instead of being
// frozen into the items.
const sortableItems = ref([
  { id: 'clipboard', icon: 'i-carbon-paste', tone: 'primary', keys: ['⌘', '⇧', 'V'] },
  { id: 'browser', icon: 'i-carbon-earth', tone: 'success', keys: ['⌘', 'B'] },
  { id: 'actions', icon: 'i-carbon-flash', tone: 'warning', keys: ['⌘', 'K'] },
])
const transferValue = ref<Array<string | number>>(['browser'])
// The MarkdownView cell's own sample: one of each block it renders, so the
// specimen shows the typography rather than a two-line list.
const markdownDoc = computed(() => (props.localeKey === 'zh'
  ? '#### 快速开始\n安装 **TuffEx**，按需引入即可。\n\n- `pnpm add @talex-touch/tuffex`\n- Vue 3 · TypeScript · 支持 SSR\n\n> 每个组件都可以被 Tree-shaking。'
  : '#### Getting started\nInstall **TuffEx** and import only what you use.\n\n- `pnpm add @talex-touch/tuffex`\n- Vue 3 · TypeScript · SSR ready\n\n> Every component is tree-shakable.'))

/*
 * The twelve status components are all thin `TxEmptyState` wrappers differing
 * only in their pinned `variant`, so they share one cell shape driven off this
 * table rather than twelve near-identical blocks.
 */
interface StatusCell {
  slug: string
  is: Component
  en: string
  zh: string
  props: Record<string, unknown>
  on?: Record<string, () => void>
  blockClass?: string
}

const STATUS_COPY: Record<string, Record<'en' | 'zh', [title: string, description: string]>> = {
  'blank-slate': { en: ['Start from scratch', 'Create your first workflow to get going.'], zh: ['从零开始', '创建第一个工作流，马上开始。'] },
  'empty': { en: ['Nothing here yet', 'Items you add will show up here.'], zh: ['这里还没有内容', '添加的内容会显示在这里。'] },
  'empty-state': { en: ['No plugins installed', 'Browse the store to add your first plugin.'], zh: ['还没有安装插件', '去插件市场添加第一个插件。'] },
  'error-state': { en: ['Something went wrong', 'We couldn’t load your plugins. Try again in a moment.'], zh: ['出了点问题', '插件列表加载失败，请稍后重试。'] },
  'guide-state': { en: ['Start here', 'Three quick steps to set up CoreBox.'], zh: ['从这里开始', '三步完成 CoreBox 设置。'] },
  'loading-state': { en: ['Loading plugins', 'This usually takes a second.'], zh: ['正在加载插件', '通常只需要一秒。'] },
  'no-data': { en: ['No data yet', 'Metrics appear after the first sync.'], zh: ['暂无数据', '首次同步后会显示指标。'] },
  'no-selection': { en: ['Nothing selected', 'Pick a plugin to see its details.'], zh: ['未选择任何项', '选择一个插件查看详情。'] },
  'offline-state': { en: ['You’re offline', 'Check your connection. We’ll retry automatically.'], zh: ['网络已断开', '请检查网络，恢复后会自动重试。'] },
  'permission-state': { en: ['Access required', 'Ask a workspace admin to grant access.'], zh: ['需要权限', '请联系工作区管理员授权。'] },
  'search-empty': { en: ['No results for “tuffex”', 'Try a different keyword or filter.'], zh: ['没有找到“tuffex”', '换个关键词或筛选条件试试。'] },
}

function statusCopy(slug: string) {
  const [title, description] = STATUS_COPY[slug]?.[props.localeKey] ?? ['', '']
  return { title, description }
}

// Retry is a real round trip: the illustration swaps for the spinner and the
// button locks until the attempt settles, rather than being a dead button.
const errorRetrying = ref(false)
let errorRetryTimer: ReturnType<typeof setTimeout> | null = null

function retryErrorState() {
  if (errorRetrying.value)
    return
  errorRetrying.value = true
  errorRetryTimer = setTimeout(() => {
    errorRetrying.value = false
    errorRetryTimer = null
  }, 1400)
}

onBeforeUnmount(() => {
  if (errorRetryTimer)
    clearTimeout(errorRetryTimer)
})

const statusStates = computed<StatusCell[]>(() => [
  { slug: 'blank-slate', is: TxBlankSlate, en: 'BlankSlate', zh: '空白板', props: statusCopy('blank-slate') },
  { slug: 'empty', is: TxEmpty, en: 'Empty', zh: '空', props: statusCopy('empty') },
  { slug: 'empty-state', is: TxEmptyState, en: 'EmptyState', zh: '空状态', props: statusCopy('empty-state') },
  {
    slug: 'error-state',
    is: TxErrorState,
    en: 'ErrorState',
    zh: '错误态',
    props: {
      ...statusCopy('error-state'),
      loading: errorRetrying.value,
      primaryAction: { label: props.localeKey === 'zh' ? '重试' : 'Retry', icon: 'i-carbon-renew', disabled: errorRetrying.value },
    },
    on: { primary: retryErrorState },
  },
  { slug: 'guide-state', is: TxGuideState, en: 'GuideState', zh: '引导态', props: statusCopy('guide-state') },
  { slug: 'layout-skeleton', is: TxLayoutSkeleton, en: 'LayoutSkeleton', zh: '布局骨架', props: {}, blockClass: 'docs-gallery__layout-skel' },
  { slug: 'loading-state', is: TxLoadingState, en: 'LoadingState', zh: '加载态', props: statusCopy('loading-state') },
  { slug: 'no-data', is: TxNoData, en: 'NoData', zh: '无数据', props: statusCopy('no-data') },
  { slug: 'no-selection', is: TxNoSelection, en: 'NoSelection', zh: '未选择', props: statusCopy('no-selection') },
  { slug: 'offline-state', is: TxOfflineState, en: 'OfflineState', zh: '离线态', props: statusCopy('offline-state') },
  { slug: 'permission-state', is: TxPermissionState, en: 'PermissionState', zh: '权限态', props: statusCopy('permission-state') },
  { slug: 'search-empty', is: TxSearchEmpty, en: 'SearchEmpty', zh: '搜索无结果', props: statusCopy('search-empty') },
])
</script>

<template>
  <div class="docs-gallery__grid">
    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('button')">
        {{ cellLabel('Button', '按钮') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__stack">
            <TxButton icon="i-carbon-add">
              {{ copy.createPlugin }}
            </TxButton>
            <TxButton variant="primary" icon="i-carbon-add">
              {{ copy.createPlugin }}
            </TxButton>
            <TxButton loading>
              {{ copy.createPlugin }}
            </TxButton>
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('input')">
        {{ cellLabel('Input', '输入') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block docs-gallery__stack">
            <TuffInput v-model="inputValue" :placeholder="copy.typeSomething" />
            <TuffInput v-model="searchValue" prefix-icon="i-carbon-search" :placeholder="copy.searchPlugins" clearable />
            <TuffInput v-model="passwordValue" type="password" prefix-icon="i-carbon-locked" :placeholder="copy.password" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('select')">
        {{ cellLabel('Select', '选择器') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block docs-gallery__stack">
            <TuffSelect v-model="channel" :placeholder="copy.selectChannel">
              <TuffSelectItem
                v-for="option in copy.channels"
                :key="option.value"
                :value="option.value"
                :label="option.label"
              />
            </TuffSelect>
            <TuffSelect v-model="multiChannel" multiple :placeholder="copy.selectChannel">
              <TuffSelectItem
                v-for="option in copy.channels"
                :key="option.value"
                :value="option.value"
                :label="option.label"
              />
            </TuffSelect>
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('switch')">
        {{ cellLabel('Switch', '开关') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__row">
            <TuffSwitch v-model="switchOn" :aria-label="text.switches.sync" />
            <TuffSwitch v-model="switchOff" :aria-label="text.switches.compact" />
            <!-- Pinned on: the ring brightens with the thumb, so it reads
                 against the active track instead of grey on grey. -->
            <TuffSwitch :model-value="true" loading :aria-label="text.switches.backup" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('checkbox')">
        {{ cellLabel('Checkbox', '复选框') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__row">
            <TxCheckbox v-model="syncChecked" :label="copy.autoSync" />
            <TxCheckbox :model-value="false" indeterminate :label="copy.partial" />
            <!-- Checked so the ring keeps the primary hue, which is what the
                 loading state uses to say "still on" while the commit lands. -->
            <TxCheckbox :model-value="true" loading :label="copy.syncing" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('slider')">
        {{ cellLabel('Slider', '滑块') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxSlider v-model="sliderValue" :min="0" :max="100" :step="1" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('tooltip')">
        {{ cellLabel('Tooltip', '提示') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__row">
            <!--
              Pinned through v-model rather than a fixed `:model-value="true"`:
              the anchor-delay service preempts hint-over-hint by calling the
              tooltip's close, and a literal prop pins the getter so that close
              can never land — both bubbles would sit on screen together. The
              trigger is `manual` so leaving the pinned button cannot dismiss
              the specimen, and the neighbour's close restores it.
            -->
            <TxTooltip v-model="pinnedTip" trigger="manual" :content="copy.add">
              <TxButton circle icon="i-carbon-add" />
            </TxTooltip>
            <TxTooltip :content="copy.translate" @close="pinnedTip = true">
              <TxButton circle icon="i-carbon-translate" />
            </TxTooltip>
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('dropdown-menu')">
        {{ cellLabel('DropdownMenu', '下拉菜单') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <TxDropdownMenu>
            <template #trigger>
              <TxButton icon="i-carbon-add">
                {{ copy.add }}
              </TxButton>
            </template>
            <TxDropdownItem>{{ copy.newPlugin }}</TxDropdownItem>
            <TxDropdownItem>{{ copy.importWorkflow }}</TxDropdownItem>
            <TxDropdownItem danger>
              {{ copy.delete }}
            </TxDropdownItem>
          </TxDropdownMenu>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('dialog')">
        {{ cellLabel('Dialog', '弹窗') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <TxButton @click="deleteOpen = true">
            {{ copy.delete }}
          </TxButton>
          <TxBlowDialog
            v-if="deleteOpen"
            :title="copy.dialogTitle"
            :message="copy.dialogMessage"
            :confirm-text="copy.confirm"
            :close="() => (deleteOpen = false)"
          />
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('status-badge')">
        {{ cellLabel('StatusBadge', '状态徽标') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__row">
            <TxStatusBadge :text="copy.online" status="success" />
            <TxStatusBadge :text="copy.reviewing" status="warning" />
            <TxStatusBadge :text="copy.failed" status="danger" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('progress-bar')">
        {{ cellLabel('ProgressBar', '进度条') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly @visibility-change="onProgressVisibilityChange">
          <div class="docs-gallery__block docs-gallery__block--wide docs-gallery__stack">
            <!-- Live, so the specimen shows the easing fill, the tip glow
                 riding it and the stardust drifting over the filled part. -->
            <TxProgressBar
              :key="progressCycle"
              :percentage="progressPercent"
              :detail="progressDetail"
              text-placement="top"
              flow-effect="stardust"
              show-text
              :aria-label="text.progress.download"
            />
            <TxProgressBar :percentage="100" status="success" :aria-label="text.progress.installed" />
            <TxProgressBar :percentage="38" status="error" :aria-label="text.progress.failed" />
            <TxProgressBar :segments="progressSegments" :aria-label="text.progress.share" />
            <TxProgressBar indeterminate indeterminate-variant="elastic" :aria-label="text.progress.loading" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('collapse')">
        {{ cellLabel('Collapse', '折叠') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxCollapse v-model="aboutOpen">
              <TxCollapseItem :title="copy.aboutTitle" name="about">
                {{ copy.aboutBody }}
              </TxCollapseItem>
              <TxCollapseItem :title="copy.installTitle" name="install">
                {{ copy.installBody }}
              </TxCollapseItem>
            </TxCollapse>
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('radio')">
        {{ cellLabel('Radio', '单选') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__stack docs-gallery__stack--center">
            <TxRadioGroup v-model="period" type="button">
              <TxRadio
                v-for="option in copy.periods"
                :key="option.value"
                :value="option.value"
                :label="option.label"
              />
            </TxRadioGroup>
            <TxRadioGroup v-model="periodStd" type="standard" direction="row">
              <TxRadio
                v-for="option in copy.periods.slice(0, 2)"
                :key="option.value"
                :value="option.value"
                :label="option.label"
                type="standard"
              />
            </TxRadioGroup>
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('rating')">
        {{ cellLabel('Rating', '评分') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__stack docs-gallery__stack--center">
            <TxRating v-model="rating" v-bind="text.rating" />
            <TxRating :model-value="3.5" :precision="0.5" readonly v-bind="text.rating" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('tag')">
        {{ cellLabel('Tag', '标签') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__row">
            <TxTag
              v-for="tag in copy.tags"
              :key="tag.label"
              :label="tag.label"
              :color="tag.color"
            />
            <TxTag :label="copy.closableTag" closable v-bind="text.tag" />
            <TxTag label="+3" variant="plain" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('badge')">
        {{ cellLabel('Badge', '徽标') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__row">
            <TxBadge variant="error" :value="3" />
            <TxBadge variant="primary" value="PRO" />
            <TxBadge variant="success" dot />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('avatar')">
        {{ cellLabel('Avatar', '头像') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__stack docs-gallery__stack--center">
            <TxAvatarGroup :max="3">
              <TxAvatar v-for="name in avatarNames" :key="name" :name="name" />
            </TxAvatarGroup>
            <div class="docs-gallery__row">
              <TxAvatar name="Talex" status="online" />
              <TxAvatar name="Kiri" shape="rounded" />
              <TxAvatar icon="user" shape="square" />
            </div>
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('steps')">
        {{ cellLabel('Steps', '步骤条') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <TxSteps :active="1" size="small">
            <TxStep
              v-for="(title, index) in copy.steps"
              :key="title"
              :step="index"
              :title="title"
            />
          </TxSteps>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('pagination')">
        {{ cellLabel('Pagination', '分页') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__stack docs-gallery__stack--center">
            <TxPagination v-model:current-page="page" :total="50" :page-size="pageSize" v-bind="text.pagination" />
            <label class="docs-gallery__page-size">
              <span>{{ localeKey === 'zh' ? '每页条数' : 'Items per page' }}</span>
              <TxSelect v-model="pageSize" v-bind="text.select" :aria-label="localeKey === 'zh' ? '每页条数' : 'Items per page'">
                <TxSelectItem v-for="size in [10, 20, 50]" :key="size" :value="size" :label="String(size)" />
              </TxSelect>
            </label>
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('skeleton')">
        {{ cellLabel('Skeleton', '骨架屏') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block docs-gallery__stack">
            <div class="docs-gallery__row">
              <TxSkeleton loading variant="circle" :width="32" :height="32" />
              <div class="docs-gallery__grow">
                <TxSkeleton loading :lines="2" width="100%" />
              </div>
            </div>
            <TxSkeleton loading :lines="2" width="100%" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('divider')">
        {{ cellLabel('Divider', '分割线') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block docs-gallery__stack">
            <TxDivider />
            <TxDivider text-placement="left">
              {{ copy.dividerSection }}
            </TxDivider>
            <TxDivider dashed />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('icon')">
        {{ cellLabel('Icon', '图标') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__row">
            <TxStatusIcon name="i-carbon-cloud-upload" :size="24" tone="info" />
            <TxStatusIcon name="i-carbon-checkmark" :size="24" tone="success" />
            <TxStatusIcon name="i-carbon-warning" :size="24" tone="warning" />
            <TxStatusIcon name="i-carbon-close" :size="24" tone="error" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('icon-chip')">
        {{ cellLabel('IconChip', '图标徽标') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__stack docs-gallery__stack--center">
            <div class="docs-gallery__row">
              <TxIconChip
                v-for="chip in iconChipTones"
                :key="`solid-${chip.tone}`"
                :size="26"
                :tone="chip.tone"
                :label="chip.label"
              />
            </div>
            <div class="docs-gallery__row">
              <TxIconChip
                v-for="chip in iconChipTones"
                :key="`soft-${chip.tone}`"
                :size="26"
                :tone="chip.tone"
                :label="chip.label"
                variant="soft"
              />
            </div>
            <!-- The size ladder and the circle shape, which the two tone rows
                 above hold constant. -->
            <div class="docs-gallery__row">
              <TxIconChip :size="14" tone="accent" label="v4" />
              <TxIconChip :size="20" tone="ink" label="TS" />
              <TxIconChip :size="32" shape="circle" tone="accent" label="AI" />
              <TxIconChip :size="32" shape="circle" tone="green" variant="soft" label="OK" />
            </div>
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('kbd')">
        {{ cellLabel('Kbd', '按键') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__row">
            <TxKbd tone="primary">
              ⌘
            </TxKbd>
            <TxKbd tone="primary">
              K
            </TxKbd>
            <TxKbd>⇧</TxKbd>
            <TxKbd>Esc</TxKbd>
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('avatar-variants')">
        {{ cellLabel('AvatarVariants', '头像变体') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__row">
            <TxCornerOverlay
              v-for="variant in avatarVariants"
              :key="variant.name"
              placement="bottom-right"
              :offset-x="-2"
              :offset-y="-2"
            >
              <TxAvatar :name="variant.name" :shape="variant.shape" />
              <template #overlay>
                <span class="docs-gallery__dot" :style="{ background: variant.tone }" />
              </template>
            </TxCornerOverlay>
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('cascader')">
        {{ cellLabel('Cascader', '级联选择') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxCascader v-model="cascaderValue" :options="text.cascaderOptions" :placeholder="copy.selectChannel" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('date-picker')">
        {{ cellLabel('DatePicker', '日期选择') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxDatePicker v-model="dateValue" variant="field" :popup="false" v-bind="text.datePicker" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('file-uploader')">
        {{ cellLabel('FileUploader', '文件上传') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxFileUploader v-model="uploadFiles" accept=".pdf,.png" :max="3" v-bind="text.fileUploader" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('flat-radio')">
        {{ cellLabel('FlatRadio', '扁平单选') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__stack docs-gallery__stack--center">
            <!-- The xl tier leads: one specimen at the size the control is
                 actually meant to be read at, then the range below it. -->
            <div class="docs-gallery__row">
              <TxFlatRadio v-model="flatRadioValue" size="xl">
                <TxFlatRadioItem value="light" :label="text.themes.light" />
                <TxFlatRadioItem value="dark" :label="text.themes.dark" />
                <TxFlatRadioItem value="auto" :label="text.themes.auto" />
              </TxFlatRadio>
            </div>
            <div class="docs-gallery__row">
              <TxFlatRadio v-model="flatRadioViewValue">
                <TxFlatRadioItem value="grid" icon="i-carbon-grid" :label="text.views.grid" />
                <TxFlatRadioItem value="list" icon="i-carbon-list" :label="text.views.list" />
                <TxFlatRadioItem value="kanban" icon="i-carbon-column" :label="text.views.kanban" />
              </TxFlatRadio>
            </div>
            <div class="docs-gallery__row">
              <TxFlatRadio v-model="flatRadioAlertValues" size="sm" multiple>
                <TxFlatRadioItem value="mention" icon="i-carbon-at" :aria-label="text.alerts.mention" />
                <TxFlatRadioItem value="reply" icon="i-carbon-reply" :aria-label="text.alerts.reply" />
                <TxFlatRadioItem value="archive" icon="i-carbon-archive" :aria-label="text.alerts.archive" />
                <TxFlatRadioItem value="mute" icon="i-carbon-volume-mute" :aria-label="text.alerts.mute" />
              </TxFlatRadio>
            </div>
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('flat-select')">
        {{ cellLabel('FlatSelect', '扁平选择') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxFlatSelect v-model="flatSelectValue">
              <TxFlatSelectItem value="json" label="JSON" />
              <TxFlatSelectItem value="csv" label="CSV" />
              <TxFlatSelectItem value="xml" label="XML" />
            </TxFlatSelect>
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('form')">
        {{ cellLabel('Form', '表单') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxForm :model="formModel" label-width="64px">
              <TxFormItem :label="copy.formName" prop="name">
                <TuffInput v-model="formModel.name" :placeholder="copy.typeSomething" />
              </TxFormItem>
              <TxFormItem :label="copy.formEmail" prop="email">
                <TuffInput v-model="formModel.email" placeholder="you@talex.cc" />
              </TxFormItem>
            </TxForm>
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('image-uploader')">
        {{ cellLabel('ImageUploader', '图片上传') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <!-- No fixed-width block here: the uploader's grid is `auto-fill`, so a
               240px block gives it two tracks and parks the lone add tile in the
               left one, off the centre of the stage. Letting it size to its own
               content puts the tile where every other specimen sits. -->
          <TxImageUploader v-model="uploadImages" :max="3" accept="image/png,image/jpeg" v-bind="text.imageUploader" />
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('number-input')">
        {{ cellLabel('NumberInput', '数字输入') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxNumberInput v-model="numberValue" :min="0" :max="100" :step="5" :precision="0" v-bind="text.numberInput" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('picker')">
        {{ cellLabel('Picker', '滚动选择') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <!-- Toolbar off: with no popup to confirm into, Cancel/Confirm are
                 dead controls that only make this cell taller than its row. -->
            <TxPicker
              v-model="pickerValue"
              :columns="text.pickerColumns"
              :popup="false"
              :show-toolbar="false"
              :visible-item-count="5"
            />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('scrub-field')">
        {{ cellLabel('ScrubField', '拖拽数值') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block docs-gallery__scrub-fields">
            <TxScrubField v-model="scrubWidth" label="W" suffix="px" :min="40" :max="999" :aria-label="localeKey === 'zh' ? '宽度' : 'Width'" :value-label="localeKey === 'zh' ? '宽度数值' : 'Width value'" />
            <TxScrubField v-model="scrubHeight" label="H" suffix="px" :min="40" :max="999" :aria-label="localeKey === 'zh' ? '高度' : 'Height'" :value-label="localeKey === 'zh' ? '高度数值' : 'Height value'" />
            <TxScrubField v-model="scrubRotation" label="R" suffix="°" :min="-180" :max="180" :step="0.5" active :aria-label="localeKey === 'zh' ? '旋转角度' : 'Rotation'" :value-label="localeKey === 'zh' ? '旋转角度数值' : 'Rotation value'" />
            <TxScrubField v-model="scrubOpacity" label="α" suffix="%" :min="0" :max="100" disabled :aria-label="localeKey === 'zh' ? '不透明度' : 'Opacity'" :value-label="localeKey === 'zh' ? '不透明度数值' : 'Opacity value'" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('search-input')">
        {{ cellLabel('SearchInput', '搜索输入') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxSearchInput v-model="searchText" :placeholder="copy.searchPlugins" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('search-select')">
        {{ cellLabel('SearchSelect', '搜索选择') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxSearchSelect v-model="searchSelectValue" :options="text.searchSelectOptions" :placeholder="copy.searchPlugins" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('segmented-slider')">
        {{ cellLabel('SegmentedSlider', '分段滑块') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxSegmentedSlider v-model="segmentValue" :segments="segments" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('sensitive-input')">
        {{ cellLabel('SensitiveInput', '敏感输入') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxSensitiveInput v-model="sensitiveValue" v-bind="text.sensitiveInput" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('tag-input')">
        {{ cellLabel('TagInput', '标签输入') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxTagInput v-model="tagValues" :placeholder="copy.typeSomething" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('textarea')">
        {{ cellLabel('Textarea', '多行输入') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxTextarea v-model="textareaValue" :placeholder="copy.typeSomething" :max-length="120" show-count />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('tree-select')">
        {{ cellLabel('TreeSelect', '树选择') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxTreeSelect v-model="treeSelectValue" :nodes="text.treeSelectNodes" :placeholder="copy.selectChannel" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('card')">
        {{ cellLabel('Card', '卡片') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxCard :padding="14" :radius="14">
              <strong>{{ copy.aboutTitle }}</strong>
              <p class="docs-gallery__muted">
                {{ copy.aboutBody }}
              </p>
            </TxCard>
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('card-item')">
        {{ cellLabel('CardItem', '卡片条目') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block docs-gallery__stack">
            <TxCardItem :title="text.plugins.clipboard" subtitle="com.talex.clipboard" avatar-text="C" />
            <TxCardItem :title="text.plugins.browser" subtitle="com.talex.browser" avatar-text="B" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('container')">
        {{ cellLabel('Container', '容器') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <!-- One row per line: a gutter only spaces columns, so four spans
               wrapped inside a single row stacked with no gap between lines. -->
          <div class="docs-gallery__block">
            <TxContainer>
              <div class="docs-gallery__rows">
                <TxRow :gutter="8">
                  <TxCol :span="12">
                    <div class="docs-gallery__tile">
                      12
                    </div>
                  </TxCol>
                  <TxCol :span="12">
                    <div class="docs-gallery__tile">
                      12
                    </div>
                  </TxCol>
                </TxRow>
                <TxRow :gutter="8">
                  <TxCol :span="8">
                    <div class="docs-gallery__tile">
                      8
                    </div>
                  </TxCol>
                  <TxCol :span="16">
                    <div class="docs-gallery__tile">
                      16
                    </div>
                  </TxCol>
                </TxRow>
              </div>
            </TxContainer>
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('flex')">
        {{ cellLabel('Flex', '弹性布局') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxFlex :gap="8" wrap="wrap" justify="center">
              <div v-for="tile in layoutTiles" :key="tile" class="docs-gallery__tile">
                {{ tile }}
              </div>
            </TxFlex>
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('grid')">
        {{ cellLabel('Grid', '栅格') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxGrid :cols="3" :gap="8">
              <TxGridItem v-for="tile in layoutTiles" :key="tile">
                <div class="docs-gallery__tile">
                  {{ tile }}
                </div>
              </TxGridItem>
            </TxGrid>
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('grid-layout')">
        {{ cellLabel('GridLayout', '网格布局') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxGridLayout>
              <div v-for="tile in layoutTiles" :key="tile" class="tx-grid-layout__item docs-gallery__tile">
                {{ tile }}
              </div>
            </TxGridLayout>
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('group-block')">
        {{ cellLabel('GroupBlock', '设置分组') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxGroupBlock :name="copy.dividerSection">
              <!-- `prop` makes the row a form item, so its title names the switch
                   instead of the switch's own "Toggle". -->
              <TxBlockSwitch v-model="blockSwitch" prop="autoSync" :title="copy.autoSync" :description="copy.autoSyncDesc" />
              <TxBlockLine :title="copy.installTitle" :description="copy.installBody" />
              <TxBlockInput v-model="blockInputValue" :title="copy.formName" :placeholder="copy.typeSomething" />
            </TxGroupBlock>
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('scroll')">
        {{ cellLabel('Scroll', '滚动容器') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxScroll class="docs-gallery__scroll">
              <div v-for="tile in [1, 2, 3, 4, 5, 6, 7, 8]" :key="tile" class="docs-gallery__scroll-row">
                {{ copy.dividerSection }} {{ tile }}
              </div>
            </TxScroll>
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('splitter')">
        {{ cellLabel('Splitter', '分栏') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block docs-gallery__splitter">
            <TxSplitter v-model="splitRatio" :min="0.25" :max="0.75">
              <template #a>
                <div class="docs-gallery__tile docs-gallery__tile--fill">
                  A
                </div>
              </template>
              <template #b>
                <div class="docs-gallery__tile docs-gallery__tile--fill">
                  B
                </div>
              </template>
            </TxSplitter>
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('stack')">
        {{ cellLabel('Stack', '堆叠') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxStack direction="vertical" :gap="8">
              <div v-for="tile in [1, 2, 3]" :key="tile" class="docs-gallery__tile">
                {{ tile }}
              </div>
            </TxStack>
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('breadcrumb')">
        {{ cellLabel('Breadcrumb', '面包屑') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <TxBreadcrumb :items="breadcrumbItems" v-bind="text.breadcrumb" />
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('context-menu')">
        {{ cellLabel('ContextMenu', '右键菜单') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <TxContextMenu>
            <template #default>
              <div class="docs-gallery__tile docs-gallery__context-target">
                {{ copy.contextHint }}
              </div>
            </template>
            <template #menu>
              <TxDropdownItem>{{ copy.newPlugin }}</TxDropdownItem>
              <TxDropdownItem>{{ copy.importWorkflow }}</TxDropdownItem>
            </template>
          </TxContextMenu>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('flat-dropdown')">
        {{ cellLabel('FlatDropdown', '扁平下拉') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <TxFlatDropdown trigger="hover" placement="bottom-start" :offset="10" close-on-content-click>
            <template #trigger="{ open }">
              <TxButton size="sm" :variant="open ? 'primary' : 'secondary'">
                {{ copy.add }}
              </TxButton>
            </template>
            <TxFlatSelectItem value="new" :label="copy.newPlugin" />
            <TxFlatSelectItem value="import" :label="copy.importWorkflow" />
          </TxFlatDropdown>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('nav-bar')">
        {{ cellLabel('NavBar', '导航栏') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block docs-gallery__framed docs-gallery__chrome">
            <TxNavBar :title="copy.suiteBase" show-back v-bind="text.navBar">
              <template #right>
                <span class="docs-gallery__navbar-action">{{ copy.edit }}</span>
              </template>
            </TxNavBar>
            <div class="docs-gallery__chrome-body" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('sidebar-nav')">
        {{ cellLabel('SidebarNav', '侧边导航') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__sidebar">
            <TxSidebarNav v-model="navTab" :items="tabBarItems" v-bind="text.sidebarNav" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('tab-bar')">
        {{ cellLabel('TabBar', '标签栏') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block docs-gallery__tab-bars">
            <div class="docs-gallery__framed docs-gallery__chrome">
              <div class="docs-gallery__chrome-body docs-gallery__chrome-body--compact" />
              <TxTabBar v-model="navTab" :items="tabBarItems" :fixed="false" size="sm" />
            </div>
            <div class="docs-gallery__framed docs-gallery__chrome">
              <div class="docs-gallery__chrome-body docs-gallery__chrome-body--compact" />
              <TxTabBar v-model="navTab" :items="tabBarItems" :fixed="false" size="sm" indicator="line" />
            </div>
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('tabs')">
        {{ cellLabel('Tabs', '标签页') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block docs-gallery__tabs">
            <!-- The variant switcher is a FlatRadio on purpose: its thumb and
                 the tabs' pointer ride the same jelly engine, so the cell
                 shows the family twice. -->
            <TxFlatRadio v-model="tabsVariant" size="sm" class="docs-gallery__tabs-variants">
              <TxFlatRadioItem v-for="variant in TABS_VARIANTS" :key="variant" :value="variant" :label="variant" />
            </TxFlatRadio>
            <TxTabs v-model="tabsActive" placement="top" :indicator-variant="tabsVariant">
              <!-- `:activation="true"`, not the `activation` shorthand: TxTabs
                   picks the initial tab off the raw vnode props, where the
                   shorthand is the empty string and reads as false. -->
              <TxTabItem :name="copy.suiteBase" icon-class="i-carbon-home" :activation="true">
                <p class="docs-gallery__muted">
                  {{ tabsVariantNote }}
                </p>
              </TxTabItem>
              <TxTabItem :name="copy.suitePro" icon-class="i-carbon-rocket">
                <p class="docs-gallery__muted">
                  {{ tabsVariantNote }}
                </p>
              </TxTabItem>
              <TxTabItem :name="copy.suiteAi" icon-class="i-carbon-machine-learning-model">
                <p class="docs-gallery__muted">
                  {{ tabsVariantNote }}
                </p>
              </TxTabItem>
            </TxTabs>
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('alert')">
        {{ cellLabel('Alert', '警示') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block docs-gallery__stack docs-gallery__alerts">
            <button
              v-show="alertsDismissed > 0"
              class="docs-gallery__reset"
              type="button"
              :aria-label="copy.resetAlerts"
              :title="copy.resetAlerts"
              @click="resetAlerts"
            >
              <span class="i-carbon-reset" aria-hidden="true" />
            </button>
            <TransitionGroup name="docs-gallery-alert">
              <TxAlert
                v-if="alertsVisible.success"
                key="success"
                :title="copy.online"
                :message="copy.aboutBody"
                type="success"
                :close-label="copy.close"
                @close="alertsVisible.success = false"
              />
              <TxAlert
                v-if="alertsVisible.error"
                key="error"
                :title="copy.failed"
                :message="copy.dialogMessage"
                type="error"
                :close-label="copy.close"
                @close="alertsVisible.error = false"
              />
            </TransitionGroup>
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('drawer')">
        {{ cellLabel('Drawer', '抽屉') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <TxButton @click="drawerOpen = true">
            {{ copy.dividerSection }}
          </TxButton>
          <TxDrawer v-model:visible="drawerOpen" :title="copy.aboutTitle" :close-label="copy.closeDrawer">
            <p class="docs-gallery__muted">
              {{ copy.aboutBody }}
            </p>
          </TxDrawer>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('loading-overlay')">
        {{ cellLabel('LoadingOverlay', '加载遮罩') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxLoadingOverlay :loading="overlayLoading" :text="copy.working">
              <div class="docs-gallery__tile docs-gallery__overlay-body">
                {{ copy.aboutBody }}
              </div>
            </TxLoadingOverlay>
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('modal')">
        {{ cellLabel('Modal', '模态框') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <TxButton variant="primary" @click="modalOpen = true">
            {{ copy.aboutTitle }}
          </TxButton>
          <TxModal v-model="modalOpen" :title="copy.aboutTitle" :close-label="copy.close" width="min(92vw, 420px)">
            <p class="docs-gallery__muted">
              {{ copy.aboutBody }}
            </p>
          </TxModal>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('popover')">
        {{ cellLabel('Popover', '气泡卡片') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <TxPopover v-model="popoverOpen" trigger="click">
            <template #reference>
              <TxButton>{{ copy.installTitle }}</TxButton>
            </template>
            <p class="docs-gallery__muted docs-gallery__popover-body">
              {{ copy.installBody }}
            </p>
          </TxPopover>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('progress')">
        {{ cellLabel('Progress', '进度') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block docs-gallery__stack">
            <TuffProgress :percentage="60" :aria-label="text.uploads.upload" />
            <TuffProgress :percentage="92" status="success" :aria-label="text.uploads.synced" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('selection-actions')">
        {{ cellLabel('SelectionActions', '选区操作') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <!-- The bar has no resting form: it anchors to a live text
               selection, so the specimen is the passage you select in. -->
          <div ref="selectionRootRef" class="docs-gallery__block">
            <p class="docs-gallery__muted">
              {{ copy.selectionHint }}
            </p>
            <TxSelectionActions ref="selectionBarRef" :selection="selectionPayload" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('spinner')">
        {{ cellLabel('Spinner', '加载指示') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__row">
            <TxSpinner v-bind="text.spinner" />
            <TxSpinner :size="28" v-bind="text.spinner" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('toast')">
        {{ cellLabel('Toast', '轻提示') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__row">
            <TxButton size="sm" @click="fireToast">
              {{ copy.toastSaved }}
            </TxButton>
            <TxButton size="sm" variant="ghost" @click="fireToastStack">
              {{ copy.toastStack }}
            </TxButton>
            <TxButton size="sm" variant="ghost" @click="fireToastAction">
              {{ copy.toastUndo }}
            </TxButton>
          </div>
          <TxToastHost :aria-label="copy.toastRegion" :close-label="copy.toastDismiss" />
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('cell-link')">
        {{ cellLabel('CellLink', '单元链接') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block docs-gallery__stack">
            <TxCellLink href="https://www.npmjs.com/package/@talex-touch/tuffex" label="@talex-touch/tuffex" external />
            <TxCellLink href="https://github.com/talex-touch/talex-touch" label="talex-touch" external muted />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('data-table')">
        {{ cellLabel('DataTable', '数据表') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxDataTable :columns="text.tableColumns" :data="text.tableRows" row-key="id" hover />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('descriptions')">
        {{ cellLabel('Descriptions', '描述列表') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxDescriptions :columns="1">
              <TxDescriptionsItem v-for="field in descriptionFields" :key="field.label" :label="field.label">
                {{ field.value }}
              </TxDescriptionsItem>
            </TxDescriptions>
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('dot-indicator')">
        {{ cellLabel('DotIndicator', '状态点') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__stack">
            <TxDotIndicator color="var(--tx-color-success)" :label="copy.online" />
            <TxDotIndicator color="var(--tx-color-warning)" :label="copy.reviewing" />
            <TxDotIndicator color="var(--tx-color-danger)" :label="copy.failed" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('filter-chips')">
        {{ cellLabel('FilterChips', '筛选标签') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <TxFilterChips v-model="filterChip" :items="filterChipItems" v-bind="text.filterChips" />
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('image-gallery')">
        {{ cellLabel('ImageGallery', '图片画廊') }}
      </NuxtLink>
      <div class="docs-gallery__stage docs-gallery__stage--thumbs not-prose">
        <ClientOnly>
          <div class="docs-gallery__block docs-gallery__thumbs">
            <GalleryImageGallery :items="galleryItems" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('image-preview')">
        {{ cellLabel('ImagePreview', '图片预览') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <GalleryImagePreview />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('markdown-view')">
        {{ cellLabel('MarkdownView', 'Markdown 视图') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 202px; --docs-gallery-specimen-narrow: 265px">
        <ClientOnly>
          <div class="docs-gallery__block">
            <div class="docs-gallery__doc">
              <div class="docs-gallery__doc-bar">
                <span class="i-carbon-document" aria-hidden="true" />
                README.md
              </div>
              <TxMarkdownView :content="markdownDoc" />
            </div>
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('sortable-list')">
        {{ cellLabel('SortableList', '可排序列表') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <!-- The bound text carries `item-label`: without it the live region
                 announces the raw id. -->
            <TxSortableList v-model="sortableItems" handle v-bind="text.sortableList">
              <template #item="{ item, handleAttrs }">
                <div class="docs-gallery__sort-row">
                  <span class="docs-gallery__grip i-carbon-draggable" v-bind="handleAttrs" />
                  <span class="docs-gallery__sort-icon" :data-tone="item.tone" aria-hidden="true">
                    <span :class="item.icon" />
                  </span>
                  <span class="docs-gallery__sort-label">{{ text.sortableList.itemLabel(item) }}</span>
                  <span class="docs-gallery__sort-keys" aria-hidden="true">
                    <TxKbd v-for="key in item.keys" :key="key" size="sm">{{ key }}</TxKbd>
                  </span>
                </div>
              </template>
            </TxSortableList>
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('stat-card')">
        {{ cellLabel('StatCard', '指标卡') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxStatCard
              :value="12847"
              :label="localeKey === 'zh' ? '周活跃用户' : 'Weekly active users'"
              icon-class="i-carbon-user-multiple docs-gallery__stat-icon"
              :insight="{ from: 11020, to: 12847, type: 'percent' }"
            />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('timeline')">
        {{ cellLabel('Timeline', '时间线') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxTimeline>
              <TxTimelineItem v-for="(step, index) in copy.steps" :key="step" :title="step" :active="index === 0" />
            </TxTimeline>
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('transfer')">
        {{ cellLabel('Transfer', '穿梭框') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block docs-gallery__transfer">
            <!-- The panel's own floor is 240px; the cell is 190. Without this the
                 specimen laid out past its stage instead of inside it. -->
            <TxTransfer v-model="transferValue" :data="text.transferData" v-bind="text.transfer" min-height="140px" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('tree')">
        {{ cellLabel('Tree', '树形控件') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <!-- Selection is on by default but was invisible here: the tree kept
                 no state of its own, so an unbound specimen never lit a row. -->
            <TxTree
              v-bind="text.tree"
              :nodes="text.treeNodes"
              :default-expanded-keys="['plugins']"
              :default-selected-keys="['clipboard']"
            />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section v-for="state in statusStates" :key="state.slug" class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath(state.slug)">
        {{ cellLabel(state.en, state.zh) }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block" :class="state.blockClass">
            <component :is="state.is" v-bind="state.props" v-on="state.on ?? {}" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>
  </div>
</template>
