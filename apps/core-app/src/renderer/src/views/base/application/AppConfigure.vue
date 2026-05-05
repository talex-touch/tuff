<script name="AppConfigure" setup lang="ts">
import type { ITuffIcon } from '@talex-touch/utils'
import { TxButton } from '@talex-touch/tuffex'
import { useAppSdk } from '@talex-touch/utils/renderer'
import { useI18n } from 'vue-i18n'

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

const displayIcon = computed(() => {
  const icon = props.data.icon
  if (typeof icon === 'string') return icon
  if (icon && typeof icon === 'object' && 'value' in icon) {
    return icon.value as string
  }
  return ''
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
        <img v-if="displayIcon" :src="displayIcon" alt="Application Logo" />
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
          <t-group-block :name="t('appConfigure.action')" description="" icon="auction">
            <t-block-slot :title="t('appConfigure.launch')" description="" icon="external-link">
              <TxButton variant="flat" @click="handleLaunch">
                {{ t('appConfigure.launchBtn') }}
              </TxButton>
            </t-block-slot>
            <t-block-switch
              guidance
              :model-value="false"
              :title="t('appConfigure.help')"
              :description="t('appConfigure.helpDesc')"
              icon="search-2"
              @click="handleHelp"
            />
          </t-group-block>

          <t-group-block :name="t('appConfigure.stats')" description="" icon="dashboard-horizontal">
            <t-block-line :title="t('appConfigure.name')">
              <template #description>
                {{ data.names }}
              </template>
            </t-block-line>
            <t-block-line :title="t('appConfigure.type')" :description="data.type" />
            <t-block-line :title="t('appConfigure.value')" :description="data.value" />
            <t-block-line :title="t('appConfigure.keywords')">
              <template #description>
                {{ data.keyWords }}
              </template>
            </t-block-line>
          </t-group-block>
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
