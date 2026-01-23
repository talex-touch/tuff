<script setup lang="ts">
import type { ITuffIcon, TuffItem, TuffRender } from '@talex-touch/utils'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import DefaultIcon from '~/assets/svg/EmptyAppPlaceholder.svg'
import TuffIcon from '~/components/base/TuffIcon.vue'
import { getOpenerByExtension, useOpenerAutoResolve } from '~/modules/openers'
import ItemSubtitle from './ItemSubtitle.vue'
import { resolveSourceMeta } from './sourceMeta'

interface Props {
  item: TuffItem
  active: boolean
  render: TuffRender
  quickKey?: string
}

const props = defineProps<Props>()

const { t } = useI18n()

const displayIcon = computed(() => {
  const icon = props.render?.basic?.icon
  const defaultIcon = {
    type: 'url',
    value: '',
    status: 'normal'
  } as ITuffIcon

  if (typeof icon === 'string') {
    defaultIcon.value = icon
  }

  if (icon && typeof icon === 'object' && 'value' in icon) {
    if (icon.value?.length) {
      defaultIcon.value = icon.value
    }
  }

  return defaultIcon
})

const fileExtension = computed(() => {
  if (props.item.kind !== 'file') return null
  const metaExt = props.item.meta?.file?.extension
  if (metaExt) return metaExt
  const pathValue = props.item.meta?.file?.path || props.render.basic?.subtitle || ''
  const match = /\.([^.\\/]+)$/.exec(pathValue)
  return match ? match[1].toLowerCase() : null
})

useOpenerAutoResolve(fileExtension)

const opener = computed(() => getOpenerByExtension(fileExtension.value))
const openerLogo = computed(() => opener.value?.logo || '')
const openerName = computed(() => opener.value?.name || '')
const showOpenerLogo = computed(() => props.item.kind === 'file' && !!openerLogo.value)

const clickCount = computed(() => props.item.meta?.usageStats?.executeCount ?? 0)
const showFrequency = computed(() => clickCount.value > 0)
const frequencyLabel = computed(() => clickCount.value.toString())

const quickKeyLabel = computed(() => props.quickKey || '')
const showQuickKey = computed(() => quickKeyLabel.value.length > 0)

interface Range {
  start: number
  end: number
}

/**
 * Generate highlighted HTML from text and match ranges
 * Supports multiple non-overlapping ranges for proper fuzzy match highlighting
 */
function getHighlightedHTML(
  text: string,
  matchedIndices?: Range[],
  opts: {
    className?: string
    base?: 0 | 1
    inclusiveEnd?: boolean
  } = {}
): string {
  if (!matchedIndices?.length) return text

  const { className = 'font-semibold text-red', base = 0, inclusiveEnd = false } = opts
  const n = text.length

  // Normalize and sort ranges
  const normalizedRanges = matchedIndices
    .map((range) => {
      let s = base === 1 ? range.start - 1 : range.start
      let e = base === 1 ? range.end - 1 : range.end
      if (inclusiveEnd) e += 1
      s = Math.max(0, Math.min(s, n))
      e = Math.max(s, Math.min(e, n))
      return { start: s, end: e }
    })
    .filter((r) => r.start < r.end)
    .sort((a, b) => a.start - b.start)

  if (normalizedRanges.length === 0) return text

  // Merge overlapping ranges
  const mergedRanges: Range[] = []
  let current = { ...normalizedRanges[0] }

  for (let i = 1; i < normalizedRanges.length; i++) {
    const next = normalizedRanges[i]
    if (next.start <= current.end) {
      current.end = Math.max(current.end, next.end)
    } else {
      mergedRanges.push(current)
      current = { ...next }
    }
  }
  mergedRanges.push(current)

  // Build HTML with all highlighted ranges
  let result = ''
  let lastEnd = 0

  for (const range of mergedRanges) {
    if (range.start > lastEnd) {
      result += escapeHtml(text.slice(lastEnd, range.start))
    }
    result += `<span class="${className}">${escapeHtml(text.slice(range.start, range.end))}</span>`
    lastEnd = range.end
  }

  if (lastEnd < n) {
    result += escapeHtml(text.slice(lastEnd))
  }

  return result
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const sourceMeta = computed(() => resolveSourceMeta(props.item, t))
const recommendation = computed(() => props.item.meta?.recommendation)
</script>

<template>
  <div
    class="BoxItem hover:bg-[var(--el-fill-color-lighter)] group flex items-center gap-2 mx-2 my-1 p-1.5 w-[calc(100%-1rem)] h-44px box-border cursor-pointer overflow-hidden relative rounded-lg transition-colors duration-100"
    :class="{
      'is-active': active,
      '!bg-[var(--el-bg-color)]': active,
      recommendation
    }"
  >
    <div class="relative w-32px h-32px">
      <TuffIcon
        :empty="DefaultIcon"
        :icon="displayIcon"
        :alt="render.basic?.title || 'Tuff Item'"
        :size="32"
        :colorful="render?.basic?.icon?.colorful ?? true"
        style="--icon-color: var(--el-text-color-primary)"
      />
      <span
        v-if="showFrequency"
        class="absolute -top-1 -right-1 flex items-center justify-center min-w-[14px] h-[14px] px-1 text-[10px] leading-none rounded-full bg-[var(--el-color-primary)] text-white shadow-sm"
      >
        {{ frequencyLabel }}
      </span>
      <div
        v-if="showOpenerLogo"
        class="absolute right-0 bottom-0 flex items-center justify-center w-[14px] h-[14px] rounded-md border border-[var(--el-border-color)] bg-[var(--el-bg-color)]/90 shadow-sm overflow-hidden"
        :title="openerName"
      >
        <img
          :src="openerLogo"
          :alt="openerName || 'Opener'"
          class="w-[10px] h-[10px] object-contain"
        />
      </div>
    </div>

    <div class="flex-1 overflow-hidden">
      <!-- eslint-disable vue/no-v-html -->
      <h5
        class="text-sm font-semibold truncate"
        v-html="
          getHighlightedHTML(render.basic?.title || '', props.item.meta?.extension?.matchResult)
        "
      />
      <!-- eslint-enable vue/no-v-html -->
      <ItemSubtitle :item="item" :render="render" />
    </div>

    <div class="ml-auto flex items-center gap-2">
      <span
        v-if="sourceMeta"
        class="SourceBadge text-10px text-slate-400 dark:text-slate-500 uppercase font-semibold"
      >
        <i :class="sourceMeta.icon" class="text-[var(--el-text-color-secondary)]" />
        <span>{{ sourceMeta.label }}</span>
      </span>
      <span v-if="showQuickKey" class="QuickKeyPill">{{ quickKeyLabel }}</span>
    </div>

    <div
      class="absolute left-0 top-[25%] h-[50%] w-1 rounded-3xl bg-[var(--el-color-primary)] shadow-[0_0_2px_0_var(--el-color-primary)] transition-opacity duration-200 opacity-0 group-[.is-active]:opacity-100"
    />
  </div>
</template>

<style scoped lang="scss">
.QuickKeyPill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  min-width: 22px;
  height: 16px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 600;
  background: var(--el-fill-color-dark);
  color: var(--el-text-color-primary);
}

.SourceBadge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  letter-spacing: 0.4px;
}

// .BoxItem.recommendation {
// }
</style>
