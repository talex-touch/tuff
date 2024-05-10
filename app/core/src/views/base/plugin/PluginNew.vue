<script setup lang="ts" name="PluginNew">
import FormTemplate from '@comp/base/template/FormTemplate.vue';
import BlockTemplate from '@comp/base/template/BlockTemplate.vue';
import BrickTemplate from '@comp/base/template/BrickTemplate.vue';
import LineTemplate from '@comp/base/template/LineTemplate.vue';
import ActionTemplate from '@comp/base/template/ActionTemplate.vue';
import FlatButton from '@comp/base/button/FlatButton.vue'
import FlatInput from '@comp/base/input/FlatInput.vue'
import FlatMarkdown from '@comp/base/input/FlatMarkdown.vue';
import TCheckBox from '@comp/base/checkbox/TCheckBox.vue';
import { forTouchTip } from '@modules/mention/dialog-mention';
import { touchChannel } from '@modules/channel/channel-core';
import PluginIcon from '@comp/plugin/PluginIcon.vue';
import { getNpmVersion, checkGlobalPackageExist } from '@talex-touch/utils/common/env-tool'
import { spawn } from 'child_process'

const arrow = ref()
const toggleNewPlugin = inject('toggleNewPlugin')
onMounted(() => {
  toggleNewPlugin(arrow.value)

  envCheck()
})

const plugin = reactive({
  template: false,
  name: "",
  desc: "",
  version: "0.0.1",
  icon: {
    type: "class",
    value: "i-ri-remixicon-line"
  },
  dev: {
    enable: computed(() => plugin.dev.address),
    address: ""
  },
  readme: "# Demo Plugin.",
  openInVSC: false,
  agreement: false
})

const envOptions = reactive < {
  node: any,
  degit: any
}> ({})

async function envCheck() {
  const res = await getNpmVersion()
  if (!res) {
    return envOptions.node = {
      msg: "Cannot find node.js, please install it first.", type: "error"
    }
  }

  // not less than 8
  const nodeVersion = res.split(".").map(Number)
  if (nodeVersion[0] < 8) {
    return envOptions.node = {
      msg: "Node.js version is too low, please upgrade it to 8 or higher.", type: "error"
    }
  }

  envOptions.node = {
      type: 'success',
      version: nodeVersion
  }

  const degit = await checkGlobalPackageExist("degit")
  if (!degit) {
    return envOptions.degit = {
      msg: "Cannot find degit, please install it first.", type: "error"
    }
  }

  return Object.assign(envOptions, {
    degit: {
      type: 'success',
      ...degit
    }
  })
}

function createAction(ctx) {
  const { checkForm, setLoading } = ctx

  const result = checkForm()

  if (!result) return

  if (!plugin.agreement) {
    return forTouchTip("Attention", "You must agree with <i style='color: #4E94B0'>Touch Plugin Development</i> protocol.")
  }

  setLoading(true)

  touchChannel.send('plugin:new', plugin)

}

function handleInstallDegit() {
  console.log('hi')

  spawn('cmd', [], {
    shell: true,
    detached: true
  })
}
</script>

