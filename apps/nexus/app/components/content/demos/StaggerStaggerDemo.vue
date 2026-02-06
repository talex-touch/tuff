<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const items = ref([])
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxStagger tag="div" :delay-step="30" :duration="180">
          <div v-for="item in items" :key="item.id">
{{ item.text }}
</div>
        </TxStagger>
  </div>
  <div v-else>
        <TxStagger tag="div" :delay-step="30" :duration="180">
          <div v-for="item in items" :key="item.id">
{{ item.text }}
</div>
        </TxStagger>
  </div>
</template>
