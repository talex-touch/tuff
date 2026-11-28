<script setup lang="ts">
import type { Component } from 'vue'
import { computed, defineAsyncComponent, onMounted, ref, shallowRef } from 'vue'
import { galleryText } from '../gallery-text'
import ClientOnly from '../GallerySpecimenGate.vue'
import { tileImage } from '../tile-image'

const props = defineProps<{
  docPath: (slug: string) => string
  cellLabel: (en: string, zh: string) => string
  localeKey: 'en' | 'zh'
  version: string
}>()

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

onMounted(() => {
  void import('../GalleryAmicroSpecimen.vue').then(({ default: component }) => {
    galleryAmicroSpecimen.value = component
  })
})

const text = computed(() => galleryText[props.localeKey])

const copy = computed(() => (props.localeKey === 'zh'
  ? {
      searchPlugins: '搜索插件…',
      syncing: '同步中',
      dividerSection: '分组',
      newPlugin: '新建插件',
      importWorkflow: '导入工作流',
      online: '在线',
      aboutTitle: 'Tuffex 是什么？',
      close: '关闭',
      aboutBody: '一套服务 Talex Touch 生态的 Vue 组件库。',
      installBody: 'pnpm add @talex-touch/tuffex',
      searching: '检索中',
      edit: '编辑',
      releaseNotes: '发布说明',
      virtualTitle: '插件目录',
      virtualCount: (rendered: number, total: string) => `DOM 中 ${rendered} / ${total} 行`,
      liquidToggle: '展开菜单',
      liquidItems: ['收藏', '夜间模式', '音乐'] as [string, string, string],
      syncStages: ['连接中', '已连接', '同步 12 个文件', '同步 148 个文件', '已是最新'],
      next: '下一步',
      hoverMe: '悬停',
      foldCardTitle: '折角预览',
      foldCardHint: '悬停或点击右下角掀开',
      foldUnderTitle: '底层已解锁',
    }
  : {
      searchPlugins: 'Search plugins...',
      syncing: 'Syncing',
      dividerSection: 'Section',
      newPlugin: 'New plugin',
      importWorkflow: 'Import workflow',
      online: 'Online',
      aboutTitle: 'What is Tuffex?',
      close: 'Close',
      aboutBody: 'A Vue component family powering the Talex Touch ecosystem.',
      installBody: 'pnpm add @talex-touch/tuffex',
      searching: 'Searching',
      edit: 'Edit',
      releaseNotes: 'Release notes',
      virtualTitle: 'Plugin registry',
      virtualCount: (rendered: number, total: string) => `${rendered} / ${total} rows in the DOM`,
      liquidToggle: 'Toggle menu',
      liquidItems: ['Favorite', 'Night mode', 'Music'] as [string, string, string],
      syncStages: ['Connecting', 'Connected', 'Syncing 12 files', 'Syncing 148 files', 'Up to date'],
      next: 'Next',
      hoverMe: 'hover me',
      foldCardTitle: 'Corner Peel',
      foldCardHint: 'Hover or click corner to peel',
      foldUnderTitle: 'Underlay unlocked',
    }))

const galleryTiles = [
  { id: 'a', url: tileImage('#1e3a8a', '#60a5fa', '#e0f2fe', 8), en: 'Dawn ridge', zh: '山脊晨光' },
  { id: 'b', url: tileImage('#064e3b', '#4ade80', '#fef9c3', 8), en: 'Pine valley', zh: '松谷' },
  { id: 'c', url: tileImage('#7c2d12', '#fbbf24', '#fff7ed', 8), en: 'Dune pass', zh: '沙丘垭口' },
]
const galleryItems = computed(() => galleryTiles.map(({ id, url, en, zh }) => ({ id, url, name: props.localeKey === 'zh' ? zh : en })))

// JSON is the editor's default language and the one it lints; six lines fit
// the stage at the editor's natural height, so nothing has to crop it.
const manifestSample = '{\n  "id": "com.talex.clipboard",\n  "version": "1.2.0",\n  "sdkapi": 260713,\n  "features": ["history", "pin"]\n}'
const terminalLines = computed(() => [
  '\x1B[32mTuffEx TxTerminal\x1B[0m',
  props.localeKey === 'zh' ? 'ANSI 颜色 · 中文日志 ✓' : 'ANSI colors · Unicode logs ✓',
  props.localeKey === 'zh' ? '只读显示，无进程' : 'Read-only display, no process',
])
// A ref, not a computed: the reader edits it in the dialog. Seeded in the
// page's language once; switching locale keeps whatever they wrote.
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
const autoSizerRef = ref<{ size?: { width?: number, height?: number } } | null>(null)
const autoSizerLabel = computed(() => {
  const size = autoSizerRef.value?.size
  if (!size?.width)
    return '—'
  return `${Math.round(size.width)} × ${Math.round(size.height ?? 0)}`
})
// Twice over, so the feed is tall enough to keep scrolling through the blur.
const blurFeed = computed(() => [...galleryItems.value, ...galleryItems.value])
const laneStates = computed<[string, string]>(() => [copy.value.online, copy.value.syncing])
const logoModes = computed(() => [
  { value: 'once' as const, label: 'once' },
  { value: 'breathe' as const, label: 'breathe' },
  { value: 'hover' as const, label: copy.value.hoverMe },
])
</script>

