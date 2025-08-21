<script name="PluginApplyInstall" lang="ts" setup>
import { blowMention } from '~/modules/mention/dialog-mention'
import Loading from '~/assets/lotties/compress-loading.json'
import LottieFrame from '@comp/icon/lotties/LottieFrame.vue'
import { sleep } from '@talex-touch/utils'
import FlatButton from '@comp/base/button/FlatButton.vue'
import { touchChannel } from '~/modules/channel/channel-core'
import { getBufferedFile, clearBufferedFile } from '~/modules/hooks/dropper-resolver'

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

async function install(): Promise<void> {
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

    const { data } = await touchChannel.send('@install-plugin', { name: props.fileName, buffer })

    await sleep(400)
    installing.value = false
    await sleep(400)
    close()

    if (data.status === 'error') {
      if (data.msg === '10091') {
        await blowMention('Install', '该插件已遭受不可逆破坏！')
      } else {
        await blowMention('Install', JSON.stringify(data.msg))
      }
    } else {
      await blowMention('Install', '插件安装成功！')
    }
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
      installing: installing
    }"
  >
    <div
      class="PluginApplyInstall-Installing -mb-[110%] opacity-0 transition-all duration-300 ease-in-out"
      :class="{
        '!-mb-[50%] !opacity-100': installing
      }"
    >
      <h4 class="text-center">Installing...</h4>
      <LottieFrame :data="Loading" />
    </div>
    <div
      class="PluginApplyInstall-Main relative transition-all duration-300 ease-in-out"
      :class="{
        '!opacity-0 !-translate-y-full': installing
      }"
    >
      <h2 my-4 text-2xl font-bold text-center>{{ manifest.name }}</h2>
      <h4 class="text-center opacity-75">{{ manifest.description }}</h4>
      <span my-2 class="block text-center text-xs text-gray-500">{{ manifest.version }}</span>
      <div class="flex justify-between mt-16px gap-16px h-2.5rem">
        <FlatButton flex-1 v-wave @click="onIgnore"> Ignore </FlatButton>
        <FlatButton flex-1 v-wave :primary="true" @click="install"> Install </FlatButton>
      </div>
    </div>
  </div>
</template>
