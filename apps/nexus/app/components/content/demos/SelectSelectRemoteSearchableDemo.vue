<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const remoteOptions = ref([])
const value = ref('')
const onSearch = () => {}
</script>

<template>
  <div v-if="locale === 'zh'">
      &lt;script setup lang="ts"&gt;
      import { ref } from 'vue'
  
      const value = ref('')
      const remoteOptions = ref&lt;Array&lt;{ value: string; label: string }&gt;&gt;([])
  
      async function onSearch(q: string) {
        // remote request
        // remoteOptions.value = await fetch(...)
      }
      &lt;/script&gt;
  
      &lt;template&gt;
        &lt;TuffSelect v-model="value" remote editable @search="onSearch"&gt;
          &lt;TuffSelectItem v-for="o in remoteOptions" :key="o.value" :value="o.value" :label="o.label" /&gt;
        &lt;/TuffSelect&gt;
      &lt;/template&gt;
  </div>
  <div v-else>
      &lt;script setup lang="ts"&gt;
      import { ref } from 'vue'
  
      const value = ref('')
      const remoteOptions = ref&lt;Array&lt;{ value: string; label: string }&gt;&gt;([])
  
      async function onSearch(q: string) {
        // remote request
        // remoteOptions.value = await fetch(...)
      }
      &lt;/script&gt;
  
      &lt;template&gt;
        &lt;TuffSelect v-model="value" remote editable @search="onSearch"&gt;
          &lt;TuffSelectItem v-for="o in remoteOptions" :key="o.value" :value="o.value" :label="o.label" /&gt;
        &lt;/TuffSelect&gt;
      &lt;/template&gt;
  </div>
</template>
