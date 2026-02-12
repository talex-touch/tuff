<template>
  <div style="display: flex; flex-direction: column; gap: 12px;">
    <TxGlowText style="font-size: 20px; font-weight: 700;">
      GlowText
    </TxGlowText>

    <TxGlowText :angle="12" :band-size="42" :duration-ms="2200" :opacity="0.6" style="font-size: 14px; font-weight: 500;">
      Subtle sweep for captions
    </TxGlowText>

    <TxGlowText :angle="-18" :band-size="30" :duration-ms="1400" color="rgba(99, 102, 241, 0.9)" style="font-size: 15px; font-weight: 600;">
      Sweep highlight over text
    </TxGlowText>

    <TxGlowText :angle="20" :band-size="34" :duration-ms="1600" style="font-size: 16px; font-weight: 700;">
      <span style="background: linear-gradient(90deg, #f59e0b, #ef4444, #8b5cf6); -webkit-background-clip: text; color: transparent;">
        Colorful text still shines
      </span>
    </TxGlowText>
  </div>
</template>
