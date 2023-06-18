<script setup lang="ts" name="SettingUser">
import { $t } from '@modules/lang'
import TBlockLine from '@comp/base/group/TBlockLine.vue';
import TGroupBlock from '@comp/base/group/TGroupBlock.vue'

const props = defineProps({
  env: {
    type: Object,
    required: true
  },
  dev: {
    type: Boolean,
    required: true
  }
})

const versionStr = computed(() => `TalexTouch ${props.dev ? $t('version.dev') : 'version.master'} ${props.env.packageJson?.version}`)
const startCosts = computed(() => props.env.sui && (props.env.sui.t.e - props.env.sui.t.s) / 1000)

</script>

<template>
  <t-group-block v-if="env.process" :name="`${$t('settings.application.list-settings.specifications.name')} (Touch)`" icon="apps">
    <t-block-line :title="$t('settings.application.list-settings.specifications.version')"
      :description="versionStr"></t-block-line>
    <t-block-line :title="$t('settings.application.list-settings.specifications.specifications')"
      description="23H6 T1"></t-block-line>
    <t-block-line :title="$t('settings.application.list-settings.specifications.time')">
      <template #description>
        {{ startCosts }}s
        <span class="tag" style="color: var(--el-color-success)" v-if="startCosts < 1">
          Perfect
        </span>
        <span class="tag" style="color: var(--el-color-warning)" v-else-if="startCosts < 2">
          Good
        </span>
        <span class="tag" style="color: var(--el-color-error)" v-else-if="startCosts < 5">
          Bad
        </span>
        <span class="tag" style="color: var(--el-color-error); font-weight: 600" v-else>
          Slowly
        </span>
      </template>
    </t-block-line>
    <t-block-line title="Electron" :description="env.process.versions?.electron"></t-block-line>
    <t-block-line title="V8-Engine" :description="env.process.versions?.v8"></t-block-line>
    <t-block-line :title="$t('settings.application.list-settings.specifications.os')"
      :description="env.os.version"></t-block-line>
    <t-block-line :title="$t('settings.application.list-settings.specifications.platform')"
      :description="`${env.process.platform} (${env.os.arch})`"></t-block-line>
    <t-block-line :title="$t('settings.application.list-settings.specifications.experience')"
      description="Touch Feature Experience Pack 2023.06.14"></t-block-line>
    <t-block-line :title="`TalexTouch ${$t('protocol.service')}`" :link="true"></t-block-line>
    <t-block-line :title="`TalexTouch ${$t('protocol.software')}`" :link="true"></t-block-line>
  </t-group-block>
</template>