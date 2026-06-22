<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import { gsap } from 'gsap'
import { computed, nextTick, onBeforeUnmount, watch } from 'vue'
import { TxCommandPalette } from '@talex-touch/tuffex/command-palette'
import type { CommandPaletteItem } from '@talex-touch/tuffex/command-palette'
import { useGlobalSearch } from '~/composables/useGlobalSearch'

type SearchCommandItem = CommandPaletteItem & {
  to?: string
}

const { t } = useI18n()
const {
  open,
  query,
  results,
  loading,
  anchorRect,
  prefersReducedMotion,
  closeSearch,
  resetSearch,
  search,
  clearSearchAnchor,
} = useGlobalSearch()

const emptyText = computed(() => (loading.value ? t('search.loading') : t('search.empty')))
let panelTween: gsap.core.Tween | gsap.core.Timeline | null = null
let scrollLockState: {
  bodyOverflow: string
  bodyPosition: string
  bodyTop: string
  bodyWidth: string
  htmlOverflow: string
  scrollY: number
} | null = null

const hotspotCommands = computed<SearchCommandItem[]>(() => [
  {
    id: 'hotspot-start-guide',
    title: t('search.hotspots.startGuide.title'),
    description: t('search.hotspots.startGuide.description'),
    icon: 'i-carbon-rocket',
    keywords: ['guide', 'start', 'tutorial', '入门', '教程'],
    to: '/docs/guide/start',
  },
  {
    id: 'hotspot-developer-docs',
    title: t('search.hotspots.developerDocs.title'),
    description: t('search.hotspots.developerDocs.description'),
    icon: 'i-carbon-document',
    keywords: ['docs', 'developer', 'sdk', '文档', '开发'],
    to: '/docs',
  },
  {
    id: 'hotspot-plugin-store',
    title: t('search.hotspots.pluginStore.title'),
    description: t('search.hotspots.pluginStore.description'),
    icon: 'i-carbon-store',
    keywords: ['store', 'plugin', '插件', '商店'],
    to: '/store',
  },
  {
    id: 'hotspot-updates',
    title: t('search.hotspots.updates.title'),
    description: t('search.hotspots.updates.description'),
    icon: 'i-carbon-download',
    keywords: ['updates', 'download', 'release', '更新', '下载'],
    to: '/updates',
  },
])

const resultCommands = computed<SearchCommandItem[]>(() => {
  const queryKeyword = query.value.trim()
  return results.value.map((result) => {
    const sourceLabel = result.source === 'docs'
      ? t('search.category.docs')
      : result.source === 'page'
        ? t('search.category.pages')
        : t('search.category.features')
    const description = result.description
      ? `${sourceLabel} · ${result.description}`
      : sourceLabel
    return {
      id: result.id,
      title: result.title,
      description,
      icon: result.icon,
      keywords: [queryKeyword, ...(result.keywords ?? [])].filter(Boolean),
      to: result.to,
    }
  })
})

const commands = computed<SearchCommandItem[]>(() => {
  if (!query.value.trim())
    return hotspotCommands.value
  return resultCommands.value.slice(0, 4)
})

const runSearch = useDebounceFn((value: string) => {
  void search(value)
}, 200)

function onQueryUpdate(value: string) {
  query.value = value
  if (!value.trim()) {
    resetSearch()
    return
  }
  loading.value = true
  runSearch(value)
}

function onSelect(item: CommandPaletteItem) {
  const target = (item as SearchCommandItem).to
  if (target)
    navigateTo(target)
}

function clearPanelTween() {
  if (!panelTween)
    return
  panelTween.kill()
  panelTween = null
}

function getPanelElement() {
  return document.querySelector<HTMLElement>('.NexusGlobalSearchPanel')
}

