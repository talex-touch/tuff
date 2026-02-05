<script setup lang="ts">
import { TxSpinner } from '@talex-touch/tuffex'

defineProps<{
  t: (key: string, fallback?: string) => string
}>()
</script>

<template>
  <div class="auth-step auth-success-step">
    <TxSpinner :size="26" />
    <p class="auth-success-title">
      {{ t('auth.signInSuccess', '登录成功') }}
    </p>
    <p class="auth-success-subtitle">
      {{ t('auth.signInSuccessSubtitle', '正在跳转...') }}
    </p>
  </div>
</template>

<style scoped>
.auth-success-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
}

.auth-success-title {
  font-size: 14px;
  font-weight: 600;
}

.auth-success-subtitle {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}
</style>
