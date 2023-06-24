<script setup lang="ts" name="SettingUser">
import { $t } from '@modules/lang'
import TBlockLine from '@comp/base/group/TBlockLine.vue';
import TGroupBlock from '@comp/base/group/TGroupBlock.vue'
import OSIcon from '@comp/icon/OSIcon.vue'
import { useCPUUsage, useMemoryUsage } from '@modules/hooks/env-hooks';

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

const cpuUsage = useCPUUsage()
const memoryUsage = useMemoryUsage()

onBeforeUnmount(() => {
  cpuUsage[1]()
  memoryUsage[1]()
})
</script>

<template>
  <t-group-block v-if="env.process" :name="`${$t('settings.application.list-settings.specifications.name')} (Touch)`"
    icon="apps">
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
    <t-block-line title="V8 Engine" :description="env.process.versions?.v8"></t-block-line>
    <t-block-line :title="$t('settings.application.list-settings.specifications.os')">
      <template #description>
        <span indent-1 flex items-center>
          <OSIcon ml-8 :os="env.os.version" />
          {{ env.os.version }}
        </span>
      </template>
    </t-block-line>
    <t-block-line :title="$t('settings.application.list-settings.specifications.platform')"
      :description="`${env.process.platform} (${env.os.arch})`"></t-block-line>
    <t-block-line :title="$t('settings.application.list-settings.specifications.experience')"
      description="Touch Feature Experience Pack 2023.06.25"></t-block-line>
    <t-block-line :title="$t('settings.application.list-settings.specifications.cpu-usage')">
      <template #description>
        <span :data-text="`${Math.round(cpuUsage[0].value.percentCPUUsage * 10000) / 100}%`" class="Usage"
          :style="`--color: var(--el-color-danger);--percent: ${cpuUsage[0].value.percentCPUUsage * 100}%`">
        </span>
      </template>
    </t-block-line>
    <!-- <t-block-line :title="$t('settings.application.list-settings.specifications.gpu-usage')"
      description="Touch Feature Experience Pack 2023.02.21"></t-block-line> -->
    <t-block-line :title="$t('settings.application.list-settings.specifications.memory-usage')">
      <template #description>
        <span
          :data-text="`${Math.round((memoryUsage[0].value.heapUsed / memoryUsage[0].value.heapTotal) * 10000) / 100}%`"
          class="Usage"
          :style="`--color: var(--el-color-primary);--percent: ${(memoryUsage[0].value.heapUsed / memoryUsage[0].value.heapTotal) * 100}%`">
        </span>
      </template>
    </t-block-line>
    <t-block-line :title="`TalexTouch ${$t('protocol.service')}`" :link="true"></t-block-line>
    <t-block-line :title="`TalexTouch ${$t('protocol.software')}`" :link="true"></t-block-line>
  </t-group-block>
</template>

<style lang="scss">
.Usage {
  &:before {
    content: "";
    position: absolute;

    left: 0;
    top: 0;

    width: var(--percent, 100%);
    max-width: 100%;
    height: 100%;

    background-color: var(--color, var(--el-color-info));
    border-radius: 2px;
    transition: 1s linear;
  }
  &:after {
    content: attr(data-text);
    position: absolute;

    left: 80%;
  }
  position: relative;
  display: inline-block;

  //margin-left: 32px;

  width: 120px;
  height: 20px;

  border-radius: 4px;
  border: 1px solid var(--el-border-color);
}
</style>