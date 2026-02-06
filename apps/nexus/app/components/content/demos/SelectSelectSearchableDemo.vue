<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const i = ref('')
const value = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
      &lt;template&gt;
        &lt;TuffSelect v-model="value" placeholder="Searchable" searchable&gt;
          &lt;TuffSelectItem v-for="i in 30" :key="i" :value="`option${i}`" :label="`Option ${i}`" /&gt;
        &lt;/TuffSelect&gt;
      &lt;/template&gt;
  </div>
  <div v-else>
      &lt;template&gt;
        &lt;TuffSelect v-model="value" placeholder="Searchable" searchable&gt;
          &lt;TuffSelectItem v-for="i in 30" :key="i" :value="`option${i}`" :label="`Option ${i}`" /&gt;
        &lt;/TuffSelect&gt;
      &lt;/template&gt;
  </div>
</template>
