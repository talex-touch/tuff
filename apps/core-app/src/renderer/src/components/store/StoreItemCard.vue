<script setup lang="ts" name="StoreItemCard">
import type { PluginInstallProgressEvent } from '@talex-touch/utils/plugin'
/**
 * StoreItemCard - Card component for displaying a plugin in the store list
 *
 * Shows plugin icon, name, description and install button.
 * Delegates installation state logic to StoreInstallButton component.
 */
import { TxPopover, TxStatusBadge, TxTag } from '@talex-touch/tuffex'
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

const footerMetaItems = computed(() => {
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
    <div class="StoreItemCard-Inner">
      <TxPluginMetaHeader
        class="StoreItemCard-MetaHeader"
        :title="item.name || 'Unnamed Plugin'"
        :description="null"
        :meta-items="[]"
        :icon-framed="false"
        :official="false"
      >
        <template #icon>
          <StoreIcon
            v-shared-element:plugin-store-icon
            :item="item"
            :size="30"
            :view-transition-name="`store-icon-${item.id}`"
          />
        </template>
        <template #title-extra>
          <i
            v-if="item.official"
            class="i-ri-verified-badge-fill block official-badge"
            :title="t('store.officialBadge')"
          />
        </template>
        <template #badges>
          <TxPopover
            trigger="hover"
            placement="bottom-start"
            :max-width="360"
            :width="320"
            :open-delay="180"
            :close-delay="80"
            reference-full-width
            panel-background="refraction"
            panel-shadow="soft"
          >
            <template #reference>
              <p class="StoreItemCard-Description">
                {{ descriptionText }}
              </p>
            </template>
            <p class="StoreItemCard-DescriptionPopover">
              {{ descriptionText }}
            </p>
          </TxPopover>
        </template>
      </TxPluginMetaHeader>

      <div class="StoreItemCard-Tags">
        <TxStatusBadge
          v-if="categoryLabel"
          class="StoreItemCard-CategoryTag"
          icon="i-ri-file-2-line"
          :text="categoryLabel"
          size="sm"
        />
        <TxTag
          v-for="tag in item.metadata?.badges"
          :key="tag"
          class="StoreItemCard-Tag"
          :label="tag"
          size="sm"
        />
      </div>

      <div class="StoreItemCard-Footer">
        <div class="StoreItemCard-FooterInfo">
          <div class="StoreItemCard-Stats">
            <p class="StoreItemCard-Stat">
              <i class="i-ri-download-2-line" />
              {{ item.downloads ?? 0 }}
            </p>
            <p class="StoreItemCard-Stat">
              <i class="i-ri-star-fill" />
              {{ item.rating ?? 0 }}
            </p>
          </div>
          <div v-if="footerMetaItems.length" class="StoreItemCard-FooterMeta">
            <template v-for="(meta, metaIndex) in footerMetaItems" :key="`${metaIndex}-${meta}`">
              <span v-if="metaIndex > 0" aria-hidden="true">•</span>
              <span>{{ meta }}</span>
            </template>
          </div>
        </div>
        <StoreInstallButton
          class="StoreItemCard-InstallButton"
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
  min-height: 188px;
  border-radius: 22px;
  border: 1px solid
    color-mix(in srgb, var(--tx-border-color, #d1d5db) 78%, var(--tx-color-primary, #409eff) 22%);
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--tx-fill-color-lighter, #f5f7fa) 62%, var(--tx-bg-color, #fff)),
      color-mix(in srgb, var(--tx-fill-color-light, #eef1f5) 70%, var(--tx-bg-color, #fff))
    ),
    color-mix(in srgb, var(--tx-fill-color-light, #eef1f5) 82%, transparent);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.44),
    0 10px 24px rgba(15, 23, 42, 0.045);
  cursor: pointer;
  overflow: hidden;
  transition:
    border-color 0.25s ease,
    box-shadow 0.25s ease,
    background 0.25s ease;

  &:hover {
    border-color: color-mix(
      in srgb,
      var(--tx-color-primary, #409eff) 55%,
      var(--tx-border-color, #d1d5db)
    );
    background:
      linear-gradient(
        180deg,
        color-mix(in srgb, var(--tx-fill-color-lighter, #f5f7fa) 74%, var(--tx-bg-color, #fff)),
        color-mix(in srgb, var(--tx-fill-color-light, #eef1f5) 82%, var(--tx-bg-color, #fff))
      ),
      color-mix(in srgb, var(--tx-fill-color-light, #eef1f5) 88%, transparent);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.5),
      0 14px 30px rgba(15, 23, 42, 0.08);
  }
}

.StoreItemCard-Inner {
  position: relative;
  z-index: 1;
  height: 100%;
  min-height: inherit;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px 20px 16px;
}

.StoreItemCard-Tags {
  min-height: 24px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.StoreItemCard-Footer {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.StoreItemCard-FooterInfo {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.StoreItemCard-Stats,
.StoreItemCard-FooterMeta {
  display: flex;
  align-items: center;
  gap: 12px;
}

.StoreItemCard-Stat {
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.82rem;
  line-height: 1;
  color: color-mix(in srgb, var(--tx-text-color-secondary, #6b7280) 90%, transparent);

  i {
    flex-shrink: 0;
    font-size: 0.95rem;
  }
}

.StoreItemCard-FooterMeta {
  min-width: 0;
  justify-content: flex-end;
  gap: 6px;
  overflow: hidden;
  font-size: 0.76rem;
  line-height: 1.2;
  font-weight: 600;
  color: color-mix(in srgb, var(--tx-text-color-secondary, #6b7280) 88%, transparent);

  span:not([aria-hidden='true']) {
    min-width: 0;
    max-width: 116px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.StoreItemCard-InstallButton {
  flex-shrink: 0;
  max-width: 42%;
}

.official-badge {
  flex-shrink: 0;
  font-size: 1rem;
  color: #4d9375;
}

:deep(.StoreItemCard-MetaHeader.TxPluginMetaHeader) {
  align-items: flex-start;
  gap: 16px;
}

:deep(.StoreItemCard-MetaHeader .TxPluginMetaHeader-Content) {
  padding-top: 2px;
}

:deep(.StoreItemCard-MetaHeader .TxPluginMetaHeader-Title) {
  font-size: 1.02rem;
  line-height: 1.25;
}

:deep(.StoreItemCard-MetaHeader .TxPluginMetaHeader-MetaRow) {
  display: none;
}

:deep(.StoreItemCard-MetaHeader .TxPluginMetaHeader-Badges) {
  display: block;
  margin-top: 6px;
}

.StoreItemCard-Description {
  margin: 0;
  color: var(--tx-text-color-regular);
  opacity: 0.82;
  font-size: 0.82rem;
  line-height: 1.35;
  display: -webkit-box;
  min-height: 2.1em;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.StoreItemCard-DescriptionPopover {
  margin: 0;
  max-width: 320px;
  font-size: 0.82rem;
  line-height: 1.55;
  color: var(--tx-text-color-primary);
  word-break: break-word;
}

:deep(.StoreItemCard-CategoryTag.tx-status-badge) {
  gap: 4px;
  border-radius: 9px;
  padding: 3px 8px;
  font-size: 0.72rem;
  letter-spacing: 0.01em;
}

:deep(.StoreItemCard-CategoryTag .tx-status-badge__icon) {
  font-size: 0.78rem;
}

:deep(.StoreItemCard-Tag.tx-tag) {
  gap: 4px;
  border-radius: 9px;
  padding: 3px 7px;
  font-size: 0.7rem;
  letter-spacing: 0.035em;
}

:global(.store-grid.list-view) {
  .store-item-card {
    min-height: 146px;
  }

  .StoreItemCard-Footer {
    align-items: center;
  }

  .StoreItemCard-Inner {
    padding: 16px 18px;
  }

  .StoreItemCard-Tags {
    display: none;
  }
}
</style>
