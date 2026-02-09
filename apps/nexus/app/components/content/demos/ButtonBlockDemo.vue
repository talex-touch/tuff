<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()
const label = computed(() => (locale.value === 'zh' ? '块级按钮' : 'Block Button'))
</script>

<template>
  <div style="width: 260px;">
    <TxButton block variant="primary">
      {{ label }}
    </TxButton>
  </div>
</template>
