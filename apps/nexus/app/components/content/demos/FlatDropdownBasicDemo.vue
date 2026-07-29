<script setup lang="ts">
import { ref } from 'vue'

const lastAction = ref<string>('—')

function pick(action: string) {
  lastAction.value = action
}
</script>

<template>
  <div class="tx-demo tx-demo__col">
    <TxFlatDropdown trigger="hover" placement="bottom-start" :offset="10" close-on-content-click>
      <template #trigger="{ open }">
        <TxButton size="sm" :variant="open ? 'primary' : 'secondary'">
          Actions
        </TxButton>
      </template>

      <div class="tx-demo__menu">
        <button type="button" class="tx-demo__menu-item" @click="pick('Duplicate')">
          Duplicate
        </button>
        <button type="button" class="tx-demo__menu-item" @click="pick('Rename')">
          Rename
        </button>
        <button type="button" class="tx-demo__menu-item" @click="pick('Archive')">
          Archive
        </button>
      </div>
    </TxFlatDropdown>

    <TxCard variant="plain" background="mask" :padding="10" :radius="14">
      <div class="tx-demo__meta">
        last action: {{ lastAction }}
      </div>
    </TxCard>
  </div>
</template>

<style scoped>
.tx-demo__menu {
  display: flex;
  flex-direction: column;
  min-width: 160px;
  padding: 4px;
}

.tx-demo__menu-item {
  padding: 8px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.tx-demo__menu-item:hover {
  background: rgb(128 128 128 / 15%);
}
</style>
