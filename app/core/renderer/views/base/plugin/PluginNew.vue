<script setup name="PluginNew">
import FormTemplate from '@comp/base/template/FormTemplate.vue';
import BlockTemplate from '@comp/base/template/BlockTemplate.vue';
import BrickTemplate from '@comp/base/template/BrickTemplate.vue';
import LineTemplate from '@comp/base/template/LineTemplate.vue';
import ActionTemplate from '@comp/base/template/ActionTemplate.vue';
import FlatButton from '@comp/base/button/FlatButton.vue'
import FlatInput from '@comp/base/input/FlatInput.vue'
import FlatMarkdown from '@comp/base/input/FlatMarkdown.vue';
import TCheckBox from '@comp/base/checkbox/TCheckBox.vue';

const arrow = ref()
const toggleNewPlugin = inject('toggleNewPlugin')
onMounted(() => {
  toggleNewPlugin(arrow.value)

})

const plugin = reactive({
  name: "",
  desc: "",
  version: "0.0.1",
  dev: {
    enable: computed(() => plugin.dev.address),
    address: ""
  },
  readme: "# Demo Plugin.",
  openInVSC: false,
  agreement: false
})

function createAction(ctx) {
  const { checkForm } = ctx

  const result = checkForm()

  if (!result) return
  
}
</script>

<template>
  <FormTemplate>
    <template #header>
      <div items-center flex>
        <div px-1 @click="toggleNewPlugin" ref="arrow" op-0
          class="i-ri-arrow-left-s-line hover-button fake-background transition-cubic" />
        <p my-4 font-extrabold text-2xl>New Plugin</p>
      </div>
      <span block text="base" op-75 font-normal>Create a new plugin.</span>
    </template>

    <BlockTemplate title="Templates">
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
      <LineTemplate :msg="() => 'You must input the correct plugin name.'" regex="^(?=.*[a-zA-Z]{1,})(?=.*[\d]{0,})[a-zA-Z0-9]{1,15}$" title="name">
        <FlatInput w="48!" v-model=plugin.name />
      </LineTemplate>
      <LineTemplate :msg="() => 'You must input the correct plugin version.'" regex="^(\d+\.)(\d+\.)(\*|\d+)$" title="version">
        <FlatInput w="48!" v-model=plugin.version />
      </LineTemplate>
      <LineTemplate :msg="() => 'You must input the correct plugin dev address.'" regex="^(?:([A-Za-z]+):)?(\/{0,3})([0-9.\-A-Za-z]+)(?::(\d+))?(?:\/([^?#]*))?(?:\?([^#]*))?(?:#(.*))?$" title="dev-address">
        <FlatInput w="48!" v-model=plugin.dev.address />
      </LineTemplate>
      <LineTemplate :msg="() => 'You must input the correct plugin description.'" regex="^(?=.*[a-zA-Z]{1,})(?=.*[\d]{0,})[a-zA-Z0-9]{15,80}$" title="description">
        <FlatInput :area="true" w="96!" v-model=plugin.desc />
      </LineTemplate>
    </BlockTemplate>

    <BlockTemplate title="Readme">
      <FlatMarkdown v-model=plugin.readme />

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