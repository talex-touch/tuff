<script setup lang="ts">
import { computed } from 'vue'
import Switch from '~/components/ui/Switch.vue'
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
  <Switch
    :model-value="isDark"
    aria-label="Toggle theme"
    @change="handleToggle"
  />
</template>
