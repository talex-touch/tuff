<!--
  SettingAbout Component

  Displays application information and specifications in the settings page.
  Shows version, build information, system specs, and resource usage.
-->
<script setup lang="ts" name="SettingUser">
import { useI18n } from 'vue-i18n'
import { ref, onMounted, computed } from 'vue'
import { useEnv } from '~/modules/hooks/env-hooks'
import { touchChannel } from '~/modules/channel/channel-core'
import { ElMessage, ElButton } from 'element-plus'

// Import UI components
import TBlockLine from '@comp/base/group/TBlockLine.vue'
import TGroupBlock from '@comp/base/group/TGroupBlock.vue'
import OSIcon from '~/components/icon/OSIcon.vue'

const { t } = useI18n()
const { packageJson, os, processInfo } = useEnv()

const appUpdate = ref(window.$startupInfo.appUpdate)
const sui = ref(window.$startupInfo)

const dev = ref(false)
const performanceSummary = ref<any>(null)
const showPerformanceDetails = ref(false)
const activeApp = ref<any>(null)
const loadingActiveApp = ref(false)

onMounted(async () => {
  dev.value = import.meta.env.MODE === 'development'

  // Load performance summary
  try {
    const summary = await touchChannel.send('analytics:get-summary')
    performanceSummary.value = summary
  } catch (error) {
    console.warn('Failed to load performance summary', error)
  }
})

// Get current active application
async function getActiveApplication() {
  loadingActiveApp.value = true
  try {
    const result = await touchChannel.send('system:get-active-app', { forceRefresh: true })
    if (result) {
      activeApp.value = result
      ElMessage.success('Successfully retrieved active application info')
    } else {
      ElMessage.warning('No active application detected')
      activeApp.value = null
    }
  } catch (error) {
    console.error('Failed to get active app', error)
    ElMessage.error('Failed to get active application')
    activeApp.value = null
  } finally {
    loadingActiveApp.value = false
  }
}

// Computed property for version string
const versionStr = computed(
  () => `TalexTouch ${dev.value ? 'Dev' : 'Master'} ${packageJson.value?.version}`
)

// Computed property for application start time
const startCosts = computed(() => sui.value && (sui.value.t.e - sui.value.t.s) / 1000)

