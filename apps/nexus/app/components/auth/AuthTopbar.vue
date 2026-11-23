<script setup lang="ts">
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
    <button type="button" class="auth-topbar__back" @click="emit('back')">
      <span class="i-carbon-arrow-left" aria-hidden="true" />
      <span>{{ backLabel }}</span>
    </button>
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

.auth-topbar__back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: rgba(255, 255, 255, 0.85);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.16s ease, color 0.16s ease, border-color 0.16s ease;
}

.auth-topbar__back:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.auth-topbar__back:focus-visible {
  outline: 2px solid rgba(167, 139, 250, 0.75);
  outline-offset: 2px;
}
</style>
