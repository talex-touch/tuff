<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useTheme } from '~/composables/useTheme'

const { color, toggleDark } = useTheme()
const isMounted = ref(false)

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

onMounted(() => {
  isMounted.value = true
})
</script>

<template>
  <TuffSwitch v-if="isMounted" :model-value="isDark" @change="handleToggle" />
  <div
    v-else
    class="tuff-switch DarkToggle-Placeholder"
    aria-hidden="true"
  >
    <span class="tuff-switch__thumb" />
  </div>
</template>
