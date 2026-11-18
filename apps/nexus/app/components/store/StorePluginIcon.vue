<script setup lang="ts">
import type { TxIconSource } from '@talex-touch/tuffex/icon'
import { TxIcon } from '@talex-touch/tuffex/icon'
import { computed, onMounted, ref, watch } from 'vue'
import { fetchSanitizedSvg, getCachedSvgDataUrl, isApiSvgIconUrl } from '~/composables/useTxIconConfig'

interface Props {
  iconUrl?: string | null
  name: string
  category?: string | null
  size?: number
}

const props = withDefaults(defineProps<Props>(), {
  iconUrl: '',
  category: '',
  size: 48,
})

const CATEGORY_FALLBACK_ICONS: Record<string, string> = {
  utilities: 'i-carbon-cube',
  productivity: 'i-carbon-flash',
  development: 'i-carbon-code',
  devtools: 'i-carbon-terminal',
  ai: 'i-carbon-ai-status',
  media: 'i-carbon-image',
  design: 'i-carbon-paint-brush',
  writing: 'i-carbon-pen',
  system: 'i-carbon-settings-adjust',
}

const resolvedSvgDataUrl = ref<string>('')
const loadFailed = ref(false)

const normalizedUrl = computed(() => props.iconUrl?.trim() ?? '')

async function hydrateSvgIcon(url: string) {
  loadFailed.value = false
  if (!url) {
    resolvedSvgDataUrl.value = ''
    return
  }
  if (!isApiSvgIconUrl(url)) {
    resolvedSvgDataUrl.value = ''
    return
  }

  const cached = getCachedSvgDataUrl(url)
  if (cached) {
    resolvedSvgDataUrl.value = cached
    return
  }

  const clean = await fetchSanitizedSvg(url)
  if (!clean) {
    loadFailed.value = true
    resolvedSvgDataUrl.value = ''
    return
  }
  resolvedSvgDataUrl.value = getCachedSvgDataUrl(url) ?? ''
}

onMounted(() => {
  if (normalizedUrl.value)
    void hydrateSvgIcon(normalizedUrl.value)
})

watch(normalizedUrl, (url) => {
  if (import.meta.client)
    void hydrateSvgIcon(url)
})

const fallbackIconClass = computed(() => {
  const key = (props.category ?? '').trim().toLowerCase()
  return CATEGORY_FALLBACK_ICONS[key] ?? 'i-carbon-plug'
})

const activeIcon = computed<TxIconSource | null>(() => {
  const url = normalizedUrl.value
  if (!url || loadFailed.value)
    return null

  if (isApiSvgIconUrl(url)) {
    if (!resolvedSvgDataUrl.value)
      return null
    return {
      type: 'url',
      value: resolvedSvgDataUrl.value,
    }
  }

  return {
    type: 'url',
    value: url,
  }
})

const glyphSize = computed(() => Math.round(props.size * 0.52))
</script>

<template>
  <div
    class="StorePluginIcon"
    :style="{
      '--store-icon-box': `${props.size}px`,
      '--store-icon-glyph': `${glyphSize}px`,
    }"
  >
    <TxIcon
      v-if="activeIcon"
      class="StorePluginIcon-Glyph"
      :icon="activeIcon"
      :size="glyphSize"
      :alt="`${props.name} icon`"
    >
      <template #empty>
        <span :class="fallbackIconClass" class="StorePluginIcon-FallbackIcon" aria-hidden="true" />
      </template>
    </TxIcon>
    <span
      v-else
      :class="fallbackIconClass"
      class="StorePluginIcon-FallbackIcon"
      aria-hidden="true"
    />
  </div>
</template>

<style scoped>
.StorePluginIcon {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: var(--store-icon-box, 48px);
  height: var(--store-icon-box, 48px);
  border-radius: calc(var(--store-icon-box, 48px) * 0.28);
  color: var(--tx-text-color-primary, #0f172a);
  background:
    radial-gradient(120% 120% at 20% 15%, color-mix(in srgb, var(--tx-color-primary, #409eff) 16%, transparent), transparent 70%),
    color-mix(in srgb, var(--tx-fill-color-light, #f1f5f9) 92%, transparent);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.55),
    inset 0 0 0 1px color-mix(in srgb, var(--tx-border-color, #cbd5e1) 65%, transparent);
  overflow: hidden;
  transition: transform 200ms ease, box-shadow 200ms ease;
}

.dark .StorePluginIcon {
  color: rgba(248, 250, 252, 0.95);
  background:
    radial-gradient(120% 120% at 20% 15%, rgba(96, 165, 250, 0.2), transparent 72%),
    rgba(255, 255, 255, 0.075);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.16),
    inset 0 0 0 1px rgba(255, 255, 255, 0.12);
}

.StorePluginIcon-Glyph {
  color: inherit;
}

.StorePluginIcon-FallbackIcon {
  font-size: var(--store-icon-glyph, 24px);
  line-height: 1;
  opacity: 0.88;
}
</style>
