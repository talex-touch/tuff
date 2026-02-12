<script setup lang="ts">
import { TxButton } from '@talex-touch/tuffex'

withDefaults(defineProps<{
  backLabel?: string
}>(), {
  backLabel: 'Back',
})

const emit = defineEmits<{
  (e: 'back'): void
}>()
</script>

<template>
  <header class="auth-topbar">
    <TxButton variant="ghost" size="sm" @click="emit('back')">
      <span class="i-carbon-arrow-left" />
      <span>{{ backLabel }}</span>
    </TxButton>
    <LanguageToggle />
  </header>
</template>

<style scoped>
.auth-topbar {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  z-index: 40;
  pointer-events: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px 24px 0;
}
</style>
