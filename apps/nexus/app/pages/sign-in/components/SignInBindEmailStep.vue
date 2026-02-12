<script setup lang="ts">
import { computed } from 'vue'
import { TxButton } from '@talex-touch/tuffex'
import Input from '~/components/ui/Input.vue'

const props = defineProps<{
  t: (key: string, fallback?: string) => string
  bindEmail: string
  bindLoading: boolean
}>()

const emit = defineEmits<{
  (e: 'update:bindEmail', value: string): void
  (e: 'bind'): void
  (e: 'skip'): void
}>()

const bindValue = computed({
  get: () => props.bindEmail,
  set: (value: string) => emit('update:bindEmail', value),
})
</script>

<template>
  <div class="auth-step">
    <Input v-model="bindValue" type="text" :placeholder="t('auth.email', '邮箱')" class="auth-input" />
    <TxButton class="auth-button auth-button--primary" size="lg" block :loading="bindLoading" @click="emit('bind')">
      {{ t('auth.bindEmailConfirm', '绑定邮箱') }}
    </TxButton>
    <TxButton class="auth-button auth-button--ghost" size="lg" block :loading="bindLoading" @click="emit('skip')">
      {{ t('auth.bindEmailSkip', '暂时跳过') }}
    </TxButton>
  </div>
</template>
