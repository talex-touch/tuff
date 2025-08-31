<!--
  SettingAbout Component

  Displays application information and specifications in the settings page.
  Shows version, build information, system specs, and resource usage.
-->
<script setup lang="ts" name="SettingUser">
// Import UI components
import TBlockLine from '@comp/base/group/TBlockLine.vue'
import TGroupBlock from '@comp/base/group/TGroupBlock.vue'
import OSIcon from '~/components/icon/OSIcon.vue'

// Define component props
interface Props {
  env: any
  dev: boolean
}

const props = defineProps<Props>()

// Reactive reference for app update status
const appUpdate = ref()

// Lifecycle hook to initialize component
onMounted(() => {
  appUpdate.value = window.$startupInfo.appUpdate
})

// Computed property for version string
const versionStr = computed(
  () => `TalexTouch ${props.dev ? 'Dev' : 'Master'} ${props.env.packageJson?.version}`
)

// Computed property for application start time
const startCosts = computed(() => props.env.sui && (props.env.sui.t.e - props.env.sui.t.s) / 1000)

// Get CPU and memory usage hooks
// const cpuUsage: any = []
// const memoryUsage: any = []

// Computed property for current quarter based on build time
const currentQuarter = computed(() => {
  const now = new Date()
  const month = now.getMonth() + 1
  const quarter = Math.ceil(month / 3)

  return `${now.getFullYear() - 2000}H${month} T${quarter}`
})

// Computed property for current experience pack based on build time
const currentExperiencePack = computed(() => {
  const now = new Date()

  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')

  return `${now.getFullYear()}.${month}.${day}`
})
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
    <t-block-line title="Specification" :description="`${currentQuarter}`"></t-block-line>
    <t-block-line title="Start Costs">
      <template #description>
        {{ startCosts }}s
        <span v-if="startCosts < 1" class="tag" style="color: var(--el-color-success)">
          Perfect
        </span>
        <span v-else-if="startCosts < 2" class="tag" style="color: var(--el-color-warning)">
          Good
        </span>
        <span v-else-if="startCosts < 5" class="tag" style="color: var(--el-color-error)">
          Bad
        </span>
        <span v-else class="tag" style="color: var(--el-color-error); font-weight: 600">
          Slowly
        </span>
      </template>
    </t-block-line>
    <t-block-line title="Electron" :description="env.process.versions?.electron"></t-block-line>
    <t-block-line title="V8 Engine" :description="env.process.versions?.v8"></t-block-line>
    <t-block-line title="OS">
      <template #description>
        <span flex gap-0 items-center>
          <OSIcon ml-8 :os="env.os.version" />
          <span>{{ env.os.version }}</span>
        </span>
      </template>
    </t-block-line>
    <t-block-line
      title="Platform"
      :description="`${env.process.platform} (${env.os.arch})`"
    ></t-block-line>
    <t-block-line
      title="Experience"
      :description="`Touch Feature Experience Pack ${currentExperiencePack}`"
    ></t-block-line>
    <!-- <t-block-line title="CPU Usage">
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
    <t-block-line title="Mem Usage">
      <template #description>
        <span
          :data-text="`${
            Math.round((memoryUsage[0].value.heapUsed / memoryUsage[0].value.heapTotal) * 10000) /
            100
          }%`"
          class="Usage"
          :style="`--color: var(--el-color-primary);--percent: ${
            (memoryUsage[0].value.heapUsed / memoryUsage[0].value.heapTotal) * 100
          }%`"
        >
        </span>
      </template>
    </t-block-line> -->
    <t-block-line :title="`TalexTouch Terms of Service`" :link="true"></t-block-line>
    <t-block-line :title="`TalexTouch Software License`" :link="true"></t-block-line>
  </t-group-block>
</template>

<style lang="scss">
/** Usage visualization styles */
.Usage {
  /** Background fill for usage percentage */
  &:before {
    content: '';
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

  /** Text display for usage percentage */
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
