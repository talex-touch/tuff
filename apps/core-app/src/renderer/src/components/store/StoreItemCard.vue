<script setup lang="ts" name="StoreItemCard">
import type { PluginInstallProgressEvent } from '@talex-touch/utils/plugin'
/**
 * StoreItemCard - Card component for displaying a plugin in the store list
 *
 * Shows plugin icon, name, description and install button.
 * Delegates installation state logic to StoreInstallButton component.
 */
import { TxStatusBadge, TxTag } from '@talex-touch/tuffex'
import { TxPluginMetaHeader } from '@talex-touch/tuff-business'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import StoreIcon from '~/components/store/StoreIcon.vue'
import StoreInstallButton from '~/components/store/StoreInstallButton.vue'

interface StoreItem {
  id?: string
  name: string
  description?: string
  version?: string
  author?: string
  downloads?: string
  rating?: number
  icon?: string
  category?: string
  official?: boolean
  providerTrustLevel?: string
  metadata?: Record<string, unknown>
}

interface StoreItemCardProps {
  /** Plugin item data */
  item: StoreItem
  /** Card index in list (for animations) */
  index?: number
  /** Current installation task progress */
  installTask?: PluginInstallProgressEvent
  /** Whether plugin is already installed locally */
  isInstalled?: boolean
  /** Installed version (if installed) */
  installedVersion?: string
  /** Whether a newer version is available in store */
  hasUpgrade?: boolean
}

const props = defineProps<StoreItemCardProps>()

const emit = defineEmits<{
  /** Emitted when install button is clicked */
  (e: 'install'): void
  /** Emitted when card is clicked to open details */
  (e: 'open', source: HTMLElement | null): void
}>()

const { t } = useI18n()

const CATEGORY_ALIASES: Record<string, string> = {
  tools: 'utilities',
  tool: 'utilities'
}

const categoryLabel = computed(() => {
  const raw = props.item.category
  if (!raw) return ''
  const normalized = raw.trim().toLowerCase()
  if (!normalized) return raw
  const resolved = CATEGORY_ALIASES[normalized] ?? normalized
  const key = `store.categories.${resolved}`
  const translated = t(key)
  return translated === key ? raw : translated
})

const metaItems = computed(() => {
  const items: string[] = []
  if (props.item.author) {
    items.push(props.item.author)
  }
  if (props.item.version) {
    items.push(`v${props.item.version}`)
  }
  return items
})

const descriptionText = computed(() => props.item.description || t('store.noDescription'))

/**
 * Handles card click to open plugin details
 */
function handleOpen(event: MouseEvent): void {
  const source = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  emit('open', source)
}

/**
 * Handles install button click
 */
function handleInstall(): void {
  emit('install')
}
</script>

<template>
  <div
    class="store-item-card"
    :class="{ 'official-provider': item.providerTrustLevel === 'official' }"
    @click="handleOpen"
  >
    <div flex="~ col gap-2" p-4>
      <TxPluginMetaHeader
        class="StoreItemCard-MetaHeader"
        :title="item.name || 'Unnamed Plugin'"
        :description="descriptionText"
        :meta-items="metaItems"
        :icon-framed="false"
        :official="false"
      >
        <template #icon>
          <StoreIcon
            v-shared-element:plugin-store-icon
            :item="item"
            :view-transition-name="`store-icon-${item.id}`"
          />
        </template>
        <template #title-extra>
          <i
            v-if="item.official"
            class="i-ri-verified-badge-fill block official-badge"
            title="Official Plugin"
          />
        </template>
      </TxPluginMetaHeader>

      <div>
        <TxStatusBadge v-if="categoryLabel" icon="i-ri-file-2-line" :text="categoryLabel" />
        <TxTag v-for="tag in item.metadata?.badges" :key="tag" :label="tag" />
      </div>

      <div flex="~ items-center justify-between">
        <div flex="~ items-center gap-4">
          <p flex="~ items-center gap-1" class="text-sm op-60">
            <i block class="i-ri-download-2-line" />
            {{ item.downloads ?? 0 }}
          </p>
          <p flex="~ items-center gap-1" class="text-sm op-60">
            <i block class="i-ri-star-fill" />
            {{ item.rating ?? 0 }}
          </p>
        </div>
        <StoreInstallButton
          class="max-w-[50%]"
          :plugin-name="item.name"
          :is-installed="isInstalled"
          :has-upgrade="hasUpgrade"
          :installed-version="installedVersion"
          :store-version="item.version"
          :install-task="installTask"
          @install="handleInstall"
        />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.store-item-card {
  &.official-provider {
    &::before {
      content: '';
      position: absolute;

      inset: 0;

      border-radius: 22px;
      border-style: solid;
      border-image-slice: 1;
      border-image-source: linear-gradient(100deg, #3f5c1e 0%, #4d9375 68%);
      border-width: 8px;

      margin: -7px;

      opacity: 0.5;
      filter: blur(4px);
      mix-blend-mode: hard-light;
    }
  }

  position: relative;
  border-radius: 22px;
  border: 1px solid rgba(var(--tx-color-primary-rgb), 0.35);
  cursor: pointer;
  overflow: hidden;
  transition:
    border-color 0.25s ease,
    box-shadow 0.25s ease,
    background 0.25s ease;

  &:hover {
    border-color: rgba(var(--tx-color-primary-rgb), 0.5);
  }
}

.official-badge {
  flex-shrink: 0;
  font-size: 1rem;
  color: #4d9375;
}

:deep(.StoreItemCard-MetaHeader.TxPluginMetaHeader) {
  align-items: flex-start;
  gap: 12px;
}

:deep(.StoreItemCard-MetaHeader .TxPluginMetaHeader-Title) {
  font-size: 0.95rem;
  line-height: 1.25;
}

:deep(.StoreItemCard-MetaHeader .TxPluginMetaHeader-Description) {
  margin-top: 4px;
  font-size: 0.8rem;
  color: var(--tx-text-color-regular);
  opacity: 0.85;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

:deep(.StoreItemCard-MetaHeader .TxPluginMetaHeader-MetaRow) {
  margin-top: 6px;
  font-size: 12px;
}

:deep(.StoreItemCard-MetaHeader .TxPluginMetaHeader-Badges) {
  display: none;
}
</style>
