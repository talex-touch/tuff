<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const enabled = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxCardItem title="Enable feature" description="Right area supports actions" icon-class="i-carbon-settings">
          <template #right>
            <TxSwitch v-model="enabled" />
            <i class="i-carbon-chevron-right" />
          </template>
        </TxCardItem>
  </div>
  <div v-else>
        <TxCardItem title="Enable feature" description="Right area supports actions" icon-class="i-carbon-settings">
          <template #right>
            <TxSwitch v-model="enabled" />
            <i class="i-carbon-chevron-right" />
          </template>
        </TxCardItem>
  </div>
</template>
