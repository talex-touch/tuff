<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxBreadcrumb
          :items="[
            { label: '首页', href: '/' },
            { label: '资料库', href: '/library' },
            { label: '数据' },
          ]"
        />
  </div>
  <div v-else>
        <TxBreadcrumb
          :items="[
            { label: 'Home', href: '/' },
            { label: 'Library', href: '/library' },
            { label: 'Data' },
          ]"
        />
  </div>
</template>
