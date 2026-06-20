<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useTheme } from '~/composables/useTheme'

const { color, toggleDark } = useTheme()
const { t } = useI18n()
const isMounted = ref(false)

useHead({
  meta: [{
    id: 'theme-color',
    name: 'theme-color',
    content: () => color.value === 'dark' ? '#222222' : '#ffffff',
  }],
})

const isDark = computed(() => color.value === 'dark')
const toggleLabel = computed(() => t(isDark.value ? 'ui.themeToggle.switchToLight' : 'ui.themeToggle.switchToDark'))

function handleToggle(value: boolean) {
  toggleDark(value ? 'dark' : 'light')
}

function toggleTheme() {
  handleToggle(!isDark.value)
}

onMounted(() => {
  isMounted.value = true
})
</script>

<template>
  <button
    v-if="isMounted"
    type="button"
    class="DarkToggle"
    :class="{ 'is-dark': isDark }"
    :aria-label="toggleLabel"
    :aria-pressed="isDark"
    @click="toggleTheme"
  >
    <span class="DarkToggle-Thumb" aria-hidden="true" />
  </button>
  <div v-else class="DarkToggle" aria-hidden="true">
    <span class="DarkToggle-Thumb" />
  </div>
</template>

<style scoped>
.DarkToggle {
  display: inline-flex;
  width: 44px;
  height: 34px;
  align-items: center;
  justify-content: flex-start;
  border: 0;
  border-radius: 999px;
  padding: 0 6px;
  background: rgba(242, 244, 247, 0.94);
  color: inherit;
  cursor: pointer;
  font: inherit;
  line-height: 1;
  transition:
    background-color 160ms ease,
    box-shadow 160ms ease;
}

.DarkToggle:hover,
.DarkToggle:focus-visible {
  background: rgba(236, 239, 244, 1);
  box-shadow: 0 0 0 3px rgba(20, 22, 24, 0.06);
}

.DarkToggle-Thumb {
  width: 22px;
  height: 22px;
  border-radius: 7px;
  background: #8c929d;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.28),
    0 1px 2px rgba(15, 23, 42, 0.08);
  transition:
    transform 180ms ease,
    background 180ms ease;
}

.DarkToggle.is-dark {
  justify-content: flex-start;
  background: rgba(33, 35, 37, 0.82);
}

.DarkToggle.is-dark .DarkToggle-Thumb {
  background: #d7dbdf;
}

.dark .DarkToggle {
  background: rgba(255, 255, 255, 0.1);
}

.dark .DarkToggle:hover,
.dark .DarkToggle:focus-visible {
  background: rgba(255, 255, 255, 0.15);
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.08);
}
</style>