<template>
  <FormTemplate contentStyle="width: calc(100% - 5rem);height: calc(100% - 10rem)">
    <template #header>
      <div items-center flex>
        <div px-1 @click="toggleNewPlugin" ref="arrow" op-0
          class="i-ri-arrow-left-s-line hover-button fake-background transition-cubic" />
        <p my-4 font-extrabold text-2xl>New Plugin</p>
      </div>
      <span block text="base" op-75 font-normal>Create a new plugin.</span>
    </template>

    <BlockTemplate>
      <template #title>
        Templates
        <span>
          <span color="green-2" v-if="envOptions.node?.type ==='success'">
            <span relative top=".5" inline-block i-ri-nodejs-fill />{{ envOptions.node?.version.join('.') }}
          </span>
          <span color="red-4" v-else>
            <span relative top=".5" inline-block i-ri-nodejs-fill />{{ envOptions.node?.msg }}
          </span>

          <span mr-2 />

          <span color="green-2" v-if="envOptions.degit?.type ==='success'">
            <span relative top=".5" inline-block i-ri-git-branch-fill />{{ envOptions.degit?.version }}
          </span>
          <span @click="handleInstallDegit" border-round pl-1 pr-1 select-none cursor-pointer v-wave color="red-4" v-else>
            <span relative top=".5" inline-block i-ri-git-branch-fill /> Install
          </span>
        </span>
      </template>
      <BrickTemplate>
        <p>
          <div inline-block mr-2 class="i-simple-icons-vuedotjs" />
        </p>
        <span block text-xs>
          Contains default dev-env, with using Vue3 and Vite.
        </span>
        <button text-xs cursor-pointer bg-transparent class="color-template fake-background" border-solid border rounded
          px-2 py-1 my-2>Download</button>
      </BrickTemplate>
      <BrickTemplate>
        <p>
          <div inline-block mr-2 class="i-simple-icons-react" />
        </p>
        <span block text-xs>
          Contains default dev-env, with using React18 and Vite.
        </span>
        <button text-xs cursor-pointer bg-transparent class="color-template fake-background" border-solid border rounded
          px-2 py-1 my-2>Download</button>
      </BrickTemplate>
      <BrickTemplate>
        <p>
          <div inline-block mr-2 class="i-simple-icons-svelte" />
        </p>
        <span block text-xs>
          Contains default dev-env, with using Svelte3 and Vite.
        </span>
        <button text-xs cursor-pointer bg-transparent class="color-template fake-background" border-solid border rounded
          px-2 py-1 my-2>Download</button>
      </BrickTemplate>
    </BlockTemplate>

    <BlockTemplate title="General">
      <LineTemplate :msg="() => 'You must input the correct plugin name.'"
        regex='^[^\\\\/:*?"<>|]+(\\.[^\\\\/:*?"<>|]+)*$' title="name">
        <FlatInput w="48!" v-model="plugin.name" />
      </LineTemplate>
      <LineTemplate title="icon">
        <FlatInput w="48!" v-model="plugin.icon.value">
          <div h-full :class="plugin.icon.value" />
        </FlatInput>
      </LineTemplate>
      <LineTemplate :msg="() => 'You must input the correct plugin version.'" regex="^(\d+\.)(\d+\.)(\*|\d+)$"
        title="version">
        <FlatInput w="48!" v-model="plugin.version" />
      </LineTemplate>
      <LineTemplate :msg="() => 'You must input the correct plugin dev address.'"
        regex="^(?:([A-Za-z]+):)?(\/{0,3})([0-9.\-A-Za-z]+)(?::(\d+))?(?:\/([^?#]*))?(?:\?([^#]*))?(?:#(.*))?$"
        title="dev-address">
        <FlatInput w="48!" v-model="plugin.dev.address" />
      </LineTemplate>
      <!-- regex="^(?=.*[a-zA-Z]{1,})(?=.*[\d]{0,})[a-zA-Z0-9]{15,80}$" -->
      <LineTemplate :msg="() => 'You must input the correct plugin description.'" title="description">
        <FlatInput :area="true" w="96!" v-model="plugin.desc" />
      </LineTemplate>
    </BlockTemplate>

    <BlockTemplate title="Readme">
      <FlatMarkdown v-model="plugin.readme" />

    </BlockTemplate>

    <BlockTemplate title="Actions">
      <TCheckBox text-sm v-model=plugin.openInVSC>Open in <i>
          <div inline-block style="width: 16px" class="i-simple-icons-visualstudio" />VSCode
        </i></TCheckBox>
      <TCheckBox text-sm v-model=plugin.agreement>Agree with <i>Touch Plugin Development</i></TCheckBox>
      <div flex relative mt-8 gap-4 w-4>
        <FlatButton hover:bg-red>
          Cancel
        </FlatButton>
        <ActionTemplate :action="createAction">
          <FlatButton :primary="true">
            Create
          </FlatButton>
        </ActionTemplate>
      </div>

    </BlockTemplate>
  </FormTemplate>
</template>

<style scoped lang="scss"></style>