<template>
  <div style="display: flex; flex-direction: column; gap: 12px;">
    <TxGlowText
      mode="text-clip"
      :band-size="24"
      :duration-ms="1300"
      :opacity="0.95"
      color="rgba(255, 255, 255, 0.98)"
      style="font-size: 20px; font-weight: 700; color: var(--tx-text-color-secondary, #a9b1bd);"
    >
      GlowText
    </TxGlowText>

    <TxGlowText
      mode="text-clip"
      :angle="18"
      :band-size="26"
      :duration-ms="1700"
      :opacity="0.92"
      color="rgba(125, 211, 252, 0.95)"
      style="font-size: 14px; font-weight: 500; color: var(--tx-text-color-secondary, #9ea8b7);"
    >
      Subtle sweep for captions
    </TxGlowText>

    <TxGlowText mode="text-clip" :angle="18" :band-size="30" :duration-ms="1400" color="rgba(99, 102, 241, 0.9)" style="font-size: 15px; font-weight: 600;">
      Sweep highlight over text
    </TxGlowText>

    <TxGlowText mode="text-clip" :angle="20" :band-size="34" :duration-ms="1600" style="font-size: 16px; font-weight: 700;">
      <span style="background: linear-gradient(90deg, #f59e0b, #ef4444, #8b5cf6); -webkit-background-clip: text; color: transparent;">
        Colorful text still shines
      </span>
    </TxGlowText>
  </div>
</template>
