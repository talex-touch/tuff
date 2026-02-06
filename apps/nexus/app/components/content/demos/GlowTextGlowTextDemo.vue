<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <TxGlowText style="font-size: 20px; font-weight: 700;">
          GlowText
        </TxGlowText>

        <TxGlowText :angle="-15" :band-size="26" :duration-ms="1100" color="rgba(99, 102, 241, 0.9)" style="font-size: 14px;">
          Sweep highlight over text
        </TxGlowText>

        <TxGlowText :angle="18" :band-size="32" :duration-ms="1500" style="font-size: 16px; font-weight: 700;">
          <span style="background: linear-gradient(90deg, #f59e0b, #ef4444, #8b5cf6); -webkit-background-clip: text; color: transparent;">
            Colorful text still shines
          </span>
        </TxGlowText>
      </div>
  </div>
  <div v-else>
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <TxGlowText style="font-size: 20px; font-weight: 700;">
          GlowText
        </TxGlowText>

        <TxGlowText :angle="-15" :band-size="26" :duration-ms="1100" color="rgba(99, 102, 241, 0.9)" style="font-size: 14px;">
          Sweep highlight over text
        </TxGlowText>

        <TxGlowText :angle="18" :band-size="32" :duration-ms="1500" style="font-size: 16px; font-weight: 700;">
          <span style="background: linear-gradient(90deg, #f59e0b, #ef4444, #8b5cf6); -webkit-background-clip: text; color: transparent;">
            Colorful text still shines
          </span>
        </TxGlowText>
      </div>
  </div>
</template>
