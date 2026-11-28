<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AuthShell from '@/components/AuthShell.vue'
import ConsoleShell from '@/components/ConsoleShell.vue'

const route = useRoute()
const useAuthShell = computed(() => route.meta.shell === 'auth')
</script>

<template>
  <AuthShell v-if="useAuthShell">
    <RouterView />
  </AuthShell>
  <ConsoleShell v-else>
    <RouterView />
  </ConsoleShell>
</template>
