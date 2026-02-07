<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const enabled = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
    <div style="display: flex; flex-direction: column; gap: 10px; width: 360px;">
      <TxCardItem
        title="Talex"
        subtitle="@talex"
        description="A reusable card item with avatar on the left and content on the right."
        avatar-text="T"
        clickable
      />

      <TxCardItem
        title="Downloads"
        description="Show as icon avatar"
        icon-class="i-carbon-download"
      />

      <TxCardItem
        title="Enable feature"
        description="Right area supports arbitrary actions"
        icon-class="i-carbon-settings"
      >
        <template #right>
          <TxSwitch v-model="enabled" />
          <i class="i-carbon-chevron-right" style="font-size: 18px; color: var(--tx-text-color-secondary);" />
        </template>
      </TxCardItem>
    </div>
  </div>
  <div v-else>
    <div style="display: flex; flex-direction: column; gap: 10px; width: 360px;">
      <TxCardItem
        title="Talex"
        subtitle="@talex"
        description="A reusable card item with avatar on the left and content on the right."
        avatar-text="T"
        clickable
      />

      <TxCardItem
        title="Downloads"
        description="Show as icon avatar"
        icon-class="i-carbon-download"
      />

      <TxCardItem
        title="Enable feature"
        description="Right area supports arbitrary actions"
        icon-class="i-carbon-settings"
      >
        <template #right>
          <TxSwitch v-model="enabled" />
          <i class="i-carbon-chevron-right" style="font-size: 18px; color: var(--tx-text-color-secondary);" />
        </template>
      </TxCardItem>
    </div>
  </div>
</template>
