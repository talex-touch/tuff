<script setup lang="ts">
import { TuffItem, TuffRender } from '@talex-touch/utils'
import { computed } from 'vue'

interface Props {
  item: TuffItem
  active: boolean
  render: TuffRender
}

const props = defineProps<Props>()

const displayIcon = computed(() => {
  const icon = props.render?.basic?.icon
  if (typeof icon === 'string') {
    return icon
  }
  if (icon && typeof icon === 'object' && 'value' in icon) {
    return icon.value
  }
  return 'default-icon' // or some other default
})

type Range = { start: number; end: number }

function getHighlightedHTML(
  text: string,
  matchedIndices?: Range[],
  opts: {
    className?: string
    base?: 0 | 1 // 起始基：0 基或 1 基，默认 1 基（符合你现在的理解）
    inclusiveEnd?: boolean // 右端是否包含，默认包含
  } = {}
): string {
  if (!matchedIndices?.length) return text

  console.log('matchedIndices', matchedIndices, text)
  const { className = 'font-semibold text-red', base = 1, inclusiveEnd = true } = opts

  // 只取最后一个
  let { start, end } = matchedIndices[matchedIndices.length - 1]

  // 统一换成 0 基坐标
  let s0 = base === 1 ? start - 1 : start
  let e0 = base === 1 ? end - 1 : end

  // 右闭 -> 右开（slice 用）
  let eExclusive = inclusiveEnd ? e0 + 1 : e0

  // 边界裁剪
  const n = text.length
  s0 = Math.max(0, Math.min(s0, n))
  eExclusive = Math.max(s0, Math.min(eExclusive, n))

  if (s0 >= eExclusive) return text

  return (
    text.slice(0, s0) +
    `<span class="${className}">` +
    text.slice(s0, eExclusive) +
    `</span>` +
    text.slice(eExclusive)
  )
}
</script>

<template>
  <div
    class="BoxItem group flex items-center gap-2 mx-2 my-1 p-1.5 w-[calc(100%-1rem)] h-44px box-border cursor-pointer overflow-hidden relative rounded-lg transition-colors duration-100"
    :class="{ 'is-active': active, 'bg-[var(--el-bg-color)]': active }"
  >
    <div class="relative w-32px h-32px">
      <PluginIcon
        :icon="displayIcon"
        :alt="render.basic?.title || 'Tuff Item'"
        class="w-full h-full"
      />
      <span
        v-if="props.item.scoring?.frequency"
        class="absolute right-0 bottom-0 flex items-center justify-center w-12px h-12px text-10px leading-12px rounded-full bg-[var(--el-color-primary)] text-white"
        v-text="Math.round((props.item.scoring.frequency || 0) * 10)"
      />
    </div>

    <div class="flex-1 overflow-hidden">
      <h5
        class="text-sm font-semibold truncate"
        v-html="
          getHighlightedHTML(render.basic?.title || '', props.item.meta?.extension?.matchResult)
        "
      />
      <p
        class="text-xs opacity-60 truncate max-w-[90%]"
        v-html="
          getHighlightedHTML(
            render.basic?.subtitle || '',
            props.item.meta?.extension?.descMatchResult
          )
        "
      />
    </div>

    <span class="ml-auto text-10px text-slate-400 dark:text-slate-500 uppercase font-semibold">
      {{ props.item.source.type }}
    </span>

    <div
      class="absolute left-0 top-[25%] h-[50%] w-1 rounded-3xl bg-[var(--el-color-primary)] shadow-[0_0_2px_0_var(--el-color-primary)] transition-opacity duration-200 opacity-0 group-[.is-active]:opacity-100"
    />
  </div>
</template>
