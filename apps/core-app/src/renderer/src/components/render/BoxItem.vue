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

function getHighlightedHTML(
  text: string,
  matchedIndices?: Range[],
  opts: {
    className?: string
    base?: 0 | 1 // 起始基：0 基或 1 基，默认 0 基
    inclusiveEnd?: boolean // 右端是否包含，默认不包含 (右开)
  } = {}
): string {
  if (!matchedIndices?.length) return text

  const { className = 'font-semibold text-red', base = 0, inclusiveEnd = false } = opts

  const { start, end } = matchedIndices[matchedIndices.length - 1]

  let s0 = base === 1 ? start - 1 : start
  const e0 = base === 1 ? end - 1 : end

  let eExclusive = inclusiveEnd ? e0 + 1 : e0

  const n = text.length
  s0 = Math.max(0, Math.min(s0, n))
  eExclusive = Math.max(s0, Math.min(eExclusive, n))

  if (s0 >= eExclusive) return text

  return `${text.slice(0, s0)}<span class="${className}">${text.slice(
    s0,
    eExclusive
  )}</span>${text.slice(eExclusive)}`
}

const sourceMeta = computed(() => resolveSourceMeta(props.item, t))
const recommendation = computed(() => (props.item.meta as any)?.recommendation)

console.log(props)
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
      <h5
        class="text-sm font-semibold truncate"
        v-html="
          getHighlightedHTML(render.basic?.title || '', props.item.meta?.extension?.matchResult)
        "
      />
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
