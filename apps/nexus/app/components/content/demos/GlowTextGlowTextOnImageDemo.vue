<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
      <TxGlowText tag="div" :radius="14" :angle="20" :band-size="34" :duration-ms="1600" color="rgba(255, 255, 255, 0.95)">
        <div
          style="width: 240px; height: 120px; border-radius: 14px; background: linear-gradient(135deg, #111827, #0f766e); border: 1px solid var(--tx-border-color-light);"
        />
      </TxGlowText>
  </div>
  <div v-else>
      <TxGlowText tag="div" :radius="14" :angle="20" :band-size="34" :duration-ms="1600" color="rgba(255, 255, 255, 0.95)">
        <div
          style="width: 240px; height: 120px; border-radius: 14px; background: linear-gradient(135deg, #111827, #0f766e); border: 1px solid var(--tx-border-color-light);"
        />
      </TxGlowText>
  </div>
</template>
