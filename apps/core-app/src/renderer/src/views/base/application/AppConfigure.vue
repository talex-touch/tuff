<script name="AppConfigure" setup lang="ts">
import type { ITuffIcon, TuffItem } from '@talex-touch/utils'
import { TxButton } from '@talex-touch/tuffex/button'
import { useAppSdk } from '@talex-touch/utils/renderer'
import { useI18n } from 'vue-i18n'
import PluginIcon from '~/components/plugin/PluginIcon.vue'

export interface AppConfigureDetail {
  labelKey: string
  value: string
}

export interface AppConfigureData {
  icon?: string | ITuffIcon
  name?: string
  desc?: string
  path?: string
  details?: AppConfigureDetail[]
  raw?: TuffItem
}

const props = defineProps<{
  data: AppConfigureData
}>()

const emits = defineEmits<{
  (e: 'execute', val: AppConfigureData): void
}>()

const { t } = useI18n()
const appSdk = useAppSdk()

const displayIcon = computed<ITuffIcon | null>(() => {
  const icon = props.data.icon
  if (typeof icon === 'string') return { type: 'url', value: icon }
  if (icon && typeof icon === 'object' && 'value' in icon) {
    return icon
  }
  return null
})

function handleLaunch(): void {
  emits('execute', props.data)
}

function handleHelp(): void {
  const url = `https://www.google.com/search?q=${encodeURIComponent(props.data.name ?? '')}`

  appSdk.openExternal(url).catch(() => {})
}
</script>

<template>
  <div class="AppConfigure">
    <div class="AppConfigure-Head">
      <div class="AppConfigure-Head-Left">
        <PluginIcon v-if="displayIcon" :icon="displayIcon" alt="Application Logo" />
      </div>
      <div class="AppConfigure-Head-Right">
        <div class="AppConfigure-Head-Right-Top">
          {{ data.name }}
        </div>
        <div v-if="data.desc" class="AppConfigure-Head-Right-Bottom">
          {{ data.desc }}
        </div>
        <div v-if="data.path" class="AppConfigure-Head-Right-Path">
          {{ data.path }}
        </div>
      </div>
    </div>
    <div class="AppConfigure-Content">
      <TxScroll>
        <div class="AppConfigure-Content-Inner">
          <TuffGroupBlock :name="t('appConfigure.action')" default-icon="i-ri-auction-line">
            <TuffBlockSlot :title="t('appConfigure.launch')" default-icon="i-ri-external-link-line">
              <TxButton variant="flat" @click="handleLaunch">
                {{ t('appConfigure.launchBtn') }}
              </TxButton>
            </TuffBlockSlot>
            <TuffBlockSwitch
              guidance
              :model-value="false"
              :title="t('appConfigure.help')"
              :description="t('appConfigure.helpDesc')"
              default-icon="i-ri-search-2-line"
              @click="handleHelp"
            />
          </TuffGroupBlock>

          <TuffGroupBlock
            :name="t('appConfigure.stats')"
            default-icon="i-ri-dashboard-horizontal-line"
          >
            <TuffBlockLine
              v-for="detail in data.details ?? []"
              :key="detail.labelKey"
              :title="t(detail.labelKey)"
              :description="detail.value"
            />
          </TuffGroupBlock>
        </div>
      </TxScroll>
    </div>
  </div>
</template>

<style lang="scss">
.AppConfigure-Head {
  position: relative;
  padding: 1rem;
  display: flex;

  // Sized by its content rather than a fixed height: the header carries a name, an optional
  // description and an optional path, and a fixed 48px (which excluded its own padding) clipped
  // the title once more than one line was present.
  flex-shrink: 0;
  width: 100%;
  box-sizing: border-box;

  gap: 1rem;

  border-bottom: 1px solid var(--tx-border-color);

  &-Left {
    position: relative;
    display: flex;

    align-items: center;
    justify-content: center;

    .tuff-icon {
      font-size: 32px;
    }
  }

  &-Right {
    &-Top {
      font-weight: 600;
    }

    &-Bottom {
      opacity: 0.8;
      font-size: 0.8rem;
    }

    &-Path {
      opacity: 0.6;
      font-size: 0.75rem;
      word-break: break-all;
    }

    position: relative;
    display: flex;
    flex-direction: column;
    gap: 2px;

    justify-content: center;
    min-width: 0;
  }
}

.AppConfigure {
  &-Content {
    &-Inner {
      padding: 0 1rem;
    }

    position: relative;
    padding: 1rem 0;

    // Takes whatever the header leaves instead of subtracting a hard-coded header height.
    flex: 1 1 auto;
    width: 100%;
    min-height: 0;

    box-sizing: border-box;
  }

  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;

  width: 100%;
  height: 100%;
}
</style>
