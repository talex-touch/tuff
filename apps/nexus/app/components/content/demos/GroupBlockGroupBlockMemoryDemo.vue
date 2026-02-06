<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const autoUpdate = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxGroupBlock
          name="更新策略"
          description="记忆展开状态"
          default-icon="i-ri-refresh-line"
          active-icon="i-ri-refresh-line"
          memory-name="tx-group-block-demo"
        >
          <TxBlockSwitch
            v-model="autoUpdate"
            title="自动更新"
            description="后台自动检查更新"
            default-icon="i-ri-refresh-line"
            active-icon="i-ri-refresh-line"
          />
        </TxGroupBlock>
  </div>
  <div v-else>
        <TxGroupBlock
          name="更新策略"
          description="记忆展开状态"
          default-icon="i-ri-refresh-line"
          active-icon="i-ri-refresh-line"
          memory-name="tx-group-block-demo"
        >
          <TxBlockSwitch
            v-model="autoUpdate"
            title="自动更新"
            description="后台自动检查更新"
            default-icon="i-ri-refresh-line"
            active-icon="i-ri-refresh-line"
          />
        </TxGroupBlock>
  </div>
</template>
