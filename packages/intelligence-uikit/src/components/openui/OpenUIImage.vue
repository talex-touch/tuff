<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue'
import { OPENUI_CONTEXT } from './context'

const props = defineProps<{ src?: string, alt?: string, query?: string, search?: boolean, aspectRatio?: number, radius?: string | number, fit?: string }>()
const ctx = inject(OPENUI_CONTEXT)!
const resolved = ref<string | null>(null)
const failed = ref(false)
const pending = ref(false)
const safeSource = computed(() => {
  const url = props.search ? resolved.value : props.src
  return typeof url === 'string' && /^https?:\/\//i.test(url) && !failed.value ? url : undefined
})
watch(() => [props.query, props.src, ctx.streaming.value] as const, async (_, __, onCleanup) => {
  let active = true
  onCleanup(() => { active = false })
  failed.value = false
  resolved.value = null
  pending.value = false
  if (!props.search || !props.query || ctx.streaming.value) return
  pending.value = true
  try {
    const source = await ctx.resolveImage?.(props.query)
    if (active) resolved.value = source ?? null
  }
  catch { if (active) failed.value = true }
  finally { if (active) pending.value = false }
}, { immediate: true })
</script>

<template>
  <figure class="tx-ai-openui__image" :aria-busy="pending" :style="{ aspectRatio: Math.min(5, Math.max(0.2, aspectRatio ?? 1.5)), borderRadius: typeof radius === 'number' ? `${radius}px` : ({ sm: '4px', md: '8px', lg: '12px', xl: '20px', full: '999px' } as Record<string, string>)[radius ?? 'lg'] }">
    <img v-if="safeSource" :src="safeSource" :alt="alt ?? query ?? ''" loading="lazy" referrerpolicy="no-referrer" :style="{ objectFit: fit === 'contain' ? 'contain' : 'cover' }" @error="failed = true">
    <span v-else class="tx-ai-openui__image-caption" role="img" :aria-label="alt ?? query ?? ctx.labels.value.imageUnavailable ?? 'Image unavailable'">{{ pending ? (ctx.labels.value.imageLoading ?? 'Loading image…') : (alt ?? query ?? ctx.labels.value.imageUnavailable ?? 'Image unavailable') }}</span>
  </figure>
</template>
