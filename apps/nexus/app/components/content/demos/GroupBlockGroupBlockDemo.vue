<script setup lang="ts">
import { TxBlockLine, TxBlockSlot, TxBlockSwitch, TxGroupBlock } from '@talex-touch/tuffex/group-block'
import { TuffSelectItem, TxSelect } from '@talex-touch/tuffex/select'
import { computed, ref } from 'vue'

const { locale } = useI18n()
const language = ref<'en' | 'zh'>('en')
const notifications = ref(true)

const labels = computed(() => locale.value === 'zh'
  ? {
      title: '通用设置',
      description: '配置基本选项',
      notifications: '通知',
      notificationsDesc: '启用推送通知',
      language: '语言',
      languageDesc: '选择显示语言',
      languagePlaceholder: '选择语言',
      english: 'English',
      chinese: '中文',
      version: '版本',
      versionValue: '2.4.13-beta.3',
    }
  : {
      title: 'Preferences',
      description: 'Application options',
      notifications: 'Notifications',
      notificationsDesc: 'Enable desktop notifications',
      language: 'Language',
      languageDesc: 'Display language',
      languagePlaceholder: 'Select language',
      english: 'English',
      chinese: 'Chinese',
      version: 'Version',
      versionValue: '2.4.13-beta.3',
    })
</script>

<template>
  <div class="group-block-showcase">
    <TxGroupBlock
      :name="labels.title"
      default-icon="i-ri-settings-3-line"
      active-icon="i-ri-settings-3-fill"
      :description="labels.description"
    >
      <TxBlockSwitch
        v-model="notifications"
        :title="labels.notifications"
        :description="labels.notificationsDesc"
        default-icon="i-ri-notification-line"
        active-icon="i-ri-notification-fill"
      />
      <TxBlockSlot :title="labels.language" :description="labels.languageDesc" default-icon="i-carbon-translate">
        <TxSelect v-model="language" :placeholder="labels.languagePlaceholder" class="group-block-showcase__select">
          <TuffSelectItem value="en" :label="labels.english" />
          <TuffSelectItem value="zh" :label="labels.chinese" />
        </TxSelect>
      </TxBlockSlot>
      <TxBlockLine :title="labels.version" :description="labels.versionValue" />
    </TxGroupBlock>
  </div>
</template>

<style scoped>
.group-block-showcase {
  width: min(100%, 640px);
}

.group-block-showcase__select {
  width: 180px;
}
</style>
