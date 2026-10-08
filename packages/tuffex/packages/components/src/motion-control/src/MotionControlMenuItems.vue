<script setup lang="ts">
// Amicro source adaptations. MIT — Copyright (c) 2026 SYED  SUBHAN UDDIN.
import type { MotionControlItem } from './types'
import TxContextMenuItem from '../../context-menu/src/TxContextMenuItem.vue'
import TxContextMenuSubmenu from '../../context-menu/src/TxContextMenuSubmenu.vue'
import TxDropdownItem from '../../dropdown-menu/src/TxDropdownItem.vue'
import TxDropdownSubmenu from '../../dropdown-menu/src/TxDropdownSubmenu.vue'

defineOptions({ name: 'MotionControlMenuItems' })
defineProps<{ items: MotionControlItem[], context?: boolean, disabled?: boolean }>()
const emit = defineEmits<{ select: [item: MotionControlItem] }>()
</script>

<template>
  <template v-for="item in items" :key="item.value">
    <TxContextMenuSubmenu v-if="context && item.children?.length" :disabled="disabled || item.disabled" panel-background="pure">
      {{ item.label }}
      <template #menu>
        <MotionControlMenuItems :items="item.children" context :disabled="disabled" @select="emit('select', $event)" />
      </template>
    </TxContextMenuSubmenu>
    <TxDropdownSubmenu v-else-if="item.children?.length" :disabled="disabled || item.disabled" panel-background="pure">
      {{ item.label }}
      <template #menu>
        <MotionControlMenuItems :items="item.children" :disabled="disabled" @select="emit('select', $event)" />
      </template>
    </TxDropdownSubmenu>
    <TxContextMenuItem v-else-if="context" :disabled="disabled || item.disabled" :danger="item.danger" @select="emit('select', item)">
      <span v-if="item.icon" aria-hidden="true">{{ item.icon }}</span>
      {{ item.label }}
    </TxContextMenuItem>
    <TxDropdownItem v-else :disabled="disabled || item.disabled" :danger="item.danger" @select="emit('select', item)">
      <span v-if="item.icon" aria-hidden="true">{{ item.icon }}</span>
      {{ item.label }}
    </TxDropdownItem>
  </template>
</template>