function lockPageScroll() {
  if (!import.meta.client || scrollLockState)
    return
  const scrollY = window.scrollY || document.documentElement.scrollTop || 0
  scrollLockState = {
    bodyOverflow: document.body.style.overflow,
    bodyPosition: document.body.style.position,
    bodyTop: document.body.style.top,
    bodyWidth: document.body.style.width,
    htmlOverflow: document.documentElement.style.overflow,
    scrollY,
  }
  document.body.style.overflow = 'hidden'
  document.body.style.position = 'fixed'
  document.body.style.top = `-${scrollY}px`
  document.body.style.width = '100%'
  document.documentElement.style.overflow = 'hidden'
}

function unlockPageScroll() {
  if (!import.meta.client || !scrollLockState)
    return
  document.body.style.overflow = scrollLockState.bodyOverflow
  document.body.style.position = scrollLockState.bodyPosition
  document.body.style.top = scrollLockState.bodyTop
  document.body.style.width = scrollLockState.bodyWidth
  document.documentElement.style.overflow = scrollLockState.htmlOverflow
  window.scrollTo(0, scrollLockState.scrollY)
  scrollLockState = null
}

async function runFlipAnimation() {
  const anchor = anchorRect.value
  if (!anchor || prefersReducedMotion())
    return
  await nextTick()
  requestAnimationFrame(() => {
    const panel = getPanelElement()
    if (!panel)
      return
    const panelRect = panel.getBoundingClientRect()
    if (!panelRect.width || !panelRect.height)
      return
    const scaleX = anchor.width / panelRect.width
    const scaleY = anchor.height / panelRect.height
    if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0)
      return
    const anchorCenterX = anchor.left + anchor.width / 2
    const anchorCenterY = anchor.top + anchor.height / 2
    const panelCenterX = panelRect.left + panelRect.width / 2
    const panelCenterY = panelRect.top + panelRect.height / 2
    const translateX = anchorCenterX - panelCenterX
    const translateY = anchorCenterY - panelCenterY
    const panelRadius = getComputedStyle(panel).borderRadius
    clearPanelTween()
    gsap.set(panel, {
      x: translateX,
      y: translateY,
      scaleX,
      scaleY,
      borderRadius: anchor.radius,
      opacity: 0.94,
      transformOrigin: 'center center',
      willChange: 'transform,border-radius,opacity',
    })
    panelTween = gsap.timeline({
      defaults: {
        duration: 0.34,
        ease: 'expo.inOut',
      },
      onComplete: () => {
        gsap.set(panel, { clearProps: 'willChange' })
        panelTween = null
      },
    })
    const content = panel.querySelectorAll<HTMLElement>('.tx-command-palette__item, .NexusGlobalSearchFooter')
    panelTween
      .to(panel, {
        x: 0,
        y: 0,
        scaleX: 1.015,
        scaleY: 1.015,
        borderRadius: panelRadius,
        opacity: 1,
      })
      .to(panel, {
        scaleX: 1,
        scaleY: 1,
        duration: 0.12,
        ease: 'back.out(1.2)',
      }, '-=0.04')
      .fromTo(content, {
        y: 8,
        opacity: 0,
      }, {
        y: 0,
        opacity: 1,
        duration: 0.18,
        stagger: 0.025,
        ease: 'power2.out',
      }, '-=0.08')
  })
}

function runFlipCloseAnimation() {
  const anchor = anchorRect.value
  if (!anchor) {
    clearSearchAnchor()
    return
  }
  if (prefersReducedMotion()) {
    clearSearchAnchor()
    return
  }
  const panel = getPanelElement()
  if (!panel) {
    clearSearchAnchor()
    return
  }
  const panelRect = panel.getBoundingClientRect()
  if (!panelRect.width || !panelRect.height) {
    clearSearchAnchor()
    return
  }
  const scaleX = anchor.width / panelRect.width
  const scaleY = anchor.height / panelRect.height
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) {
    clearSearchAnchor()
    return
  }
  const anchorCenterX = anchor.left + anchor.width / 2
  const anchorCenterY = anchor.top + anchor.height / 2
  const panelCenterX = panelRect.left + panelRect.width / 2
  const panelCenterY = panelRect.top + panelRect.height / 2
  const translateX = anchorCenterX - panelCenterX
  const translateY = anchorCenterY - panelCenterY
  const panelRadius = getComputedStyle(panel).borderRadius
  clearPanelTween()
  gsap.set(panel, {
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    borderRadius: panelRadius,
    opacity: 1,
    transformOrigin: 'center center',
    willChange: 'transform,border-radius,opacity',
  })
  panelTween = gsap.to(panel, {
    x: translateX,
    y: translateY,
    scaleX,
    scaleY,
    borderRadius: anchor.radius,
    opacity: 0.92,
    duration: 0.28,
    ease: 'expo.inOut',
    onComplete: () => {
      gsap.set(panel, { clearProps: 'willChange' })
      panelTween = null
      clearSearchAnchor()
    },
  })
}

