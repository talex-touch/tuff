<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <div style="display: flex; gap: 12px; align-items: center;">
          <TxAvatar icon="user" />
          <TxAvatar icon="team" />
        </div>
  </div>
  <div v-else>
        <div style="display: flex; gap: 12px; align-items: center;">
          <TxAvatar icon="user" />
          <TxAvatar icon="team" />
        </div>
  </div>
</template>
