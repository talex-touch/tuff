<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const value = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
      &lt;template&gt;
        &lt;TuffSelect v-model="value" placeholder="禁用状态" disabled&gt;
          &lt;TuffSelectItem value="option1" label="选项 1" /&gt;
        &lt;/TuffSelect&gt;
      &lt;/template&gt;
  </div>
  <div v-else>
      &lt;template&gt;
        &lt;TuffSelect v-model="value" placeholder="禁用状态" disabled&gt;
          &lt;TuffSelectItem value="option1" label="选项 1" /&gt;
        &lt;/TuffSelect&gt;
      &lt;/template&gt;
  </div>
</template>
