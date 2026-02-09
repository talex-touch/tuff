<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const checked = ref(false)
</script>

<template>
  <div v-if="locale === 'zh'">
      &lt;template&gt;
        &lt;TxCheckbox v-model="checked"&gt;
          &lt;span&gt;自定义标签&lt;/span&gt;
        &lt;/TxCheckbox&gt;
      &lt;/template&gt;
  </div>
  <div v-else>
      &lt;template&gt;
        &lt;TxCheckbox v-model="checked"&gt;
          &lt;span&gt;自定义标签&lt;/span&gt;
        &lt;/TxCheckbox&gt;
      &lt;/template&gt;
  </div>
</template>
