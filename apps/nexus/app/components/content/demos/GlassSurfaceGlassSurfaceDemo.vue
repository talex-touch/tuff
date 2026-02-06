<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxGlassSurface :width="360" :height="160" :border-radius="20" :background-opacity="0">
          <div style="padding: 16px; font-weight: 700;">
GlassSurface
</div>
        </TxGlassSurface>
  </div>
  <div v-else>
        <TxGlassSurface :width="360" :height="160" :border-radius="20" :background-opacity="0">
          <div style="padding: 16px; font-weight: 700;">
GlassSurface
</div>
        </TxGlassSurface>
  </div>
</template>