// Export performance data
async function exportPerformanceData() {
  try {
    const data = await touchChannel.send('analytics:export')

    // Create a download link
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `startup-analytics-${Date.now()}.json`
    link.click()
    URL.revokeObjectURL(url)

    ElMessage.success(t('settingAbout.exportSuccess'))
  } catch (error) {
    console.error('Failed to export performance data', error)
    ElMessage.error(t('settingAbout.exportFailed'))
  }
}

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
  <t-group-block v-if="processInfo" :name="t('settingAbout.groupTitle')" icon="apps">
    <t-block-line :title="t('settingAbout.version')">
      <template #description>
        {{ versionStr }}
        <span
          v-if="appUpdate"
          class="tag"
          style="color: #fea113; font-weight: 600; cursor: pointer"
        >
          {{ t('settingAbout.new') }}
        </span>
        <span v-else class="tag" style="color: #6d8b51"> {{ t('settingAbout.latest') }} </span>
      </template>
    </t-block-line>
    <t-block-line :title="t('settingAbout.specification')" :description="`${currentQuarter}`"></t-block-line>
    <t-block-line :title="t('settingAbout.startCosts')">
      <template #description>
        {{ startCosts.toFixed(2) }}s
        <span v-if="startCosts < 1" class="tag" style="color: var(--el-color-success)">
          {{ t('settingAbout.perfect') }}
        </span>
        <span v-else-if="startCosts < 2" class="tag" style="color: var(--el-color-warning)">
          {{ t('settingAbout.good') }}
        </span>
        <span v-else-if="startCosts < 5" class="tag" style="color: var(--el-color-error)">
          {{ t('settingAbout.bad') }}
        </span>
        <span v-else class="tag" style="color: var(--el-color-error); font-weight: 600">
          {{ t('settingAbout.slowly') }}
        </span>
      </template>
    </t-block-line>
    <t-block-line
      v-if="performanceSummary"
      :title="t('settingAbout.performanceDetails')"
      :link="true"
      @click="showPerformanceDetails = !showPerformanceDetails"
    >
      <template #description>
        <span style="cursor: pointer; color: var(--el-color-primary)">
          {{ showPerformanceDetails ? t('settingAbout.hideDetails') : t('settingAbout.viewDetails') }}
        </span>
      </template>
    </t-block-line>
    <template v-if="showPerformanceDetails && performanceSummary">
      <t-block-line :title="t('settingAbout.mainProcessTime')">
        <template #description>
          {{ performanceSummary.mainProcessTime.toFixed(3) }}s
        </template>
      </t-block-line>
      <t-block-line :title="t('settingAbout.rendererTime')">
        <template #description>
          {{ performanceSummary.rendererTime.toFixed(3) }}s
        </template>
      </t-block-line>
      <t-block-line :title="t('settingAbout.modulesLoaded')">
        <template #description>
          {{ performanceSummary.moduleCount }}
        </template>
      </t-block-line>
      <t-block-line :title="t('settingAbout.performanceRating')">
        <template #description>
          <span
            :style="`color: ${
              performanceSummary.rating === 'excellent' ? 'var(--el-color-success)' :
              performanceSummary.rating === 'good' ? 'var(--el-color-warning)' :
              performanceSummary.rating === 'fair' ? 'var(--el-color-error)' :
              'var(--el-color-danger)'
            }`"
          >
            {{ t(`settingAbout.rating.${performanceSummary.rating}`) }}
          </span>
        </template>
      </t-block-line>
      <t-block-line
        :title="t('settingAbout.exportData')"
        :link="true"
        @click="exportPerformanceData"
      >
        <template #description>
          <span style="cursor: pointer; color: var(--el-color-primary)">
            {{ t('settingAbout.exportJson') }}
          </span>
        </template>
      </t-block-line>
    </template>
    <t-block-line :title="t('settingAbout.electron')" :description="processInfo.versions?.electron"></t-block-line>
    <t-block-line :title="t('settingAbout.v8')" :description="processInfo.versions?.v8"></t-block-line>
    <t-block-line :title="t('settingAbout.os')">
      <template #description>
        <span flex gap-0 items-center>
          <OSIcon ml-8 :os="os?.version" />
          <span>{{ os?.version }}</span>
        </span>
      </template>
    </t-block-line>
    <t-block-line
      :title="t('settingAbout.platform')"
      :description="`${processInfo.platform} (${os.value?.arch})`"
    ></t-block-line>
    <t-block-line
      :title="t('settingAbout.experience')"
      :description="`${t('settingAbout.experiencePack')} ${currentExperiencePack}`"
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
    <t-block-line :title="t('settingAbout.terms')" :link="true"></t-block-line>
    <t-block-line :title="t('settingAbout.license')" :link="true"></t-block-line>
  </t-group-block>

  <!-- System Information Section -->
  <t-group-block :name="'System Information'" icon="computer-line">
    <t-block-line :title="'Active Window Detection'" :link="true" @click="getActiveApplication">
      <template #description>
        <el-button
          type="primary"
          size="small"
          :loading="loadingActiveApp"
          @click.stop="getActiveApplication"
        >
          {{ loadingActiveApp ? 'Detecting...' : 'Get Active App' }}
        </el-button>
      </template>
    </t-block-line>

    <template v-if="activeApp">
      <t-block-line :title="'Application Name'">
        <template #description>
          <span style="font-weight: 600; color: var(--el-color-primary)">
            {{ activeApp.displayName || 'N/A' }}
          </span>
        </template>
      </t-block-line>

      <t-block-line :title="'Window Title'">
        <template #description>
          {{ activeApp.windowTitle || 'N/A' }}
        </template>
      </t-block-line>

      <t-block-line v-if="activeApp.bundleId" :title="'Bundle ID'">
        <template #description>
          {{ activeApp.bundleId }}
        </template>
      </t-block-line>

      <t-block-line v-if="activeApp.processId" :title="'Process ID'">
        <template #description>
          {{ activeApp.processId }}
        </template>
      </t-block-line>

      <t-block-line v-if="activeApp.executablePath" :title="'Executable Path'">
        <template #description>
          <span style="font-size: 11px; opacity: 0.8">
            {{ activeApp.executablePath }}
          </span>
        </template>
      </t-block-line>

      <t-block-line :title="'Platform'">
        <template #description>
          <span style="text-transform: capitalize">
            {{ activeApp.platform || 'Unknown' }}
          </span>
        </template>
      </t-block-line>

      <t-block-line v-if="activeApp.icon" :title="'Application Icon'">
        <template #description>
          <img
            :src="activeApp.icon"
            alt="App Icon"
            style="width: 24px; height: 24px; vertical-align: middle"
          />
        </template>
      </t-block-line>

      <t-block-line :title="'Last Updated'">
        <template #description>
          {{ new Date(activeApp.lastUpdated).toLocaleString() }}
        </template>
      </t-block-line>
    </template>

    <t-block-line v-else-if="!activeApp && !loadingActiveApp" :title="'Status'">
      <template #description>
        <span style="color: var(--el-color-info)">
          Click the button above to detect active application
        </span>
      </template>
    </t-block-line>
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
