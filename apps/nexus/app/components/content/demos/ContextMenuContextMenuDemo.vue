<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const controlledOpen = ref(false)
const x = ref('')
const y = ref('')
const openAtCenter = () => {}
</script>

<template>
  <div v-if="locale === 'zh'">
      <div style="display: grid; gap: 12px; width: 520px;">
        <div style="display: flex; gap: 8px; align-items: center;">
          <TxButton type="primary" @click="openAtCenter">
            Open controlled menu
          </TxButton>
          <TxButton @click="controlledOpen = false">
            Close
          </TxButton>
        </div>

        <TxContextMenu
          v-model="controlledOpen"
          :x="x"
          :y="y"
          @open="() => {}"
        >
          <template #menu>
            <TxContextMenuItem @select="() => {}">
              Copy
            </TxContextMenuItem>
            <TxContextMenuItem @select="() => {}">
              Paste
            </TxContextMenuItem>
            <TxContextMenuItem danger @select="() => {}">
              Delete
            </TxContextMenuItem>
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
            <TxContextMenuItem @select="() => {}">
              Refresh
            </TxContextMenuItem>
            <TxContextMenuItem @select="() => {}">
              Rename
            </TxContextMenuItem>
            <TxContextMenuItem danger @select="() => {}">
              Delete
            </TxContextMenuItem>
          </template>
        </TxContextMenu>
      </div>
  </div>
  <div v-else>
      <div style="display: grid; gap: 12px; width: 520px;">
        <div style="display: flex; gap: 8px; align-items: center;">
          <TxButton type="primary" @click="openAtCenter">
            Open controlled menu
          </TxButton>
          <TxButton @click="controlledOpen = false">
            Close
          </TxButton>
        </div>

        <TxContextMenu
          v-model="controlledOpen"
          :x="x"
          :y="y"
          @open="() => {}"
        >
          <template #menu>
            <TxContextMenuItem @select="() => {}">
              Copy
            </TxContextMenuItem>
            <TxContextMenuItem @select="() => {}">
              Paste
            </TxContextMenuItem>
            <TxContextMenuItem danger @select="() => {}">
              Delete
            </TxContextMenuItem>
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
            <TxContextMenuItem @select="() => {}">
              Refresh
            </TxContextMenuItem>
            <TxContextMenuItem @select="() => {}">
              Rename
            </TxContextMenuItem>
            <TxContextMenuItem danger @select="() => {}">
              Delete
            </TxContextMenuItem>
          </template>
        </TxContextMenu>
      </div>
  </div>
</template>
