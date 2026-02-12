<script setup lang="ts" name="RemotePresetOverlay">
import type { RemotePresetSummary } from '~/modules/layout/preset/remote/useRemotePresets'
import { TxButton, TxCard, TxFlipOverlay, TxStatusBadge } from '@talex-touch/tuffex'
import { ElMessage } from 'element-plus'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRemotePresets } from '~/modules/layout'

const props = defineProps<{
  source?: HTMLElement | null
}>()

const visible = defineModel<boolean>({ default: false })
const { t } = useI18n()

const {
  items,
  isFetching,
  isApplying,
  listRemotePresets,
  applyRemotePreset,
  rollbackLastRemotePreset
} = useRemotePresets()

const selectedPresetId = ref<string>('')

watch(
  () => visible.value,
  async (opened) => {
    if (!opened) {
      return
    }

    try {
      const result = await listRemotePresets('beta')
      if (result.length > 0 && !selectedPresetId.value) {
        selectedPresetId.value = result[0]!.id
      }
    } catch (error) {
      console.error('[RemotePresetOverlay] Failed to load preset list:', error)
      ElMessage.error(t('preset.remoteListFailed', 'Failed to load Nexus preset list'))
    }
  }
)

const sortedItems = computed(() => {
  return [...items.value].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
})

const selectedItem = computed(() => {
  return sortedItems.value.find((item) => item.id === selectedPresetId.value) ?? null
})

function formatCompat(item: RemotePresetSummary): string {
  const min = item.compat?.minAppVersion
  const max = item.compat?.maxAppVersion

  if (!min && !max) {
    return t('preset.remoteCompatAny', 'Compatible with current app')
  }

  if (min && max) {
    return `v${min} ~ v${max}`
  }

  if (min) {
    return `>= v${min}`
  }

  return `<= v${max}`
}

function formatUpdatedAt(isoTime: string): string {
  try {
    const date = new Date(isoTime)
    return date.toLocaleString()
  } catch {
    return isoTime
  }
}

async function handleApply(close: () => void): Promise<void> {
  if (!selectedItem.value) {
    return
  }

  try {
    await applyRemotePreset(selectedItem.value.id)
    ElMessage.success(t('preset.remoteApplySuccess', 'Nexus preset applied'))
    close()
  } catch (error) {
    console.error('[RemotePresetOverlay] Failed to apply preset:', error)
    ElMessage.error(t('preset.remoteApplyFailed', 'Failed to apply Nexus preset'))
  }
}

function handleRollback(): void {
  rollbackLastRemotePreset()
}

async function handleRefresh(): Promise<void> {
  try {
    await listRemotePresets('beta')
  } catch (error) {
    console.error('[RemotePresetOverlay] Failed to refresh presets:', error)
    ElMessage.error(t('preset.remoteListFailed', 'Failed to load Nexus preset list'))
  }
}
</script>

