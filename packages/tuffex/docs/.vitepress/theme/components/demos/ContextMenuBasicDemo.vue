<script setup lang="ts">
import { ref } from 'vue'

const controlledOpen = ref(false)
const x = ref(0)
const y = ref(0)

function openAtCenter() {
  x.value = Math.round(window.innerWidth * 0.5)
  y.value = Math.round(window.innerHeight * 0.38)
  controlledOpen.value = true
}
</script>

<template>
  <div style="display: grid; gap: 12px; width: 520px;">
    <div style="display: flex; gap: 8px; align-items: center;">
      <TxButton type="primary" @click="openAtCenter">Open controlled menu</TxButton>
      <TxButton @click="controlledOpen = false">Close</TxButton>
    </div>

    <TxContextMenu
      v-model="controlledOpen"
      :x="x"
      :y="y"
      @open="() => {}"
    >
      <template #menu>
        <TxContextMenuItem @select="() => {}">Copy</TxContextMenuItem>
        <TxContextMenuItem @select="() => {}">Paste</TxContextMenuItem>
        <TxContextMenuItem danger @select="() => {}">Delete</TxContextMenuItem>
      </template>
    </TxContextMenu>

    <TxContextMenu>
      <template #trigger>
        <div
          style="
            width: 100%;
            padding: 24px;
            border: 1px dashed var(--tx-border-color);
            border-radius: 12px;
            user-select: none;
          "
        >
          Right click here (uncontrolled)
        </div>
      </template>

      <template #menu>
        <TxContextMenuItem @select="() => {}">Refresh</TxContextMenuItem>
        <TxContextMenuItem @select="() => {}">Rename</TxContextMenuItem>
        <TxContextMenuItem danger @select="() => {}">Delete</TxContextMenuItem>
      </template>
    </TxContextMenu>
  </div>
</template>
