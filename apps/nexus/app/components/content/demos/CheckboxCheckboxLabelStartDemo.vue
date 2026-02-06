<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const checked = ref(false)
</script>

<template>
  <div v-if="locale === 'zh'">
      &lt;template&gt;
        &lt;TxCheckbox v-model="checked" label="我在前面" label-placement="start" /&gt;
      &lt;/template&gt;
  </div>
  <div v-else>
      &lt;template&gt;
        &lt;TxCheckbox v-model="checked" label="我在前面" label-placement="start" /&gt;
      &lt;/template&gt;
  </div>
</template>
