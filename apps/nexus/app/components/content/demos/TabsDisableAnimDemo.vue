<script setup lang="ts">
import { ref } from 'vue'

const active = ref('Left1')
</script>

<template>
  <div style="height: 240px;">
    <TxTabs
      v-model="active"
      placement="bottom"
      :animation="{ indicator: false, content: false }"
    >
      <TxTabItem name="Left1" activation>
        <div style="padding: 10px;">
          Bottom - No animations
        </div>
      </TxTabItem>
      <TxTabItem name="Left2">
        <div style="padding: 10px;">
          Bottom - No animations 2
        </div>
      </TxTabItem>
      <TxTabItem name="Left3">
        <div style="padding: 10px;">
          Bottom - No animations 3
        </div>
      </TxTabItem>
    </TxTabs>
  </div>
</template>
