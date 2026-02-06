<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <TuffSwitch :model-value="false" />
        <TuffSwitch :model-value="true" />
  </div>
  <div v-else>
        <TuffSwitch :model-value="false" />
        <TuffSwitch :model-value="true" />
  </div>
</template>