<template>
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
          <TxVersionCapsule :version="`v${version}`" channel="BETA" tone="preview" v-bind="text.versionCapsule" />
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('glow-text')">
        {{ cellLabel('GlowText', '扫光') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <!-- text-clip, not the default adaptive. adaptive is a container
               shimmer for images and cards: it blends with `screen`, which is
               lighten-only, so a white band over a light page changes nothing
               and the cell rendered as plain bold text. The component's own
               docs say to use text-clip for text. -->
          <div class="docs-gallery__stack docs-gallery__stack--center">
            <TxGlowText
              class="docs-gallery__glow"
              tag="span"
              mode="text-clip"
              :duration-ms="2600"
              :band-size="30"
              :opacity="1"
              color="var(--docs-accent)"
            >
              Tuffex
            </TxGlowText>
            <TxGlowText
              class="docs-gallery__glow-card"
              tag="div"
              :duration-ms="2600"
              :band-size="36"
              :opacity="0.6"
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
            <TxMetalFx preset="chromatic" theme="auto">
              <span style="display: inline-flex; align-items: center; height: 32px; padding: 0 14px; border-radius: 999px; font-size: 13px">{{ text.upgrade }}</span>
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
      <NuxtLink class="docs-gallery__label" :to="docPath('code-editor')">
        {{ cellLabel('CodeEditor', '代码编辑器') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 135px">
        <ClientOnly>
          <!-- Editable, at its natural height. The old 128px frame cropped the
               editor's 160px floor and took its bottom edge with it. -->
          <div class="docs-gallery__block docs-gallery__block--wide docs-gallery__editor">
            <TxCodeEditor :model-value="manifestSample" language="json" />
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
          <!-- The source here, the editor in a dialog: eleven actions and three
               modes took three toolbar rows at this width and left a 12px
               sliver of editor. The dialog is wide enough for one row. -->
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

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('corner-overlay')">
        {{ cellLabel('CornerOverlay', '角标叠层') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <!-- One per placement, each with a different kind of overlay. The
               badges sit in a page-coloured ring: they are translucent tints
               and read as smudges straight on a photo or an avatar. -->
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
          <!-- Glass needs something behind it to bend: over the flat cell the
               displacement had nothing to act on and the surface was invisible. -->
          <div class="docs-gallery__block docs-gallery__glass-stage">
            <div class="docs-gallery__glass-scene" aria-hidden="true">
              <span v-for="orb in 5" :key="orb" class="docs-gallery__glass-orb" />
            </div>
            <TxGlassSurface :width="200" :height="88" :border-radius="18" :background-opacity="0.06">
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
      <NuxtLink class="docs-gallery__label" :to="docPath('gradient-border')">
        {{ cellLabel('GradientBorder', '渐变描边') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <!-- A solid card inside, 2px in: its 14px radius is the ring's 16
               minus the gap, so the two curves stay concentric. -->
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
          <!-- A feed that keeps moving through the blur band. The blur only
               acts on what is behind it, and the old tiles sat in the top
               34px while the band covered the empty bottom 40%. -->
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
      <NuxtLink class="docs-gallery__label" :to="docPath('keyframe-stroke-text')">
        {{ cellLabel('KeyframeStrokeText', '描边文字') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <!-- Token colours: the defaults are a dark fill for a light page and
               left only a thin outline on the dark one. A phrase longer than
               any one glyph's outline, or the dash ends before the glyph does. -->
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
          <!-- The variants side by side, colour on the ring only. The old cell
               wrapped a bordered tile in the default ring: two grey lines that
               read as a doubled border. `ring-inset` is left out — it paints
               under the slot and an avatar covers it entirely. -->
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
          <!-- The glow's root is the card: its light paints over the card's
               background and under the text, rising from the bottom edge. -->
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
          <!-- Six items on a grid with a longer rise than the built-in 6px, so
               the cascade is visible; the reset button plays it again. -->
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
          <GalleryTextMorph :stages="copy.syncStages" :next-label="copy.next" />
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
          <!-- All three modes: at 72px one `once` run ended as a glowing dot,
               and nothing said the logo could breathe or wait for a hover. -->
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

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('auto-sizer')">
        {{ cellLabel('AutoSizer', '尺寸感知') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block docs-gallery__autosizer">
            <TxAutoSizer ref="autoSizerRef">
              <div class="docs-gallery__tile docs-gallery__overlay-body">
                {{ autoSizerLabel }}
              </div>
            </TxAutoSizer>
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
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxBaseSurface preset="card" background="refraction">
              <div class="docs-gallery__tile docs-gallery__overlay-body">
                {{ copy.aboutTitle }}
              </div>
            </TxBaseSurface>
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('floating')">
        {{ cellLabel('Floating', '浮动') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <TxFloating>
            <TxButton circle icon="i-carbon-add" />
          </TxFloating>
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
</template>
