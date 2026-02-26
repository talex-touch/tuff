<script setup lang="ts" name="TxPluginMetaHeader">
import { TxIcon } from '@talex-touch/tuffex'
import { computed } from 'vue'

interface Props {
  title: string
  subtitle?: string | null
  description?: string | null
  metaItems?: Array<string | number | null | undefined>
  iconUrl?: string | null
  iconAlt?: string
  iconFramed?: boolean
  official?: boolean
  officialText?: string
}

const props = withDefaults(defineProps<Props>(), {
  subtitle: '',
  description: '',
  metaItems: () => [],
  iconUrl: '',
  iconAlt: '',
  iconFramed: true,
  official: false,
  officialText: 'Official',
})

const normalizedMetaItems = computed(() =>
  props.metaItems
    .map(item => (item === null || item === undefined ? '' : String(item).trim()))
    .filter(Boolean),
)

const iconFallbackText = computed(() => props.title.charAt(0).toUpperCase())

const resolvedIcon = computed(() => {
  const iconUrl = props.iconUrl?.trim()
  if (iconUrl) {
    return {
      type: 'url' as const,
      value: iconUrl,
    }
  }

  return {
    type: 'emoji' as const,
    value: iconFallbackText.value || ' ',
  }
})
</script>

<template>
  <div class="TxPluginMetaHeader">
    <div class="TxPluginMetaHeader-Icon" :class="{ 'is-frameless': !iconFramed }">
      <slot name="icon">
        <TxIcon
          class="TxPluginMetaHeader-IconImage"
          :icon="resolvedIcon"
          :alt="iconAlt || title"
        />
      </slot>
    </div>

    <div class="TxPluginMetaHeader-Content">
      <div class="TxPluginMetaHeader-TitleRow">
        <h2 class="TxPluginMetaHeader-Title" :title="title">
          {{ title }}
        </h2>
        <slot name="title-extra">
          <span v-if="official" class="TxPluginMetaHeader-OfficialBadge">
            {{ officialText }}
          </span>
        </slot>
      </div>

      <p v-if="subtitle" class="TxPluginMetaHeader-Subtitle" :title="subtitle">
        {{ subtitle }}
      </p>
      <p v-if="description" class="TxPluginMetaHeader-Description" :title="description">
        {{ description }}
      </p>

      <div v-if="normalizedMetaItems.length" class="TxPluginMetaHeader-MetaRow">
        <template v-for="(item, index) in normalizedMetaItems" :key="`${index}-${item}`">
          <span v-if="index > 0" aria-hidden="true">•</span>
          <span>{{ item }}</span>
        </template>
      </div>

      <div v-if="$slots.badges" class="TxPluginMetaHeader-Badges">
        <slot name="badges" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.TxPluginMetaHeader {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.TxPluginMetaHeader-Icon {
  --tx-plugin-meta-icon-size: 80px;
  width: 80px;
  height: 80px;
  flex-shrink: 0;
  border-radius: 24px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.TxPluginMetaHeader-Icon.is-frameless {
  width: auto;
  height: auto;
  border: none;
  border-radius: 0;
  background: transparent;
  overflow: visible;
}

.TxPluginMetaHeader-IconImage {
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  font-size: var(--tx-plugin-meta-icon-size);
}

:deep(.TxPluginMetaHeader-IconImage img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

:deep(.TxPluginMetaHeader-IconImage[data-icon-type='emoji']) {
  font-size: 30px;
  font-weight: 700;
  color: color-mix(in srgb, var(--tx-text-color-placeholder, #9ca3af) 92%, transparent);
}

.TxPluginMetaHeader-Content {
  min-width: 0;
  flex: 1;
}

.TxPluginMetaHeader-TitleRow {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.TxPluginMetaHeader-Title {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: clamp(1.25rem, 2.8vw, 1.85rem);
  font-weight: 650;
  line-height: 1.18;
  color: var(--tx-text-color, #111827);
}

.TxPluginMetaHeader-OfficialBadge {
  flex-shrink: 0;
  border-radius: 9999px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  color: color-mix(in srgb, var(--tx-color-warning, #f59e0b) 88%, var(--tx-text-color, #111827) 12%);
  background: color-mix(in srgb, var(--tx-color-warning, #f59e0b) 18%, transparent);
  border: 1px solid color-mix(in srgb, var(--tx-color-warning, #f59e0b) 34%, transparent);
}

.TxPluginMetaHeader-Subtitle {
  margin: 4px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.875rem;
  color: color-mix(in srgb, var(--tx-text-color-secondary, #4b5563) 90%, transparent);
}

.TxPluginMetaHeader-Description {
  margin: 8px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.875rem;
  color: color-mix(in srgb, var(--tx-text-color, #111827) 86%, transparent);
}

.TxPluginMetaHeader-MetaRow {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 0.8125rem;
  color: color-mix(in srgb, var(--tx-text-color-secondary, #4b5563) 92%, transparent);
}

.TxPluginMetaHeader-Badges {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

@media (max-width: 720px) {
  .TxPluginMetaHeader {
    gap: 12px;
  }

  .TxPluginMetaHeader-Icon {
    --tx-plugin-meta-icon-size: 64px;
    width: 64px;
    height: 64px;
    border-radius: 18px;
  }

  .TxPluginMetaHeader-Description {
    margin-top: 6px;
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
}
</style>
