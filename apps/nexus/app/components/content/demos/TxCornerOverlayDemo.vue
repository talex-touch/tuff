<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
    <div style="display:flex; gap:16px; align-items:center;">
      <TxCornerOverlay placement="bottom-right" :offset-x="-2" :offset-y="-2">
        <TxAvatar src="https://avatars.githubusercontent.com/u/4?v=4" />
        <template #overlay>
          <span style="width:12px;height:12px;border-radius:999px;background:#22c55e;border:2px solid var(--tx-bg-color);" />
        </template>
      </TxCornerOverlay>
    </div>
  </div>
  <div v-else>
    <div style="display:flex; gap:16px; align-items:center;">
      <TxCornerOverlay placement="bottom-right" :offset-x="-2" :offset-y="-2">
        <TxAvatar src="https://avatars.githubusercontent.com/u/4?v=4" />
        <template #overlay>
          <span style="width:12px;height:12px;border-radius:999px;background:#22c55e;border:2px solid var(--tx-bg-color);" />
        </template>
      </TxCornerOverlay>
    </div>
  </div>
</template>
