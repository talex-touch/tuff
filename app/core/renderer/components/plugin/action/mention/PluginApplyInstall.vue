<script name="PluginApplyInstall" setup>
import { inject, ref } from 'vue'
import { blowMention } from '@modules/mention/dialog-mention'
import Loading from '@assets/lotties/compress-loading.json'
import LottieFrame from '@comp/icon/lotties/LottieFrame.vue'
import { sleep } from '@talex-touch/utils/common'
import FlatButton from '@comp/base/button/FlatButton.vue'
import { touchChannel } from '@modules/channel/channel-core'

const props = defineProps(['manifest', 'path'])

const installing = ref(false)
const close = inject('destroy')

async function install() {
  installing.value = true

  await sleep(400)

  const { data } = await touchChannel.send('@install-plugin', props.path, {
    timeout: 1000 * 60 * 5,
  })

  await sleep(400)

  installing.value = false

  await sleep(400)

  close()

  if (data.status === 'error') {
    if (data.msg === '10091')
      await blowMention('Install', '该插件已遭受不可逆破坏！')
    else
      await blowMention('Install', JSON.stringify(data.msg))
  }
  else {
    await blowMention('Install', '插件安装成功！')
  }
}
</script>

<template>
  <div class="PluginApplyInstall-Container" :class="{ installing }">
    <div class="PluginApplyInstall-Installing">
      <h4>正在安装中...</h4>
      <LottieFrame :data="Loading" />
    </div>
    <div class="PluginApplyInstall-Main">
      <p>新插件</p>
      <!-- <div class="PluginApplyInstall-Main">
        <PluginIcon :icon="manifest.icon" />
      </div> -->
      <h2 text-center>{{ manifest.name }}</h2>
      <h4>{{ manifest.description }}</h4>
      <span>{{ manifest.version }}</span>
      <div class="PluginApplyInstall-Button">
        <FlatButton v-wave @click="close">
          忽略
        </FlatButton>
        <FlatButton v-wave :primary="true" @click="install">
          安装
        </FlatButton>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.PluginApplyInstall-Installing {
  margin-bottom: -120%;

  opacity: 0;
  transition: cubic-bezier(0.4, 0, 0.2, 1) 0.3s;
}

.PluginApplyInstall-Main {
  position: relative;

  transition: cubic-bezier(0.4, 0, 0.2, 1) 0.3s;
}

.PluginApplyInstall-Container {
  &.installing {
    .PluginApplyInstall-Installing {
      margin-bottom: -50%;

      opacity: 1;
    }

    .PluginApplyInstall-Main {
      opacity: 0;

      transform: translateY(-100%);
    }
  }

  .PluginApplyInstall-Button {
    display: flex;
    justify-content: space-between;
    margin-top: 16px;

    gap: 16px;
    height: 2.5rem;
  }

  h4 {
    text-align: center;
  }

  transition: cubic-bezier(0.4, 0, 0.2, 1) 0.3s;
}</style>
