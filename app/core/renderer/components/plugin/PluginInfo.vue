<template>
  <div class="PluginInfo-Container">
    <plugin-status :plugin="plugin" />

    <FormTemplate contentStyle="width: calc(100% - 5rem);height: calc(100% - 15rem)">
      <template #header>
        <div grid gap-4 grid-cols-8 items-center>
          <div col-span-6>
            <p my-4 font-extrabold text-2xl>
              {{ plugin.name }}
            </p>
            <span block text="base" op-75 font-normal>{{ plugin.desc }}</span>
          </div>

          <FlatButton h-5 w-2 @click="handleExport" class="plugin-export" v-if="plugin.dev?.enable">
            Export
          </FlatButton>
        </div>
      </template>
      <BlockTemplate title="Overview">
        <LineTemplate title="dev">
          <span text-sm v-if="plugin.dev?.enable" class="plugin-dev">{{ $t('version.dev') }}</span>
          <span v-else>-</span>
        </LineTemplate>
        <LineTemplate title="version">
          {{ plugin.version }}
        </LineTemplate>
        <LineTemplate v-if="plugin.dev" title="address">
          <a :href="plugin.dev.address">{{ plugin.dev.address }}</a>
        </LineTemplate>
      </BlockTemplate>

      <BlockTemplate v-if="platforms" title="Environment">
        <LineTemplate v-for="(platform, index) in platforms" :class="{ enable: platform?.enable }" :key="index" :title="index">
          <el-tag v-for="(tag, index) in platform.os" :key="index" size="mini" type="primary">{{ tag }}</el-tag>
           <el-tag v-for="(tag, index) in platform.arch" :key="index" size="mini" type="info">{{ tag }}</el-tag>
        </LineTemplate>
      </BlockTemplate>


      <BlockTemplate :style="`padding-right: 1.25rem`" v-if="plugin.readme" title="Readme">
        <FlatMarkdown :readonly="true" v-model="readme" />
      </BlockTemplate>
    </FormTemplate>
  </div>
</template>

<script lang="ts" name="PluginInfo" setup>
import PluginStatus from '@comp/plugin/action/PluginStatus.vue'
import FlatButton from "@comp/base/button//FlatButton.vue";
import FlatMarkdown from "@comp/base/input/FlatMarkdown.vue";
import FormTemplate from '@comp/base/template/FormTemplate.vue'
import BlockTemplate from '@comp/base/template/BlockTemplate.vue'
import LineTemplate from '@comp/base/template/LineTemplate.vue'
import { popperMention } from '@modules/mention/dialog-mention'
import type { ITouchPlugin, IPlatform } from '@talex-touch/utils/plugin'
import { useEnv } from '@modules/hooks/env-hooks'

const props = defineProps({
  plugin: {
    type: Object as PropType<ITouchPlugin>,
    required: true
  }
})

const env = useEnv()
const platforms = computed<IPlatform>(() => props.plugin?.platforms || {})
const readme = computed<string>(() => props.plugin.readme)

async function handleExport() {
  await popperMention("Attention", "The export is abandoned\nSee our docs for more information!")
}
</script>

<style lang="scss" scoped>
.plugin-dev {
  display: inline;
  padding: 4px 8px;

  width: max-content;

  color: #eee;

  box-sizing: border-box;
  border-radius: 4px;
  background-color: black;
}
</style>