<template>
  <Teleport to="body">
    <TxFlipOverlay
      v-model="visible"
      :source="props.source"
      :duration="420"
      :rotate-x="6"
      :rotate-y="8"
      :speed-boost="1.1"
      transition-name="RemotePresetOverlay-Mask"
      mask-class="RemotePresetOverlay-Mask"
      card-class="RemotePresetOverlay-Card"
    >
      <template #default="{ close }">
        <div class="RemotePresetOverlay">
          <div class="RemotePresetOverlay-Header">
            <div>
              <h3 class="RemotePresetOverlay-Title">
                {{ t('preset.remoteTitle', 'Nexus Presets (Beta)') }}
              </h3>
              <p class="RemotePresetOverlay-Subtitle">
                {{ t('preset.remoteDesc', 'Preview and apply remote layout presets after login.') }}
              </p>
            </div>

            <div class="RemotePresetOverlay-Actions">
              <TxStatusBadge text="Beta" status="warning" size="sm" />
              <TxButton variant="bare" size="sm" :loading="isFetching" @click="handleRefresh">
                <span class="i-ri-refresh-line mr-1" />
                {{ t('common.refresh', 'Refresh') }}
              </TxButton>
              <TxButton variant="bare" size="sm" @click="handleRollback">
                <span class="i-ri-arrow-go-back-line mr-1" />
                {{ t('preset.rollback', 'Undo Last Apply') }}
              </TxButton>
              <TxButton variant="flat" size="sm" @click="close">
                {{ t('common.cancel', 'Cancel') }}
              </TxButton>
              <TxButton
                variant="flat"
                size="sm"
                :disabled="!selectedItem"
                :loading="isApplying"
                @click="handleApply(close)"
              >
                {{ t('preset.remoteApply', 'Apply Nexus Beta') }}
              </TxButton>
            </div>
          </div>

          <div class="RemotePresetOverlay-Body">
            <div v-if="sortedItems.length === 0" class="RemotePresetOverlay-Empty">
              <span class="i-ri-inbox-archive-line" />
              <p>{{ t('preset.noRemotePreset', 'No Nexus beta preset available') }}</p>
            </div>

            <div v-else class="RemotePresetOverlay-List">
              <TxCard
                v-for="item in sortedItems"
                :key="item.id"
                :clickable="true"
                variant="solid"
                background="mask"
                :padding="12"
                class="RemotePresetOverlay-Item"
                :class="{ active: selectedPresetId === item.id }"
                @click="selectedPresetId = item.id"
              >
                <div class="RemotePresetOverlay-ItemHeader">
                  <p class="RemotePresetOverlay-ItemName">{{ item.name }}</p>
                  <TxStatusBadge
                    :text="item.channel.toUpperCase()"
                    :status="item.channel === 'beta' ? 'warning' : 'success'"
                    size="sm"
                  />
                </div>

                <div class="RemotePresetOverlay-Preview">
                  <img v-if="item.preview" :src="item.preview" :alt="item.name" />
                  <div v-else class="RemotePresetOverlay-PreviewFallback">
                    <span class="i-ri-image-line" />
                    <span>{{ t('preset.previewUnavailable', 'No Preview') }}</span>
                  </div>
                </div>

                <p class="RemotePresetOverlay-ItemDesc">
                  {{ item.description || t('preset.noDescription', 'No description') }}
                </p>
                <p class="RemotePresetOverlay-ItemMeta">
                  {{ t('preset.compat', 'Compatibility') }}: {{ formatCompat(item) }}
                </p>
                <p class="RemotePresetOverlay-ItemMeta">
                  {{ t('preset.updatedAt', 'Updated') }}: {{ formatUpdatedAt(item.updatedAt) }}
                </p>
              </TxCard>
            </div>
          </div>
        </div>
      </template>
    </TxFlipOverlay>
  </Teleport>
</template>

<style scoped lang="scss">
.RemotePresetOverlay {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.RemotePresetOverlay-Header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.RemotePresetOverlay-Title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.RemotePresetOverlay-Subtitle {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.RemotePresetOverlay-Actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.RemotePresetOverlay-Body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px;
}

.RemotePresetOverlay-List {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

.RemotePresetOverlay-Item {
  border: 1px solid var(--el-border-color-lighter);
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;

  &.active {
    border-color: var(--el-color-primary);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--el-color-primary) 45%, transparent);
  }
}

.RemotePresetOverlay-ItemHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.RemotePresetOverlay-ItemName {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.RemotePresetOverlay-Preview {
  margin-top: 10px;
  border-radius: 10px;
  overflow: hidden;
  aspect-ratio: 16 / 9;
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-light);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.RemotePresetOverlay-PreviewFallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 6px;
  color: var(--el-text-color-secondary);
}

.RemotePresetOverlay-ItemDesc {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
}

.RemotePresetOverlay-ItemMeta {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--el-text-color-regular);
}

.RemotePresetOverlay-Empty {
  height: 100%;
  min-height: 280px;
  border: 1px dashed var(--el-border-color-lighter);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 10px;
  color: var(--el-text-color-secondary);

  span {
    font-size: 24px;
  }

  p {
    margin: 0;
    font-size: 13px;
  }
}
</style>

<style lang="scss">
.RemotePresetOverlay-Mask {
  position: fixed;
  inset: 0;
  background: rgba(12, 12, 14, 0.42);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  z-index: 1850;
  display: flex;
  align-items: center;
  justify-content: center;
  perspective: 1200px;
}

.RemotePresetOverlay-Mask-enter-active,
.RemotePresetOverlay-Mask-leave-active {
  transition: opacity 200ms ease;
}

.RemotePresetOverlay-Mask-enter-from,
.RemotePresetOverlay-Mask-leave-to {
  opacity: 0;
}

.RemotePresetOverlay-Card {
  width: min(1160px, 94vw);
  height: min(820px, 90vh);
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 1.25rem;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
  overflow: hidden;
  position: fixed;
  left: 50%;
  top: 50%;
  display: flex;
  flex-direction: column;
  transform-origin: 50% 50%;
  transform-style: preserve-3d;
  backface-visibility: hidden;
  will-change: transform;
}
</style>
