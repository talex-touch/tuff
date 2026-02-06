<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => (locale.value === 'zh'
  ? {
      default: '默认按钮',
      primary: '主按钮',
      secondary: '次级按钮',
      ghost: '幽灵按钮',
      danger: '危险按钮',
      success: '成功按钮',
      warning: '警告按钮',
      info: '信息按钮',
    }
  : {
      default: 'Default',
      primary: 'Primary',
      secondary: 'Secondary',
      ghost: 'Ghost',
      danger: 'Danger',
      success: 'Success',
      warning: 'Warning',
      info: 'Info',
    }))
</script>

<template>
  <div class="tuff-demo-row">
    <TxButton>{{ labels.default }}</TxButton>
    <TxButton variant="primary">
      {{ labels.primary }}
    </TxButton>
    <TxButton variant="secondary">
      {{ labels.secondary }}
    </TxButton>
    <TxButton variant="ghost">
      {{ labels.ghost }}
    </TxButton>
    <TxButton variant="danger">
      {{ labels.danger }}
    </TxButton>
    <TxButton variant="success">
      {{ labels.success }}
    </TxButton>
    <TxButton variant="warning">
      {{ labels.warning }}
    </TxButton>
    <TxButton variant="info">
      {{ labels.info }}
    </TxButton>
  </div>
</template>
