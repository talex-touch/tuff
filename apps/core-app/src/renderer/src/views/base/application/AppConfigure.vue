<script name="AppConfigure" setup lang="ts">
import type { ITuffIcon } from '@talex-touch/utils'
import { TxButton } from '@talex-touch/tuffex/button'
import { useAppSdk } from '@talex-touch/utils/renderer'
import { useI18n } from 'vue-i18n'
import PluginIcon from '~/components/plugin/PluginIcon.vue'

export interface AppConfigureData {
  icon?: string | ITuffIcon
  name?: string
  desc?: string
  names?: string
  type?: string
  value?: string
  keyWords?: string
  [key: string]: unknown
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
        <div class="AppConfigure-Head-Right-Bottom">
          {{ data.desc }}
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
            <TuffBlockLine :title="t('appConfigure.name')">
              <template #description>
                {{ data.names }}
              </template>
            </TuffBlockLine>
            <TuffBlockLine :title="t('appConfigure.type')" :description="data.type" />
            <TuffBlockLine :title="t('appConfigure.value')" :description="data.value" />
            <TuffBlockLine :title="t('appConfigure.keywords')">
              <template #description>
                {{ data.keyWords }}
              </template>
            </TuffBlockLine>
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

  width: 100%;
  height: 48px;

  gap: 1rem;

  border-bottom: 1px solid var(--tx-border-color);

  &-Left {
    position: relative;
    display: flex;

    align-items: center;
    justify-content: center;

    height: 100%;

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

    position: relative;
    display: flex;
    flex-direction: column;

    justify-content: center;

    height: 100%;
  }
}

.AppConfigure {
  &-Content {
    &-Inner {
      padding: 0 1rem;
    }

    position: relative;
    padding: 1rem 0;

    width: 100%;
    height: calc(100% - 48px);

    box-sizing: border-box;
  }

  position: relative;
  flex: 1;

  width: 100%;
  height: 100%;
}
</style>
