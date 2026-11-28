<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue'
import { OPENUI_CONTEXT } from './context'

const props = defineProps<{ src?: string, alt?: string, query?: string, search?: boolean, aspectRatio?: number, radius?: string | number, fit?: string }>()
const ctx = inject(OPENUI_CONTEXT)!
const resolved = ref<string | null>(null)
const failed = ref(false)
const pending = ref(false)
const approvedOnce = ref(false)

const radiusTokens: Record<string, string> = {
  sm: 'var(--openui-radius-sm)',
  md: 'var(--openui-radius-md)',
  lg: 'var(--openui-radius-lg)',
  xl: 'var(--openui-radius-xl)',
  full: 'var(--openui-radius-full)',
}

const SAFE_RADIUS_RE = /^(?:0|\d+(?:\.\d+)?(?:px|%|em|rem))$/i

const resolvedRadius = computed(() => {
  if (typeof props.radius === 'number' && Number.isFinite(props.radius))
    return `${props.radius}px`
  if (typeof props.radius === 'string') {
    const trimmed = props.radius.trim()
    if (Object.hasOwn(radiusTokens, trimmed))
      return radiusTokens[trimmed]
    if (SAFE_RADIUS_RE.test(trimmed))
      return trimmed
  }
  return radiusTokens.lg
})

const safeSource = computed(() => {
  const url = props.search ? resolved.value : props.src
  if (typeof url !== 'string' || failed.value)
    return undefined
  try {
    const parsed = new URL(url.trim())
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : undefined
  }
  catch {
    return undefined
  }
})

const canLoadImage = computed(() =>
  Boolean(safeSource.value) && (approvedOnce.value || ctx.allowRemoteImages.value),
)

const isBlockedRemote = computed(() =>
  Boolean(safeSource.value) && !canLoadImage.value,
)

watch(() => [props.query, props.src, ctx.streaming.value] as const, async (_, __, onCleanup) => {
  let active = true
  onCleanup(() => { active = false })
  failed.value = false
  approvedOnce.value = false
  resolved.value = null
  pending.value = false
  if (!props.search || !props.query || ctx.streaming.value)
    return
  pending.value = true
  try {
    const source = await ctx.resolveImage?.(props.query)
    if (active)
      resolved.value = source ?? null
  }
  catch {
    if (active)
      failed.value = true
  }
  finally {
    if (active)
      pending.value = false
  }
}, { immediate: true })
</script>

<template>
  <figure class="tx-ai-openui__image" :aria-busy="pending" :style="{ aspectRatio: Math.min(5, Math.max(0.2, aspectRatio ?? 1.5)), borderRadius: resolvedRadius }">
    <img v-if="canLoadImage" :src="safeSource" :alt="alt ?? query ?? ''" loading="lazy" referrerpolicy="no-referrer" :style="{ objectFit: fit === 'contain' ? 'contain' : 'cover' }" @error="failed = true">
    <div v-else-if="isBlockedRemote" class="tx-ai-openui__image-gate">
      <span class="tx-ai-openui__image-caption">{{ alt ?? query ?? ctx.labels.value.blockedImageText ?? 'Remote image hidden' }}</span>
      <div class="tx-ai-openui__image-actions">
        <button type="button" class="tx-ai-openui__image-btn" @click="approvedOnce = true">
          {{ ctx.labels.value.loadImageOnceText ?? 'Load image' }}
        </button>
        <button type="button" class="tx-ai-openui__image-btn is-secondary" @click="ctx.allowSessionRemoteImages()">
          {{ ctx.labels.value.allowSessionImagesText ?? 'Allow for session' }}
        </button>
      </div>
    </div>
    <span v-else class="tx-ai-openui__image-caption" role="img" :aria-label="alt ?? query ?? ctx.labels.value.imageUnavailable ?? 'Image unavailable'">{{ pending ? (ctx.labels.value.imageLoading ?? 'Loading image…') : (alt ?? query ?? ctx.labels.value.imageUnavailable ?? 'Image unavailable') }}</span>
  </figure>
</template>
