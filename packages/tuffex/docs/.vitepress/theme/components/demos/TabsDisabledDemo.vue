<script setup lang="ts">
import { ref } from 'vue'

const active = ref('General')
</script>

<template>
  <div style="height: 280px;">
    <TxTabs v-model="active">
      <TxTabItem name="General" icon-class="i-carbon-settings" activation>
        <div style="padding: 8px;">
          <h3 style="margin: 0 0 8px;">
            General
          </h3>
          <p style="margin: 0; color: var(--tx-text-color-secondary);">
            Basic settings are active.
          </p>
        </div>
      </TxTabItem>
      <TxTabItem name="Billing" icon-class="i-carbon-wallet" disabled>
        <div style="padding: 8px;">
          Billing is disabled and cannot become active.
        </div>
      </TxTabItem>
      <TxTabItem name="About" icon-class="i-carbon-information">
        <div style="padding: 8px;">
          About content
        </div>
      </TxTabItem>
    </TxTabs>
  </div>
</template>
