<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxOutlineBorder :ring-width="2" ring-color="var(--tx-color-primary)" :offset="2" offset-bg="var(--tx-bg-color)">
          <TxAvatar src="https://avatars.githubusercontent.com/u/1?v=4" />
        </TxOutlineBorder>
  
        <TxOutlineBorder
          variant="border"
          :border-width="2"
          border-color="var(--tx-border-color)"
          :padding="2"
          shape="rect"
          :border-radius="12"
        >
          <img
            src="https://avatars.githubusercontent.com/u/2?v=4"
            style="width:40px;height:40px;object-fit:cover;border-radius:12px;"
          >
        </TxOutlineBorder>
  </div>
  <div v-else>
        <TxOutlineBorder :ring-width="2" ring-color="var(--tx-color-primary)" :offset="2" offset-bg="var(--tx-bg-color)">
          <TxAvatar src="https://avatars.githubusercontent.com/u/1?v=4" />
        </TxOutlineBorder>
  
        <TxOutlineBorder
          variant="border"
          :border-width="2"
          border-color="var(--tx-border-color)"
          :padding="2"
          shape="rect"
          :border-radius="12"
        >
          <img
            src="https://avatars.githubusercontent.com/u/2?v=4"
            style="width:40px;height:40px;object-fit:cover;border-radius:12px;"
          >
        </TxOutlineBorder>
  </div>
</template>
