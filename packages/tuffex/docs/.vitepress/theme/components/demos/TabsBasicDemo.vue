<script setup lang="ts">
import { ref } from 'vue'

const active = ref('General')
</script>

<template>
  <div style="height: 320px;">
    <TxTabs v-model="active">
      <TxTabItem name="General" icon-class="i-carbon-settings" activation>
        <div style="padding: 8px;">
          <h3 style="margin: 0 0 8px;">
            General
          </h3>
          <p style="margin: 0; color: var(--tx-text-color-secondary);">
            Basic settings content
          </p>
        </div>
      </TxTabItem>
      <TxTabItem name="Account" icon-class="i-carbon-user">
        <div style="padding: 8px;">
          <h3 style="margin: 0 0 8px;">
            Account
          </h3>
          <p style="margin: 0; color: var(--tx-text-color-secondary);">
            Account settings content
          </p>
        </div>
      </TxTabItem>
      <TxTabItem name="About" icon-class="i-carbon-information">
        <div style="padding: 8px;">
          <h3 style="margin: 0 0 8px;">
            About
          </h3>
          <p style="margin: 0; color: var(--tx-text-color-secondary);">
            About content
          </p>
        </div>
      </TxTabItem>
    </TxTabs>
  </div>
</template>
