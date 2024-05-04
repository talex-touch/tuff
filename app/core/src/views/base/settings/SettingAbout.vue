<script setup lang="ts" name="SettingUser">
import { $t } from "@modules/lang";
import TBlockLine from "@comp/base/group/TBlockLine.vue";
import TGroupBlock from "@comp/base/group/TGroupBlock.vue";
import OSIcon from "@comp/icon/OSIcon.vue";
import { useCPUUsage, useMemoryUsage } from "@modules/hooks/env-hooks";

const props = defineProps({
  env: {
    type: Object,
    required: true,
  },
  dev: {
    type: Boolean,
    required: true,
  },
});

const appUpdate = ref();

onMounted(() => {
  appUpdate.value = window.$startupInfo.appUpdate;
});

const versionStr = computed(
  () => `TalexTouch ${props.dev ? "Dev" : "Master"} ${props.env.packageJson?.version}`
);
const startCosts = computed(
  () => props.env.sui && (props.env.sui.t.e - props.env.sui.t.s) / 1000
);

const cpuUsage = useCPUUsage();
const memoryUsage = useMemoryUsage();

onBeforeUnmount(() => {
  cpuUsage[1]();
  memoryUsage[1]();
});
</script>

<template>
  <t-group-block v-if="env.process" name="Application specification (Touch)" icon="apps">
    <t-block-line title="Version">
      <template #description>
        {{ versionStr }}
        <span
          v-if="appUpdate"
          class="tag"
          style="color: #fea113; font-weight: 600; cursor: pointer"
        >
          New!
        </span>
        <span v-else class="tag" style="color: #6d8b51"> Latest </span>
      </template>
    </t-block-line>
    <t-block-line title="Specification" description="24H5 T2"></t-block-line>
    <t-block-line title="Start Costs">
      <template #description>
        {{ startCosts }}s
        <span class="tag" style="color: var(--el-color-success)" v-if="startCosts < 1">
          Perfect
        </span>
        <span
          class="tag"
          style="color: var(--el-color-warning)"
          v-else-if="startCosts < 2"
        >
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
    <t-block-line
      title="Electron"
      :description="env.process.versions?.electron"
    ></t-block-line>
    <t-block-line
      title="V8 Engine"
      :description="env.process.versions?.v8"
    ></t-block-line>
    <t-block-line title="OS">
      <template #description>
        <span indent-1 flex items-center>
          <OSIcon ml-8 :os="env.os.version" />
          {{ env.os.version }}
        </span>
      </template>
    </t-block-line>
    <t-block-line
      title="Platform"
      :description="`${env.process.platform} (${env.os.arch})`"
    ></t-block-line>
    <t-block-line
      title="Experience"
      description="Touch Feature Experience Pack 2024.05.04"
    ></t-block-line>
    <t-block-line title="CPU Usage">
      <template #description>
        <span
          :data-text="`${Math.round(cpuUsage[0].value.percentCPUUsage * 10000) / 100}%`"
          class="Usage"
          :style="`--color: var(--el-color-danger);--percent: ${
            cpuUsage[0].value.percentCPUUsage * 100
          }%`"
        >
        </span>
      </template>
    </t-block-line>
    <!-- <t-block-line :title="$t('settings.application.list-settings.specifications.gpu-usage')"
      description="Touch Feature Experience Pack 2023.02.21"></t-block-line> -->
    <t-block-line title="Mem Usage">
      <template #description>
        <span
          :data-text="`${
            Math.round(
              (memoryUsage[0].value.heapUsed / memoryUsage[0].value.heapTotal) * 10000
            ) / 100
          }%`"
          class="Usage"
          :style="`--color: var(--el-color-primary);--percent: ${
            (memoryUsage[0].value.heapUsed / memoryUsage[0].value.heapTotal) * 100
          }%`"
        >
        </span>
      </template>
    </t-block-line>
    <t-block-line :title="`TalexTouch Terms of Service`" :link="true"></t-block-line>
    <t-block-line :title="`TalexTouch Software License`" :link="true"></t-block-line>
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
