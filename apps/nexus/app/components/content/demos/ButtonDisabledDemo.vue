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
    }
  : {
      default: 'Default',
      primary: 'Primary',
      secondary: 'Secondary',
      ghost: 'Ghost',
      danger: 'Danger',
    }))
</script>

<template>
  <div class="tuff-demo-row">
    <TxButton disabled>
      {{ labels.default }}
    </TxButton>
    <TxButton variant="primary" disabled>
      {{ labels.primary }}
    </TxButton>
    <TxButton variant="secondary" disabled>
      {{ labels.secondary }}
    </TxButton>
    <TxButton variant="ghost" disabled>
      {{ labels.ghost }}
    </TxButton>
    <TxButton variant="danger" disabled>
      {{ labels.danger }}
    </TxButton>
  </div>
</template>
