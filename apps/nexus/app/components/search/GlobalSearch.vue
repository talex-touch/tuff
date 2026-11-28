<script setup lang="ts">
import type { CommandPaletteItem } from '@talex-touch/tuffex/command-palette'
import { TxCommandPalette } from '@talex-touch/tuffex/command-palette'
import { hasWindow } from '@talex-touch/utils/env'
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useGlobalSearch } from '~/composables/useGlobalSearch'

type SearchCommandItem = CommandPaletteItem & {
  to?: string
}

const { t } = useI18n()
const router = useRouter()
const {
  open,
  query,
  results,
  loading,
  unavailable,
  closeSearch,
  resetSearch,
  cancelSearch,
  preloadSearch,
  search,
} = useGlobalSearch()

const emptyText = computed(() => {
  if (loading.value)
    return t('search.loading')
  return unavailable.value ? t('search.unavailable') : t('search.empty')
})

let scrollLockState: {
  htmlOverflow: string
  bodyPaddingRight: string
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
    const sourceLabel = result.source === 'tuffex'
      ? t('search.category.tuffex')
      : result.source === 'docs'
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
  return resultCommands.value.slice(0, 8)
})

function onQueryUpdate(value: string) {
  if (open.value)
    search(value)
}

function onPaletteModelUpdate(value: boolean) {
  if (!value)
    closeSearch()
}

function onSelect(item: CommandPaletteItem) {
  const target = (item as SearchCommandItem).to
  if (!target)
    return
  if (target === '/tuffex' || target.startsWith('/tuffex/')) {
    closeSearch()
    if (hasWindow())
      window.location.assign(target)
    return
  }
  navigateTo(target)
}

function lockPageScroll() {
  if (!import.meta.client || scrollLockState)
    return
  const root = document.documentElement
  const scrollbarWidth = window.innerWidth - root.clientWidth
  scrollLockState = {
    htmlOverflow: root.style.overflow,
    bodyPaddingRight: document.body.style.paddingRight,
  }
  root.style.overflow = 'hidden'
  if (scrollbarWidth > 0)
    document.body.style.paddingRight = `${scrollbarWidth}px`
}

function unlockPageScroll() {
  if (!import.meta.client || !scrollLockState)
    return
  document.documentElement.style.overflow = scrollLockState.htmlOverflow
  document.body.style.paddingRight = scrollLockState.bodyPaddingRight
  scrollLockState = null
}

watch(
  open,
  (isOpen) => {
    if (isOpen) {
      lockPageScroll()
      preloadSearch()
    }
    else {
      unlockPageScroll()
      cancelSearch()
      resetSearch()
    }
  },
  { immediate: true },
)

const removeNavigationGuard = router.beforeEach(() => {
  if (open.value)
    closeSearch()
})

if (!open.value) {
  onMounted(() => {
    if (hasWindow() && 'requestIdleCallback' in window) {
      window.requestIdleCallback(() => {
        preloadSearch()
      }, { timeout: 4000 })
    }
    else {
      setTimeout(() => {
        preloadSearch()
      }, 3000)
    }
  })
}

onBeforeUnmount(() => {
  removeNavigationGuard()
  cancelSearch()
  unlockPageScroll()
})
</script>

<template>
  <TxCommandPalette
    :model-value="open"
    :query="query"
    :commands="commands"
    :placeholder="t('search.placeholder')"
    :empty-text="emptyText"
    overlay-class="NexusGlobalSearchOverlay"
    panel-class="NexusGlobalSearchPanel"
    :max-height="360"
    @update:model-value="onPaletteModelUpdate"
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
  overscroll-behavior: contain;
}

:global(.NexusGlobalSearchPanel .tx-command-palette__desc) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.NexusGlobalSearchEmpty {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.NexusGlobalSearchEmpty span:first-child {
  font-size: 16px;
}

.NexusGlobalSearchFooter {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 14px 10px;
  border-top: 1px solid color-mix(in srgb, var(--tx-border-color-lighter, #ebeef5) 75%, transparent);
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.NexusGlobalSearchShortcuts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
}

.NexusGlobalSearchShortcut {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.NexusGlobalSearchShortcut kbd {
  min-width: 20px;
  padding: 1px 6px;
  border: 1px solid color-mix(in srgb, var(--tx-border-color, #d4d7de) 78%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--tx-fill-color-light, #f5f7fa) 84%, transparent);
  color: var(--tx-text-color-primary, #303133);
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 600;
  line-height: 1.45;
  text-align: center;
}

.NexusGlobalSearchPowered {
  flex: 0 0 auto;
  white-space: nowrap;
  font-weight: 500;
}

:global(.dark .NexusGlobalSearchFooter) {
  border-top-color: rgba(255, 255, 255, 0.1);
}

:global(.dark .NexusGlobalSearchShortcut kbd) {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.82);
}

@media (max-width: 640px) {
  .NexusGlobalSearchFooter {
    align-items: flex-start;
    flex-direction: column;
  }

  .NexusGlobalSearchPowered {
    white-space: normal;
  }
}
</style>
