<!--
  SettingTools Component

  Displays utility settings in the settings page.
  Allows users to configure shortcuts, auto-paste, auto-clear, and auto-hide features.
-->
<script setup lang="ts" name="SettingTools">
import type { Shortcut } from '@talex-touch/utils/common/storage/entity/shortcut-settings'

import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import FlatKeyInput from '~/components/base/input/FlatKeyInput.vue'
import TSelectItem from '~/components/base/select/TSelectItem.vue'
import TuffBlockSelect from '~/components/tuff/TuffBlockSelect.vue'
// Import UI components
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'

import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { shortconApi } from '~/modules/channel/main/shortcon'
// Import application settings
import { appSetting } from '~/modules/channel/storage'

// Define component props

const { t } = useI18n()

// Reactive reference for shortcut key binding
const shortcuts = ref<Shortcut[] | null>(null)

onMounted(async () => {
  shortcuts.value = await shortconApi.getAll()
})

async function updateShortcut(id: string, newAccelerator: string): Promise<void> {
  if (!id || !newAccelerator) return
  const shortcutList = shortcuts.value
  const target = shortcutList?.find((item) => item.id === id)
  const previousValue = target?.accelerator

  if (target) {
    target.accelerator = newAccelerator
  }

  const success = await shortconApi.update(id, newAccelerator)
  if (!success && target && previousValue) {
    target.accelerator = previousValue
  }
}

function getShortcutLabel(id: string): string {
  const normalized = id.replace(/[.\-]/g, '_')
  const key = `settingTools.shortcutLabels.${normalized}`
  const translated = t(key)
  return translated === key ? id : translated
}
</script>

<!--
  SettingTools Component Template

  Displays utility settings in a structured layout with switches, slots, and selects.
