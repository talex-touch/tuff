<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const language = ref('')
const notifications = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxGroupBlock
          name="通用设置"
          default-icon="i-ri-settings-3-line"
          active-icon="i-ri-settings-3-fill"
          description="配置基本选项"
        >
          <TxBlockSwitch
            v-model="notifications"
            title="通知"
            description="启用推送通知"
            default-icon="i-ri-notification-line"
            active-icon="i-ri-notification-fill"
          />
          <TxBlockSlot title="语言" description="选择显示语言" default-icon="i-carbon-translate">
            <select v-model="language">
              <option value="en">
English
</option>
              <option value="zh">
中文
</option>
            </select>
          </TxBlockSlot>
        </TxGroupBlock>
  </div>
  <div v-else>
        <TxGroupBlock
          name="通用设置"
          default-icon="i-ri-settings-3-line"
          active-icon="i-ri-settings-3-fill"
          description="配置基本选项"
        >
          <TxBlockSwitch
            v-model="notifications"
            title="通知"
            description="启用推送通知"
            default-icon="i-ri-notification-line"
            active-icon="i-ri-notification-fill"
          />
          <TxBlockSlot title="语言" description="选择显示语言" default-icon="i-carbon-translate">
            <select v-model="language">
              <option value="en">
English
</option>
              <option value="zh">
中文
</option>
            </select>
          </TxBlockSlot>
        </TxGroupBlock>
  </div>
</template>
