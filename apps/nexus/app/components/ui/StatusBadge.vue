<script setup lang="ts">
import { TxStatusBadge } from '@talex-touch/tuffex'

const props = withDefaults(
  defineProps<{
    text: string
    status?: 'success' | 'warning' | 'danger' | 'info' | 'muted'
    statusKey?: 'granted' | 'denied' | 'notDetermined' | 'unsupported'
    size?: 'sm' | 'md'
    icon?: string
    os?: 'macos' | 'windows' | 'linux'
    osOnly?: boolean
  }>(),
  {
    text: '',
    status: undefined,
    statusKey: '',
    size: 'md',
    icon: '',
    os: undefined,
    osOnly: false,
  },
)

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void
}>()
</script>

<template>
  <TxStatusBadge
    :text="text"
    :status="status"
    :status-key="statusKey"
    :size="size"
    :icon="icon"
    :os="os"
    :os-only="osOnly"
    v-bind="$attrs"
    @click="(event) => emit('click', event)"
  />
</template>