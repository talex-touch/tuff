<script setup lang="ts">
import { TxBlockLine, TxBlockSlot, TxBlockSwitch, TxGroupBlock } from '@talex-touch/tuffex'
import { ref } from 'vue'

const notifications = ref(true)
const autoUpdate = ref(false)
</script>

<template>
  <div class="demo-group-block">
    <TxGroupBlock
      name="通用设置"
      description="配置基本选项"
      default-icon="i-carbon-settings"
      active-icon="i-carbon-settings-adjust"
    >
      <TxBlockSwitch
        v-model="notifications"
        title="通知"
        description="启用推送通知"
        default-icon="i-carbon-notification"
      />

      <TxBlockSlot
        title="语言"
        description="选择显示语言"
        default-icon="i-carbon-language"
      >
        <button class="demo-button">
          English
        </button>
      </TxBlockSlot>

      <TxBlockLine
        title="版本"
        description="1.0.0 (Build 20240315)"
      />

      <TxBlockLine
        title="检查更新"
        link
        @click="() => {}"
      />
    </TxGroupBlock>

    <TxGroupBlock
      name="高级选项"
      description="开发者设置"
      default-icon="i-carbon-code"
      :default-expand="false"
    >
      <TxBlockSwitch
        v-model="autoUpdate"
        title="自动更新"
        description="后台自动下载更新"
        default-icon="i-carbon-update-now"
      />
    </TxGroupBlock>
  </div>
</template>

<style scoped>
.demo-group-block {
  width: 100%;
  max-width: 600px;
}

.demo-button {
  padding: 4px 12px;
  border: 1px solid var(--tx-border-color, #dcdfe6);
  border-radius: 6px;
  background: transparent;
  font-size: 13px;
  cursor: pointer;
}
</style>
