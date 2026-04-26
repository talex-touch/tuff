<script name="PluginApplyInstall" lang="ts" setup>
import { TxButton } from '@talex-touch/tuffex'
import { sleep } from '@talex-touch/utils'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { useI18n } from 'vue-i18n'
import Loading from '~/assets/lotties/compress-loading.json'
import LottieFrame from '~/components/icon/lotties/LottieFrame.vue'
import { clearBufferedFile, getBufferedFile } from '~/modules/hooks/dropper-resolver'
import { blowMention, forTouchTip } from '~/modules/mention/dialog-mention'
import {
  isPluginAlreadyInstalledMessage,
  resolvePluginApplyInstallErrorMessage
} from './plugin-apply-install-utils'

interface Manifest {
  name: string
  description?: string
  version?: string
}

const props = defineProps<{
  manifest: Manifest
  path: string
  fileName: string
}>()

const { t } = useI18n()
const transport = useTuffTransport()
type PluginInstallRequest = {
  name: string
  buffer: Buffer
  forceUpdate: boolean
}

type PluginInstallResponse = {
  status?: string
  msg?: unknown
}

const installEvent = defineRawEvent<PluginInstallRequest, PluginInstallResponse>('@install-plugin')
const installing = ref(false)
const close = inject('destroy') as () => void

async function install(forceUpdate = false): Promise<void> {
  installing.value = true

  const buffer = getBufferedFile(props.fileName)
  if (!buffer) {
    await blowMention(t('plugin.dropInstall.errorTitle'), t('plugin.dropInstall.bufferMissing'))
    installing.value = false
    close()
    return
  }

  try {
    await sleep(400)

    const data = await transport.send(installEvent, {
      name: props.fileName,
      buffer,
      forceUpdate
    })

    await sleep(400)
    installing.value = false
    await sleep(400)

    if (data?.status === 'error') {
      if (isPluginAlreadyInstalledMessage(data.msg)) {
        // Ask user if they want to update/override
        let shouldUpdate = false
        await forTouchTip(
          t('plugin.dropInstall.alreadyInstalledTitle'),
          t('plugin.dropInstall.alreadyInstalledMessage', {
            name: props.manifest.name
          }),
          [
            {
              content: t('plugin.dropInstall.update'),
              type: 'success',
              onClick: async () => {
                shouldUpdate = true
                return true
              }
            },
            {
              content: t('common.cancel'),
              type: 'default',
              onClick: async () => true
            }
          ]
        )

        if (shouldUpdate) {
          // Retry with force update
          await install(true)
          return
        }
        close()
      } else {
        close()
        await blowMention(
          t('plugin.dropInstall.errorTitle'),
          resolvePluginApplyInstallErrorMessage(data.msg, t)
        )
      }
    } else {
      close()
      await blowMention(
        t('plugin.dropInstall.successTitle'),
        t('plugin.dropInstall.successMessage', {
          name: props.manifest.name
        })
      )
    }
  } catch (error: unknown) {
    installing.value = false
    close()
    console.error('[PluginApplyInstall] Installation error:', error)
    await blowMention(t('plugin.dropInstall.errorTitle'), t('plugin.dropInstall.unexpected'))
  } finally {
    clearBufferedFile(props.fileName)
  }
}

function onIgnore(): void {
  clearBufferedFile(props.fileName)
  close()
}
</script>

<template>
  <div
    class="PluginApplyInstall-Container transition-all duration-300 ease-in-out"
    :class="{
      installing
    }"
  >
    <div
      class="PluginApplyInstall-Installing -mb-[110%] opacity-0 transition-all duration-300 ease-in-out"
      :class="{
        '!-mb-[50%] !opacity-100': installing
      }"
    >
      <h4 class="text-center">{{ t('plugin.dropInstall.installing') }}</h4>
      <LottieFrame :data="Loading" />
    </div>
    <div
      class="PluginApplyInstall-Main relative transition-all duration-300 ease-in-out"
      :class="{
        '!opacity-0 !-translate-y-full': installing
      }"
    >
      <h2 my-4 text-2xl font-bold text-center>
        {{ manifest.name }}
      </h2>
      <h4 class="text-center opacity-75">
        {{ manifest.description }}
      </h4>
      <span my-2 class="block text-center text-xs text-gray-500">{{ manifest.version }}</span>
      <div class="flex justify-between mt-16px gap-16px h-2.5rem">
        <TxButton variant="flat" flex-1 @click="onIgnore">
          {{ t('plugin.dropInstall.ignore') }}
        </TxButton>
        <TxButton variant="flat" type="primary" flex-1 @click="install()">
          {{ t('plugin.dropInstall.install') }}
        </TxButton>
      </div>
    </div>
  </div>
</template>
