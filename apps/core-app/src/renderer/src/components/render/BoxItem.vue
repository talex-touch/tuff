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

function getHighlightedHTML(text: string, matchedIndices?: [number, number]): string {
  if (!matchedIndices || matchedIndices.length !== 2) return text

  const [start, end] = matchedIndices
  let result = ''
  for (let i = 0; i < text.length; i++) {
    if (i >= start && i <= end) {
      result += `<span class="font-semibold text-primary">${text[i]}</span>`
    } else {
      result += text[i]
    }
  }
  return result
}
</script>

<template>
  <div
    class="BoxItem group flex items-center gap-2 m-1 p-1.5 pr-3 w-[calc(100%-0.5rem)] h-44px box-border cursor-pointer overflow-hidden relative rounded-lg transition-colors duration-100 hover:bg-slate-500/5 dark:hover:bg-slate-400/5"
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
        class="absolute right-0 bottom-0 flex items-center justify-center w-12px h-12px text-10px leading-12px rounded-full bg-primary text-white"
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
