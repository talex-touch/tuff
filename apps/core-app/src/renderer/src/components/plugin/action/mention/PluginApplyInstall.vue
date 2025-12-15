<script name="PluginApplyInstall" lang="ts" setup>
import { sleep } from '@talex-touch/utils'
import Loading from '~/assets/lotties/compress-loading.json'
import FlatButton from '~/components/base/button/FlatButton.vue'
import LottieFrame from '~/components/icon/lotties/LottieFrame.vue'
import { touchChannel } from '~/modules/channel/channel-core'
import { clearBufferedFile, getBufferedFile } from '~/modules/hooks/dropper-resolver'
import { blowMention, forTouchTip } from '~/modules/mention/dialog-mention'

interface Manifest {
  name: string
  description: string
  version: string
}

const props = defineProps<{
  manifest: Manifest
  path: string
  fileName: string
}>()

const installing = ref(false)
const close = inject('destroy') as () => void

async function install(forceUpdate = false): Promise<void> {
  installing.value = true

  const buffer = getBufferedFile(props.fileName)
  if (!buffer) {
    await blowMention('Install Error', 'Plugin file buffer not found, please try again.')
    installing.value = false
    close()
    return
  }

  try {
    await sleep(400)

    const data = await touchChannel.send('@install-plugin', { 
      name: props.fileName, 
      buffer,
      forceUpdate 
    })

    await sleep(400)
    installing.value = false
    await sleep(400)

    if (data?.status === 'error') {
      if (data.msg === '10091') {
        close()
        await blowMention('Install Error', 'The plugin package is corrupted!')
      }
      else if (data.msg === 'plugin already exists') {
        // Ask user if they want to update/override
        let shouldUpdate = false
        await forTouchTip(
          'Plugin Already Exists',
          `Plugin "${props.manifest.name}" is already installed. Do you want to update it?`,
          [
            {
              content: 'Update',
              type: 'success',
              onClick: async () => {
                shouldUpdate = true
                return true
              }
            },
            {
              content: 'Cancel',
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
      }
      else if (typeof data.msg === 'string') {
        close()
        await blowMention('Install Error', `Installation failed: ${data.msg}`)
      }
      else {
        close()
        await blowMention('Install Error', `Installation failed: ${JSON.stringify(data.msg)}`)
      }
    }
    else {
      close()
      await blowMention('Install Success', `Plugin "${props.manifest.name}" installed successfully!`)
    }
  }
  catch (error: any) {
    installing.value = false
    close()
    console.error('[PluginApplyInstall] Installation error:', error)
    await blowMention('Install Error', `Unexpected error: ${error?.message || 'Unknown error'}`)
  }
  finally {
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
      installing,
    }"
  >
    <div
      class="PluginApplyInstall-Installing -mb-[110%] opacity-0 transition-all duration-300 ease-in-out"
      :class="{
        '!-mb-[50%] !opacity-100': installing,
      }"
    >
      <h4 class="text-center">
        Installing...
      </h4>
      <LottieFrame :data="Loading" />
    </div>
    <div
      class="PluginApplyInstall-Main relative transition-all duration-300 ease-in-out"
      :class="{
        '!opacity-0 !-translate-y-full': installing,
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
        <FlatButton v-wave flex-1 @click="onIgnore">
          Ignore
        </FlatButton>
        <FlatButton v-wave flex-1 :primary="true" @click="install">
          Install
        </FlatButton>
      </div>
    </div>
  </div>
</template>
