<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxCornerOverlay placement="bottom-right" :offset-x="-2" :offset-y="-2">
          <TxAvatar src="https://avatars.githubusercontent.com/u/4?v=4" />
          <template #overlay>
            <span style="width:12px;height:12px;border-radius:999px;background:#22c55e;border:2px solid var(--tx-bg-color);" />
          </template>
        </TxCornerOverlay>
  
        <TxCornerOverlay placement="top-right" :offset-x="-4" :offset-y="-4">
          <TxAvatar src="https://avatars.githubusercontent.com/u/5?v=4" />
          <template #overlay>
            <span style="background:var(--tx-bg-color);border-radius:999px;padding:2px;box-shadow:0 1px 6px rgba(0,0,0,.12);">
              <TxIcon name="i-carbon-checkmark-filled" style="font-size:18px;color:var(--tx-color-primary);" />
            </span>
          </template>
        </TxCornerOverlay>
  </div>
  <div v-else>
        <TxCornerOverlay placement="bottom-right" :offset-x="-2" :offset-y="-2">
          <TxAvatar src="https://avatars.githubusercontent.com/u/4?v=4" />
          <template #overlay>
            <span style="width:12px;height:12px;border-radius:999px;background:#22c55e;border:2px solid var(--tx-bg-color);" />
          </template>
        </TxCornerOverlay>
  
        <TxCornerOverlay placement="top-right" :offset-x="-4" :offset-y="-4">
          <TxAvatar src="https://avatars.githubusercontent.com/u/5?v=4" />
          <template #overlay>
            <span style="background:var(--tx-bg-color);border-radius:999px;padding:2px;box-shadow:0 1px 6px rgba(0,0,0,.12);">
              <TxIcon name="i-carbon-checkmark-filled" style="font-size:18px;color:var(--tx-color-primary);" />
            </span>
          </template>
        </TxCornerOverlay>
  </div>
</template>