watch(open, (value) => {
  if (value) {
    lockPageScroll()
    return
  }
  unlockPageScroll()
  if (!value)
    resetSearch()
})

onBeforeUnmount(() => {
  unlockPageScroll()
})
</script>

<template>
  <TxCommandPalette
    v-model="open"
    :commands="commands"
    :placeholder="t('search.placeholder')"
    :empty-text="emptyText"
    overlay-class="NexusGlobalSearchOverlay"
    panel-class="NexusGlobalSearchPanel"
    :max-height="195"
    @open="runFlipAnimation"
    @close="runFlipCloseAnimation"
    @update:query="onQueryUpdate"
    @select="onSelect"
  >
    <template #empty="{ emptyText: slotEmptyText }">
      <div class="NexusGlobalSearchEmpty">
        <span class="i-carbon-search-locate" aria-hidden="true" />
        <span>{{ slotEmptyText }}</span>
      </div>
    </template>

    <template #footer>
      <div class="NexusGlobalSearchFooter">
        <div
          class="NexusGlobalSearchShortcuts"
          :aria-label="t('search.shortcuts.label')"
        >
          <span class="NexusGlobalSearchShortcut">
            <kbd>⌘/Ctrl K</kbd>
            <span>{{ t('search.shortcuts.open') }}</span>
          </span>
          <span class="NexusGlobalSearchShortcut">
            <kbd>/</kbd>
            <span>{{ t('search.shortcuts.quickOpen') }}</span>
          </span>
          <span class="NexusGlobalSearchShortcut">
            <kbd>Esc</kbd>
            <span>{{ t('search.shortcuts.close') }}</span>
          </span>
        </div>
        <div class="NexusGlobalSearchPowered">
          {{ t('search.poweredBy') }}
        </div>
      </div>
    </template>
  </TxCommandPalette>
</template>

<style scoped lang="scss">
:global(.NexusGlobalSearchOverlay.tx-command-palette__overlay) {
  padding: clamp(24px, 7vh, 42px) 16px 16px;
  background:
    linear-gradient(180deg, rgba(4, 7, 13, 0.46), rgba(4, 7, 13, 0.62)),
    rgba(4, 7, 13, 0.26);
  overscroll-behavior: contain;
  touch-action: none;
}

