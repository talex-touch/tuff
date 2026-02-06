<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <div style="display: flex; gap: 12px; align-items: center;">
          <TxAvatar src="https://avatars.githubusercontent.com/u/1?v=4" />
          <TxAvatar name="Talex DreamSoul" />
          <TxAvatar icon="user" />
          <TxAvatar>U</TxAvatar>
        </div>
  </div>
  <div v-else>
        <div style="display: flex; gap: 12px; align-items: center;">
          <TxAvatar src="https://avatars.githubusercontent.com/u/1?v=4" />
          <TxAvatar name="Talex DreamSoul" />
          <TxAvatar icon="user" />
          <TxAvatar>U</TxAvatar>
        </div>
  </div>
</template>
