<script setup lang="ts">
import type { PermissionStateProps } from './types'
import { useSlots } from 'vue'
import { TxEmptyState } from '../../empty-state'

defineOptions({
  name: 'TxPermissionState',
})

const props = defineProps<PermissionStateProps>()
const slots = useSlots()
</script>

<template>
  <TxEmptyState v-slots="slots" v-bind="props" variant="permission" />
</template>