:global(.NexusGlobalSearchPanel.tx-command-palette__panel) {
  width: min(593px, calc(100vw - 32px));
  background: color-mix(in srgb, var(--tx-bg-color, #fff) 92%, rgba(12, 14, 18, 0.08));
  border-color: color-mix(in srgb, var(--tx-border-color, #d4d7de) 62%, transparent);
  border-radius: 21px;
  box-shadow:
    0 18px 55px rgba(0, 0, 0, 0.24),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

:global(.NexusGlobalSearchPanel .tx-command-palette__search) {
  min-height: 52px;
  padding: 0 18px;
}

:global(.NexusGlobalSearchPanel .tx-command-palette__search-icon) {
  color: var(--tx-text-color-secondary, #8b8f98);
}

:global(.NexusGlobalSearchPanel .tx-command-palette__input) {
  font-size: 18px;
  font-weight: 500;
}

:global(.NexusGlobalSearchPanel .tx-command-palette__list) {
  min-height: 99px;
  padding: 10px;
  gap: 5px;
}

:global(.NexusGlobalSearchPanel .tx-command-palette__item) {
  min-height: 44px;
  border-radius: 12px;
  padding: 7px 10px;
  gap: 10px;
}

:global(.NexusGlobalSearchPanel .tx-command-palette__icon) {
  width: 21px;
  flex: 0 0 21px;
}

:global(.NexusGlobalSearchPanel .tx-command-palette__icon .tuff-icon),
:global(.NexusGlobalSearchPanel .tx-command-palette__search-icon .tuff-icon) {
  font-size: 21px !important;
}

:global(.NexusGlobalSearchPanel .tx-command-palette__title) {
  font-size: 16px;
  line-height: 1.25;
}

:global(.NexusGlobalSearchPanel .tx-command-palette__desc) {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.NexusGlobalSearchEmpty {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 13px;
}

.NexusGlobalSearchEmpty span:first-child {
  font-size: 23px;
}

:global(.NexusGlobalSearchPanel .tx-command-palette__empty) {
  min-height: 75px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
}

.NexusGlobalSearchFooter {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 13px 10px;
  border-top: 1px solid color-mix(in srgb, var(--tx-border-color-lighter, #ebeef5) 72%, transparent);
  color: var(--tx-text-color-secondary, #909399);
  font-size: 13px;
}

.NexusGlobalSearchShortcuts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 16px;
  max-width: 390px;
}

.NexusGlobalSearchShortcut {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.NexusGlobalSearchShortcut kbd {
  min-width: 23px;
  padding: 1px 7px;
  border: 1px solid color-mix(in srgb, var(--tx-border-color, #d4d7de) 78%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, var(--tx-fill-color-light, #f5f7fa) 84%, transparent);
  color: var(--tx-text-color-primary, #303133);
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.45;
  text-align: center;
}

.NexusGlobalSearchPowered {
  flex: 0 0 auto;
  white-space: nowrap;
  font-weight: 500;
}

:global(.dark .NexusGlobalSearchPanel.tx-command-palette__panel) {
  background: rgba(18, 18, 20, 0.96);
  border-color: rgba(255, 255, 255, 0.12);
  box-shadow:
    0 28px 90px rgba(0, 0, 0, 0.48),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

:global(.dark .NexusGlobalSearchPanel .tx-command-palette__search) {
  border-bottom-color: rgba(255, 255, 255, 0.13);
}

:global(.dark .NexusGlobalSearchPanel .tx-command-palette__list) {
  background: rgba(14, 14, 16, 0.78);
}

:global(.dark .NexusGlobalSearchPanel .tx-command-palette__item.is-active) {
  background: rgba(255, 255, 255, 0.08);
}

:global(.dark .NexusGlobalSearchPanel .tx-command-palette__shortcut) {
  border-color: rgba(255, 255, 255, 0.14);
}

:global(.dark .NexusGlobalSearchFooter) {
  border-top-color: rgba(255, 255, 255, 0.1);
}

:global(.dark .NexusGlobalSearchShortcut kbd) {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.82);
}

@media (max-width: 640px) {
  :global(.NexusGlobalSearchOverlay.tx-command-palette__overlay) {
    padding: 20px 10px 12px;
  }

  :global(.NexusGlobalSearchPanel.tx-command-palette__panel) {
    width: calc(100vw - 20px);
    border-radius: 14px;
  }

  :global(.NexusGlobalSearchPanel .tx-command-palette__search) {
    min-height: 40px;
    padding: 0 12px;
  }

  :global(.NexusGlobalSearchPanel .tx-command-palette__input) {
    font-size: 14px;
  }

  .NexusGlobalSearchFooter {
    align-items: flex-start;
    flex-direction: column;
  }

  .NexusGlobalSearchPowered {
    white-space: normal;
  }
}
</style>
