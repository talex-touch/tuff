<script setup lang="ts">
import { useDebounceFn, useEventListener } from '@vueuse/core'
import { gsap } from 'gsap'
import { computed, nextTick, onMounted, watch } from 'vue'
import { hasDocument } from '@talex-touch/utils/env'
import { TxCommandPalette } from '@talex-touch/tuffex'
import { useGlobalSearch } from '~/composables/useGlobalSearch'

interface SearchCommandItem {
  id: string
  title: string
  description?: string
  keywords?: string[]
  icon?: string
  to: string
}

const { t } = useI18n()
const {
  open,
  query,
  results,
  loading,
  anchorRect,
  summonSearch,
  prefersReducedMotion,
  closeSearch,
  resetSearch,
  search,
  clearSearchAnchor,
} = useGlobalSearch()

const emptyText = computed(() => (loading.value ? t('search.loading') : t('search.empty')))
const searchTriggerSelector = '[data-role="global-search-trigger"]'
let panelTween: gsap.core.Tween | gsap.core.Timeline | null = null

const commands = computed<SearchCommandItem[]>(() => {
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

function onSelect(item: SearchCommandItem) {
  if (item.to)
    navigateTo(item.to)
}

function resolveSearchTrigger() {
  if (!hasDocument())
    return null
  return document.querySelector<HTMLElement>(searchTriggerSelector)
}

function clearPanelTween() {
  if (!panelTween)
    return
  panelTween.kill()
  panelTween = null
}

async function runFlipAnimation() {
  const anchor = anchorRect.value
  if (!anchor || prefersReducedMotion())
    return
  await nextTick()
  requestAnimationFrame(() => {
    const panel = document.querySelector<HTMLElement>('.tx-command-palette__panel')
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
  const panel = document.querySelector<HTMLElement>('.tx-command-palette__panel')
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

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement))
    return false
  if (target.isContentEditable)
    return true
  const tagName = target.tagName.toLowerCase()
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select'
}

onMounted(() => {
  useEventListener(window, 'keydown', (event: KeyboardEvent) => {
    if (event.defaultPrevented)
      return
    if (isEditableTarget(event.target))
      return
    const key = event.key.toLowerCase()
    if ((event.metaKey || event.ctrlKey) && key === 'k') {
      event.preventDefault()
      void summonSearch(resolveSearchTrigger())
      return
    }
    if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key === '/') {
      event.preventDefault()
      void summonSearch(resolveSearchTrigger())
      return
    }
    if (open.value && event.key === 'Escape') {
      event.preventDefault()
      closeSearch()
    }
  })
})

watch(open, (value) => {
  if (!value)
    resetSearch()
})
</script>

<template>
  <TxCommandPalette
    v-model="open"
    :commands="commands"
    :placeholder="t('search.placeholder')"
    :empty-text="emptyText"
    @open="runFlipAnimation"
    @close="runFlipCloseAnimation"
    @update:query="onQueryUpdate"
    @select="onSelect"
  />
</template>
