<script setup lang="ts">
import { computed } from 'vue'
import { useTheme } from '~/composables/useTheme'

const { color, toggleDark } = useTheme()

useHead({
  meta: [{
    id: 'theme-color',
    name: 'theme-color',
    content: () => color.value === 'dark' ? '#222222' : '#ffffff',
  }],
})

const isDark = computed(() => color.value === 'dark')

function handleToggle(value: boolean) {
  toggleDark(value ? 'dark' : 'light')
}
</script>

<template>
  <TuffSwitch :model-value="isDark" @change="handleToggle" />
</template>
