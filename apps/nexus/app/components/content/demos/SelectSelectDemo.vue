<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const value = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
      &lt;template&gt;
        &lt;TuffSelect v-model="value" placeholder="请选择"&gt;
          &lt;TuffSelectItem value="option1" label="选项 1" /&gt;
          &lt;TuffSelectItem value="option2" label="选项 2" /&gt;
          &lt;TuffSelectItem value="option3" label="选项 3" /&gt;
        &lt;/TuffSelect&gt;
      &lt;/template&gt;
  </div>
  <div v-else>
      &lt;template&gt;
        &lt;TuffSelect v-model="value" placeholder="请选择"&gt;
          &lt;TuffSelectItem value="option1" label="选项 1" /&gt;
          &lt;TuffSelectItem value="option2" label="选项 2" /&gt;
          &lt;TuffSelectItem value="option3" label="选项 3" /&gt;
        &lt;/TuffSelect&gt;
      &lt;/template&gt;
  </div>
</template>
