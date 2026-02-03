<script setup lang="ts">
import type { SharedPluginMetaItem } from '../plugin-detail'
import { computed } from 'vue'

interface Props {
  items?: SharedPluginMetaItem[]
  title?: string
}

const props = withDefaults(defineProps<Props>(), {
  title: ''
})

const hasItems = computed(() => (props.items?.length ?? 0) > 0)
</script>

<template>
  <section v-if="hasItems" class="space-y-3">
    <h3 v-if="title" class="text-sm font-semibold uppercase tracking-wide text-black/70">
      {{ title }}
    </h3>
    <div class="flex flex-col gap-3">
      <div
        v-for="item in items"
        :key="item.label"
        class="rounded-xl border border-black/5 bg-white/80 p-3 text-sm text-black/70"
        :class="item.highlight ? `highlight-${item.highlight}` : ''"
      >
        <div class="flex items-center gap-2 text-xs uppercase tracking-wide text-black/50">
          <i v-if="item.icon" :class="item.icon" />
          <span>{{ item.label }}</span>
        </div>
        <div class="mt-1 text-sm font-semibold text-black">
          {{ item.value }}
        </div>
      </div>
    </div>
  </section>
</template>