-->
<template>
  <!-- Utilities group block -->
  <TuffGroupBlock
    :name="t('settingTools.groupTitle')"
    :description="t('settingTools.groupDesc')"
    default-icon="i-carbon-app-switcher"
    active-icon="i-carbon-application"
    memory-name="setting-tools"
  >
    <!-- Beginner usage guide switch -->
    <TuffBlockSwitch
      v-model="appSetting.beginner.init"
      :title="t('settingTools.usage')"
      :description="t('settingTools.usageDesc')"
      default-icon="i-carbon-book"
      active-icon="i-carbon-book"
    />

    <!-- Shortcut key configuration slot -->
    <template v-if="shortcuts">
      <TuffBlockSlot
        v-for="shortcut in shortcuts"
        :key="shortcut.id"
        :title="getShortcutLabel(shortcut.id)"
        :description="t('settingTools.shortcutDesc', { shortcut: getShortcutLabel(shortcut.id) })"
        default-icon="i-carbon-keyboard"
        active-icon="i-carbon-keyboard"
      >
        <FlatKeyInput
          :model-value="shortcut.accelerator"
          @update:model-value="(newValue) => updateShortcut(shortcut.id, String(newValue))"
        />
      </TuffBlockSlot>
    </template>

    <!-- Auto paste time selection -->
    <TuffBlockSelect
      v-model="appSetting.tools.autoPaste.time"
      :title="t('settingTools.autoPaste')"
      :description="t('settingTools.autoPasteDesc')"
      default-icon="i-carbon-copy"
      active-icon="i-carbon-copy"
    >
      <TSelectItem :model-value="-1">
        {{ t('settingTools.disabled') }}
      </TSelectItem>
      <TSelectItem :model-value="0">
        {{ t('settingTools.noLimit') }}
      </TSelectItem>
      <TSelectItem :model-value="15"> 15 {{ t('settingTools.sec') }} </TSelectItem>
      <TSelectItem :model-value="30"> 30 {{ t('settingTools.sec') }} </TSelectItem>
      <TSelectItem :model-value="60"> 1 {{ t('settingTools.min') }} </TSelectItem>
      <TSelectItem :model-value="180"> 3 {{ t('settingTools.min') }} </TSelectItem>
      <TSelectItem :model-value="300"> 5 {{ t('settingTools.min') }} </TSelectItem>
      <TSelectItem :model-value="600"> 10 {{ t('settingTools.min') }} </TSelectItem>
      <TSelectItem :model-value="750"> 15 {{ t('settingTools.min') }} </TSelectItem>
    </TuffBlockSelect>

    <!-- Auto clear time selection -->
    <TuffBlockSelect
      v-model="appSetting.tools.autoClear"
      :title="t('settingTools.autoClear')"
      :description="t('settingTools.autoClearDesc')"
      default-icon="i-carbon-erase"
      active-icon="i-carbon-erase"
    >
      <TSelectItem :model-value="-1">
        {{ t('settingTools.disabled') }}
      </TSelectItem>
      <TSelectItem :model-value="0">
        {{ t('settingTools.noLimit') }}
      </TSelectItem>
      <TSelectItem :model-value="15"> 15 {{ t('settingTools.sec') }} </TSelectItem>
      <TSelectItem :model-value="30"> 30 {{ t('settingTools.sec') }} </TSelectItem>
      <TSelectItem :model-value="60"> 1 {{ t('settingTools.min') }} </TSelectItem>
      <TSelectItem :model-value="180"> 3 {{ t('settingTools.min') }} </TSelectItem>
      <TSelectItem :model-value="300"> 5 {{ t('settingTools.min') }} </TSelectItem>
      <TSelectItem :model-value="600"> 10 {{ t('settingTools.min') }} </TSelectItem>
      <TSelectItem :model-value="750"> 15 {{ t('settingTools.min') }} </TSelectItem>
    </TuffBlockSelect>

    <!-- Auto hide switch -->
    <TuffBlockSwitch
      v-model="appSetting.tools.autoHide"
      :title="t('settingTools.autoHide')"
      :description="t('settingTools.autoHideDesc')"
      default-icon="i-carbon-view-off"
      active-icon="i-carbon-view-off"
    />

    <!-- Dashboard switch -->
    <TuffBlockSwitch
      v-model="appSetting.dashboard.enable"
      :title="t('settingTools.dashboard')"
      :description="t('settingTools.dashboardDesc')"
      default-icon="i-carbon-dashboard"
      active-icon="i-carbon-dashboard"
    />

    <!-- Search Engine Logs switch -->
    <TuffBlockSwitch
      v-model="appSetting.searchEngine.logsEnabled"
      :title="t('settingTools.searchEngineLogs')"
      :description="t('settingTools.searchEngineLogsDesc')"
      default-icon="i-carbon-warning-alt"
      active-icon="i-carbon-warning-alt"
    />

    <!-- Recommendation Enabled switch -->
    <TuffBlockSwitch
      v-model="appSetting.recommendation.enabled"
      :title="t('settingTools.recommendationEnabled')"
      :description="t('settingTools.recommendationEnabledDesc')"
      default-icon="i-carbon-star"
      active-icon="i-carbon-star-filled"
    />

    <!-- Recommendation Show Reason switch -->
    <TuffBlockSwitch
      v-model="appSetting.recommendation.showReason"
      :title="t('settingTools.recommendationShowReason')"
      :description="t('settingTools.recommendationShowReasonDesc')"
      default-icon="i-carbon-information"
      active-icon="i-carbon-information-filled"
    />

    <!-- Recommendation Max Items select -->
    <TuffBlockSelect
      v-model="appSetting.recommendation.maxItems"
      :title="t('settingTools.recommendationMaxItems')"
      :description="t('settingTools.recommendationMaxItemsDesc')"
      default-icon="i-carbon-list"
      active-icon="i-carbon-list"
    >
      <TSelectItem :model-value="5">5</TSelectItem>
      <TSelectItem :model-value="10">10</TSelectItem>
      <TSelectItem :model-value="15">15</TSelectItem>
      <TSelectItem :model-value="20">20</TSelectItem>
    </TuffBlockSelect>
  </TuffGroupBlock>

  <!-- Animation settings group block -->
  <TuffGroupBlock
    :name="t('settingTools.animationGroupTitle')"
    :description="t('settingTools.animationGroupDesc')"
    default-icon="i-carbon-rocket"
    active-icon="i-carbon-rocket"
    memory-name="setting-animation"
  >
    <!-- List item stagger animation switch -->
    <TuffBlockSwitch
      v-model="appSetting.animation.listItemStagger"
      :title="t('settingTools.listItemStagger')"
      :description="t('settingTools.listItemStaggerDesc')"
      default-icon="i-carbon-fade"
      active-icon="i-carbon-fade"
    />

    <!-- Result transition animation switch -->
    <TuffBlockSwitch
      v-model="appSetting.animation.resultTransition"
      :title="t('settingTools.resultTransition')"
      :description="t('settingTools.resultTransitionDesc')"
      default-icon="i-carbon-transition"
      active-icon="i-carbon-transition"
    />
  </TuffGroupBlock>
</template>
