<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const i = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
    <TxGridLayout>
      <div v-for="itemIndex in 6" :key="itemIndex" class="tx-grid-layout__item" style="padding: 16px;">
        Item {{ itemIndex }}
      </div>
    </TxGridLayout>
  </div>
  <div v-else>
    <TxGridLayout>
      <div v-for="itemIndex in 6" :key="itemIndex" class="tx-grid-layout__item" style="padding: 16px;">
        Item {{ itemIndex }}
      </div>
    </TxGridLayout>
  </div>
</template>
